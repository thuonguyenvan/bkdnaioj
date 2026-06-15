package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/mank1/olpai-backend/internal/storage"
)

type submissionSchemaTaskAssets struct {
	TaskAssets struct {
		RequiredAssets []string `json:"required_assets"`
	} `json:"task_assets"`
}

type TaskHandler struct {
	q      db.Querier
	val    *validator.Validate
	jwtMgr *security.JWTManager
	s3     *storage.S3
}

func (h *TaskHandler) populateTaskAssets(ctx context.Context, resp *dto.TaskResponse) {
	assets, err := h.q.ListTaskAssets(ctx, resp.ID)
	if err != nil {
		return
	}
	var schema submissionSchemaTaskAssets
	if err := json.Unmarshal(resp.SubmissionSchema, &schema); err == nil && len(schema.TaskAssets.RequiredAssets) > 0 {
		resp.RequiredAssets = schema.TaskAssets.RequiredAssets
	}
	resp.Assets = make([]dto.TaskAssetResponse, 0, len(assets))
	resp.AssetKeys = make([]string, 0, len(assets))
	for _, a := range assets {
		resp.Assets = append(resp.Assets, dto.TaskAssetToResponse(a))
		resp.AssetKeys = append(resp.AssetKeys, a.AssetKey)
	}
}

func NewTaskHandler(q db.Querier, jwtMgr *security.JWTManager, s3 *storage.S3) *TaskHandler {
	return &TaskHandler{q: q, val: validator.New(), jwtMgr: jwtMgr, s3: s3}
}

func (h *TaskHandler) getOptionalIdentity(c echo.Context) (uuid.UUID, string, bool) {
	if h.jwtMgr == nil {
		return uuid.Nil, "", false
	}
	header := c.Request().Header.Get("Authorization")
	if header == "" {
		return uuid.Nil, "", false
	}
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

func (h *TaskHandler) checkContestAccess(c echo.Context, contestID uuid.UUID) error {
	userID, role, authenticated := h.getOptionalIdentity(c)
	if role == "admin" {
		return nil
	}

	contest, err := h.q.GetContestByID(c.Request().Context(), contestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("contest not found")
		}
		return mw.ErrInternal("fetch contest failed")
	}

	if contest.Visibility == db.ContestVisibilityPrivate {
		if !authenticated {
			return mw.ErrForbidden("private contest")
		}
		allowed, err := h.q.UserHasContestAccess(c.Request().Context(), db.UserHasContestAccessParams{
			ContestID: contestID,
			UserID:    dto.ToPgUUID(userID),
		})
		if err != nil {
			return mw.ErrInternal("check contest access failed")
		}
		if !allowed {
			return mw.ErrForbidden("private contest")
		}
	}

	if contest.Status == db.ContestStatusDraft {
		return mw.ErrForbidden("contest not open yet")
	}

	if contest.StartTime.Time.After(time.Now()) {
		return mw.ErrForbidden("contest has not started yet")
	}

	return nil
}

// POST /api/v1/contests/:id/tasks
func (h *TaskHandler) Create(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var req dto.CreateTaskRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	schema := dto.DefaultSubmissionSchema
	if req.SubmissionSchema != nil {
		schema = *req.SubmissionSchema
	}
	task, err := h.q.CreateTask(c.Request().Context(), db.CreateTaskParams{
		ContestID:           contestID,
		Slug:                req.Slug,
		Title:               req.Title,
		Description:         req.Description,
		ProblemStatementUrl: req.ProblemStatementURL,
		Column6:             string(schema),
		ScoreLabel:          req.ScoreLabel,
		HigherIsBetter:      req.HigherIsBetter,
		SortOrder:           req.SortOrder,
		DatasetUrl:          req.DatasetURL,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("task slug already exists in this contest")
		}
		return mw.ErrInternal("create task failed")
	}
	for _, set := range []struct {
		key   db.EvaluationSetKey
		title string
	}{
		{key: db.EvaluationSetKeyPublic, title: "Public Evaluation Set"},
		{key: db.EvaluationSetKeyPrivate, title: "Private Evaluation Set"},
	} {
		if _, err := h.q.CreateEvaluationSet(c.Request().Context(), db.CreateEvaluationSetParams{
			TaskID: task.ID,
			Key:    set.key,
			Title:  set.title,
		}); err != nil {
			return mw.ErrInternal("create evaluation sets failed")
		}
	}
	resp := dto.TaskToResponse(task)
	h.populateTaskAssets(c.Request().Context(), &resp)
	return c.JSON(http.StatusCreated, resp)
}

