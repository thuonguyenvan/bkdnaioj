package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type ContestHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewContestHandler(q db.Querier) *ContestHandler {
	return &ContestHandler{q: q, val: validator.New()}
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
	if req.RulesJSON != nil {
		raw := bytes.TrimSpace(*req.RulesJSON)
		if len(raw) > 0 && string(raw) != "null" && !json.Valid(raw) {
			return mw.ErrBadRequest("rules_json must be valid JSON")
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
		CreatedBy:         dto.ToPgUUID(uid),
		MaxTeamSize:       req.MaxTeamSize,
		RequireApproval:   req.RequireApproval,
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

	contests, err := h.q.ListContests(c.Request().Context(), db.ListContestsParams{
		Limit:  int32(limit),
		Offset: int32(offset),
		Status: dbStatus,
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

	var rulesJSON json.RawMessage
	if req.RulesJSON != nil {
		raw := bytes.TrimSpace(*req.RulesJSON)
		if len(raw) == 0 || string(raw) == "null" {
			rulesJSON = json.RawMessage("{}")
		} else {
			if !json.Valid(raw) {
				return mw.ErrBadRequest("rules_json must be valid JSON")
			}
			rulesJSON = json.RawMessage(raw)
		}
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
