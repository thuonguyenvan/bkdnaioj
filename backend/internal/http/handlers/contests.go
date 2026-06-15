package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/security"
)

type ContestHandler struct {
	q      db.Querier
	val    *validator.Validate
	jwtMgr *security.JWTManager
}

type publishReadinessSchema struct {
	TaskAssets struct {
		RequiredAssets []string `json:"required_assets"`
	} `json:"task_assets"`
	Evaluation struct {
		RequiredAssets []string `json:"required_assets"`
	} `json:"evaluation"`
}

func NewContestHandler(q db.Querier, jwtManagers ...*security.JWTManager) *ContestHandler {
	var jwtMgr *security.JWTManager
	if len(jwtManagers) > 0 {
		jwtMgr = jwtManagers[0]
	}
	return &ContestHandler{q: q, val: validator.New(), jwtMgr: jwtMgr}
}

func (h *ContestHandler) optionalIdentity(c echo.Context) (uuid.UUID, string, bool) {
	if h.jwtMgr == nil {
		return uuid.Nil, "", false
	}
	header := c.Request().Header.Get("Authorization")
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return uuid.Nil, "", false
	}
	claims, err := h.jwtMgr.Verify(parts[1])
	if err != nil {
		return uuid.Nil, "", false
	}
	userID, err := security.UserIDFromClaims(claims)
	if err != nil {
		return uuid.Nil, "", false
	}
	return userID, claims.Role, true
}

// POST /api/v1/contests
func (h *ContestHandler) Create(c echo.Context) error {
	var req dto.CreateContestRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	uid := mw.GetUserID(c)
	rulesJSON := json.RawMessage("{}")
	if req.RulesJSON != nil {
		raw := bytes.TrimSpace(*req.RulesJSON)
		if len(raw) > 0 && string(raw) != "null" {
			if !json.Valid(raw) {
				return mw.ErrBadRequest("rules_json must be valid JSON")
			}
			rulesJSON = json.RawMessage(raw)
		}
	}

	contest, err := h.q.CreateContest(c.Request().Context(), db.CreateContestParams{
		Slug:              req.Slug,
		Title:             req.Title,
		Description:       req.Description,
		BannerUrl:         req.BannerURL,
		EntryPolicy:       db.ContestEntryPolicy(req.EntryPolicy),
		RegistrationStart: dto.ToPgTimestamptz(req.RegistrationStart),
		RegistrationEnd:   dto.ToPgTimestamptz(req.RegistrationEnd),
		StartTime:         dto.ToPgTimestamptzVal(req.StartTime),
		EndTime:           dto.ToPgTimestamptzVal(req.EndTime),
		Visibility:        db.ContestVisibility(req.Visibility),
		Column11:          string(rulesJSON),
		CreatedBy:         dto.ToPgUUID(uid),
		MaxTeamSize:       req.MaxTeamSize,
		RequireApproval:   req.RequireApproval,
		ScaleScores:       req.ScaleScores,
	})
	if err != nil {
		c.Logger().Errorf("create contest failed: %v", err)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("contest slug already taken")
		}
		return mw.ErrInternal("create contest failed")
	}
	return c.JSON(http.StatusCreated, dto.ContestToResponse(contest))
}

// GET /api/v1/contests
func (h *ContestHandler) List(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	statusFilter := c.QueryParam("status")

	var dbStatus *db.ContestStatus
	if statusFilter != "" {
		s := db.ContestStatus(statusFilter)
		dbStatus = &s
	}

	var visibility *db.ContestVisibility
	_, role, authenticated := h.optionalIdentity(c)
	if !authenticated || role != "admin" {
		public := db.ContestVisibilityPublic
		visibility = &public
	}

	contests, err := h.q.ListContests(c.Request().Context(), db.ListContestsParams{
		Limit:      int32(limit),
		Offset:     int32(offset),
		Status:     dbStatus,
		Visibility: visibility,
	})
	if err != nil {
		return mw.ErrInternal("list contests failed")
	}
	resp := make([]dto.ContestResponse, len(contests))
	for i, ct := range contests {
		resp[i] = dto.ContestToResponse(ct)
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/contests/:id
func (h *ContestHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	contest, err := h.q.GetContestByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("contest not found")
		}
		return mw.ErrInternal("fetch contest failed")
	}
	if contest.Visibility == db.ContestVisibilityPrivate {
		userID, role, authenticated := h.optionalIdentity(c)
		if !authenticated {
			return mw.ErrForbidden("private contest")
		}
		if role != "admin" {
			allowed, err := h.q.UserHasContestAccess(c.Request().Context(), db.UserHasContestAccessParams{
				ContestID: contest.ID,
				UserID:    dto.ToPgUUID(userID),
			})
			if err != nil {
				return mw.ErrInternal("check contest access failed")
			}
			if !allowed {
				return mw.ErrForbidden("private contest")
			}
		}
	}
	return c.JSON(http.StatusOK, dto.ContestToResponse(contest))
}

