package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type submissionSchemaTaskAssets struct {
	TaskAssets struct {
		RequiredAssets []string `json:"required_assets"`
	} `json:"task_assets"`
}

type TaskHandler struct {
	q   db.Querier
	val *validator.Validate
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

func NewTaskHandler(q db.Querier) *TaskHandler {
	return &TaskHandler{q: q, val: validator.New()}
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
