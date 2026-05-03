package handlers

import (
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

type TaskHandler struct {
	q   db.Querier
	val *validator.Validate
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
	schema := json.RawMessage("{}")
	if req.SubmissionSchema != nil {
		schema = *req.SubmissionSchema
	}
	task, err := h.q.CreateTask(c.Request().Context(), db.CreateTaskParams{
		ContestID:           contestID,
		Slug:                req.Slug,
		Title:               req.Title,
		Description:         req.Description,
		ProblemStatementUrl: req.ProblemStatementURL,
		SubmissionSchema:    schema,
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
	return c.JSON(http.StatusCreated, dto.TaskToResponse(task))
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
	return c.JSON(http.StatusOK, dto.TaskToResponse(task))
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