// PATCH /api/v1/contests/:id
func (h *ContestHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var req dto.UpdateContestRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	var rulesJSON *string
	if req.RulesJSON != nil {
		raw := bytes.TrimSpace(*req.RulesJSON)
		value := "{}"
		if len(raw) > 0 && string(raw) != "null" {
			if !json.Valid(raw) {
				return mw.ErrBadRequest("rules_json must be valid JSON")
			}
			value = string(raw)
		}
		rulesJSON = &value
	}

	var ep *db.ContestEntryPolicy
	if req.EntryPolicy != nil {
		v := db.ContestEntryPolicy(*req.EntryPolicy)
		ep = &v
	}
	var vis *db.ContestVisibility
	if req.Visibility != nil {
		v := db.ContestVisibility(*req.Visibility)
		vis = &v
	}

	contest, err := h.q.UpdateContest(c.Request().Context(), db.UpdateContestParams{
		ID:                id,
		Title:             req.Title,
		Description:       req.Description,
		BannerUrl:         req.BannerURL,
		EntryPolicy:       ep,
		RegistrationStart: dto.ToPgTimestamptz(req.RegistrationStart),
		RegistrationEnd:   dto.ToPgTimestamptz(req.RegistrationEnd),
		StartTime:         dto.ToPgTimestamptz(req.StartTime),
		EndTime:           dto.ToPgTimestamptz(req.EndTime),
		Visibility:        vis,
		RulesJson:         rulesJSON,
		MaxTeamSize:       req.MaxTeamSize,
		RequireApproval:   req.RequireApproval,
		ScaleScores:       req.ScaleScores,
	})
	if err != nil {
		c.Logger().Errorf("update contest failed: %v", err)
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("contest not found")
		}
		return mw.ErrInternal("update contest failed")
	}
	return c.JSON(http.StatusOK, dto.ContestToResponse(contest))
}

// DELETE /api/v1/contests/:id
func (h *ContestHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	if err := h.q.DeleteContest(c.Request().Context(), id); err != nil {
		return mw.ErrInternal("delete contest failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// POST /api/v1/contests/:id/publish
func (h *ContestHandler) Publish(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	if err := h.ensurePublishReady(c, id); err != nil {
		return err
	}
	return h.setStatus(c, db.ContestStatusRegistrationOpen)
}

// POST /api/v1/contests/:id/archive
func (h *ContestHandler) Archive(c echo.Context) error {
	return h.setStatus(c, db.ContestStatusArchived)
}

func (h *ContestHandler) setStatus(c echo.Context, s db.ContestStatus) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	contest, err := h.q.UpdateContestStatus(c.Request().Context(), db.UpdateContestStatusParams{ID: id, Status: s})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("contest not found")
		}
		return mw.ErrInternal("status update failed")
	}
	return c.JSON(http.StatusOK, dto.ContestToResponse(contest))
}

func (h *ContestHandler) ensurePublishReady(c echo.Context, contestID uuid.UUID) error {
	ctx := c.Request().Context()
	tasks, err := h.q.ListTasksByContest(ctx, contestID)
	if err != nil {
		return mw.ErrInternal("check contest tasks failed")
	}
	if len(tasks) == 0 {
		return mw.ErrBadRequest("contest is not ready to publish: create at least one task")
	}

	var missing []string
	for _, task := range tasks {
		taskRequired, evalRequired := publishRequiredAssets(task.SubmissionSchema)

		taskAssets, err := h.q.ListTaskAssets(ctx, task.ID)
		if err != nil {
			return mw.ErrInternal("check task assets failed")
		}
		taskAssetKeys := makeStringSetFromTaskAssets(taskAssets)
		for _, key := range taskRequired {
			if !taskAssetKeys[key] {
				missing = append(missing, "task "+task.Slug+" missing task asset "+key)
			}
		}

		evaluationSets, err := h.q.ListEvaluationSetsByTask(ctx, task.ID)
		if err != nil {
			return mw.ErrInternal("check evaluation sets failed")
		}
		if len(evaluationSets) == 0 {
			missing = append(missing, "task "+task.Slug+" missing evaluation sets")
			continue
		}
		for _, set := range evaluationSets {
			assets, err := h.q.ListEvaluationSetAssets(ctx, set.ID)
			if err != nil {
				return mw.ErrInternal("check evaluation assets failed")
			}
			assetKeys := makeStringSetFromEvaluationAssets(assets)
			for _, key := range evalRequired {
				if !assetKeys[key] {
					missing = append(missing, "task "+task.Slug+" "+string(set.Key)+" set missing asset "+key)
				}
			}
		}
	}

	if len(missing) > 0 {
		return mw.ErrBadRequest("contest is not ready to publish: " + strings.Join(missing, "; "))
	}
	return nil
}

func publishRequiredAssets(raw []byte) ([]string, []string) {
	taskRequired := []string{"judge.py"}
	evalRequired := []string{"ground_truth", "inputs"}
	var schema publishReadinessSchema
	if err := json.Unmarshal(raw, &schema); err != nil {
		return taskRequired, evalRequired
	}
	if len(schema.TaskAssets.RequiredAssets) > 0 {
		taskRequired = schema.TaskAssets.RequiredAssets
	}
	if len(schema.Evaluation.RequiredAssets) > 0 {
		evalRequired = schema.Evaluation.RequiredAssets
	}
	return taskRequired, evalRequired
}

func makeStringSetFromTaskAssets(assets []db.TaskAsset) map[string]bool {
	out := make(map[string]bool, len(assets))
	for _, a := range assets {
		out[a.AssetKey] = true
	}
	return out
}

func makeStringSetFromEvaluationAssets(assets []db.EvaluationSetAsset) map[string]bool {
	out := make(map[string]bool, len(assets))
	for _, a := range assets {
		out[a.AssetKey] = true
	}
	return out
}