// GET /api/v1/contests/:id/tasks
func (h *TaskHandler) ListByContest(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	if err := h.checkContestAccess(c, contestID); err != nil {
		return err
	}
	tasks, err := h.q.ListTasksByContest(c.Request().Context(), contestID)
	if err != nil {
		return mw.ErrInternal("list tasks failed")
	}
	resp := make([]dto.TaskResponse, len(tasks))
	for i, t := range tasks {
		resp[i] = dto.TaskToResponse(t)
		h.populateTaskAssets(c.Request().Context(), &resp[i])
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/tasks/:id
func (h *TaskHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	task, err := h.q.GetTaskByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("task not found")
		}
		return mw.ErrInternal("fetch task failed")
	}
	if err := h.checkContestAccess(c, task.ContestID); err != nil {
		return err
	}
	resp := dto.TaskToResponse(task)
	h.populateTaskAssets(c.Request().Context(), &resp)
	return c.JSON(http.StatusOK, resp)
}

// PATCH /api/v1/tasks/:id
func (h *TaskHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	var req dto.UpdateTaskRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	var schema *string
	if req.SubmissionSchema != nil {
		s := string(*req.SubmissionSchema)
		schema = &s
	}
	task, err := h.q.UpdateTask(c.Request().Context(), db.UpdateTaskParams{
		ID:                  id,
		Title:               req.Title,
		Description:         req.Description,
		ProblemStatementUrl: req.ProblemStatementURL,
		SubmissionSchema:    schema,
		ScoreLabel:          req.ScoreLabel,
		HigherIsBetter:      req.HigherIsBetter,
		SortOrder:           req.SortOrder,
		DatasetUrl:          req.DatasetURL,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("task not found")
		}
		return mw.ErrInternal("update task failed")
	}
	resp := dto.TaskToResponse(task)
	h.populateTaskAssets(c.Request().Context(), &resp)
	return c.JSON(http.StatusOK, resp)
}

// DELETE /api/v1/tasks/:id
func (h *TaskHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	if err := h.q.DeleteTask(c.Request().Context(), id); err != nil {
		return mw.ErrInternal("delete task failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// GET /api/v1/tasks/:id/statement
func (h *TaskHandler) GetStatement(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}

	task, err := h.q.GetTaskByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("task not found")
		}
		return mw.ErrInternal("fetch task failed")
	}

	if err := h.checkContestAccess(c, task.ContestID); err != nil {
		return err
	}

	if task.ProblemStatementUrl == nil || *task.ProblemStatementUrl == "" {
		return mw.ErrNotFound("statement not found")
	}

	// If the statement URL is an external link, redirect to it
	if strings.HasPrefix(*task.ProblemStatementUrl, "http://") || strings.HasPrefix(*task.ProblemStatementUrl, "https://") {
		return c.Redirect(http.StatusFound, *task.ProblemStatementUrl)
	}

	// Otherwise, it's stored in S3 (e.g. key `tasks/:id/statement.pdf`)
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}

	objectKey := *task.ProblemStatementUrl
	// Safeguard in case it's a relative API path stored in DB
	if strings.HasPrefix(objectKey, "/api/v1") {
		objectKey = "tasks/" + id.String() + "/statement.pdf"
	}

	reader, err := h.s3.Get(c.Request().Context(), objectKey)
	if err != nil {
		return mw.ErrNotFound("file not found in storage")
	}
	defer reader.Close()

	c.Response().Header().Set(echo.HeaderContentType, "application/pdf")
	c.Response().Header().Set(echo.HeaderContentDisposition, "inline; filename=\"statement.pdf\"")
	c.Response().WriteHeader(http.StatusOK)
	_, err = io.Copy(c.Response().Writer, reader)
	return err
}

// POST /api/v1/tasks/:id/statement
func (h *TaskHandler) UploadStatement(c echo.Context) error {
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}

	task, err := h.q.GetTaskByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("task not found")
		}
		return mw.ErrInternal("fetch task failed")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return mw.ErrBadRequest("missing file in form data")
	}

	src, err := file.Open()
	if err != nil {
		return mw.ErrInternal("failed to open uploaded file")
	}
	defer src.Close()

	// Upload to MinIO/S3
	objectKey := "tasks/" + task.ID.String() + "/statement.pdf"
	err = h.s3.Upload(c.Request().Context(), objectKey, src, file.Size, "application/pdf")
	if err != nil {
		return mw.ErrInternal("failed to upload file to storage")
	}

	// Update task in database
	statementURL := "/api/v1/tasks/" + task.ID.String() + "/statement"
	_, err = h.q.UpdateTask(c.Request().Context(), db.UpdateTaskParams{
		ID:                  task.ID,
		ProblemStatementUrl: &statementURL,
	})
	if err != nil {
		return mw.ErrInternal("failed to update task problem statement URL")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"problem_statement_url": statementURL,
	})
}
