package handlers

import (
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
	"github.com/mank1/olpai-backend/internal/storage"
)

type PhaseHandler struct {
	q   db.Querier
	s3  *storage.S3
	val *validator.Validate
}

func NewPhaseHandler(q db.Querier, s3 *storage.S3) *PhaseHandler {
	return &PhaseHandler{q: q, s3: s3, val: validator.New()}
}

// POST /api/v1/tasks/:id/phases
func (h *PhaseHandler) Create(c echo.Context) error {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	var req dto.CreatePhaseRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	phase, err := h.q.CreatePhase(c.Request().Context(), db.CreatePhaseParams{
		TaskID:              taskID,
		ContestPhaseDefID:   req.ContestPhaseDefID,
		EvaluationSetID:     req.EvaluationSetID,
		Slug:                req.Slug,
		Title:               req.Title,
		Description:         req.Description,
		OpenTime:            dto.ToPgTimestamptzVal(req.OpenTime),
		CloseTime:           dto.ToPgTimestamptzVal(req.CloseTime),
		JudgeKey:            req.JudgeKey,
		SubmissionLimit:     req.SubmissionLimit,
		LeaderboardMode:     db.LeaderboardMode(req.LeaderboardMode),
		AllowOfficialSubmit: req.AllowOfficialSubmit,
		AllowVirtualSubmit:  req.AllowVirtualSubmit,
		AllowPracticeSubmit: req.AllowPracticeSubmit,
		DisplayScores:       req.DisplayScores,
		IsFrozen:            false,
		IsFinal:             req.IsFinal,
		SortOrder:           req.SortOrder,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("phase slug or def already exists for this task")
		}
		return mw.ErrInternal("create phase failed: " + err.Error())
	}
	return c.JSON(http.StatusCreated, dto.PhaseToResponse(phase))
}

// GET /api/v1/phases/:id
func (h *PhaseHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase id")
	}
	phase, err := h.q.GetPhaseByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("phase not found")
		}
		return mw.ErrInternal("fetch phase failed")
	}
	return c.JSON(http.StatusOK, dto.PhaseToResponse(phase))
}

// GET /api/v1/tasks/:id/phases
func (h *PhaseHandler) ListByTask(c echo.Context) error {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	phases, err := h.q.ListPhasesByTask(c.Request().Context(), taskID)
	if err != nil {
		return mw.ErrInternal("list phases failed")
	}
	resp := make([]dto.PhaseResponse, len(phases))
	for i, p := range phases {
		resp[i] = dto.PhaseToResponse(p)
	}
	return c.JSON(http.StatusOK, resp)
}

// DELETE /api/v1/phases/:id
func (h *PhaseHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase id")
	}
	if err := h.q.DeletePhase(c.Request().Context(), id); err != nil {
		return mw.ErrInternal("delete phase failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// POST /api/v1/phases/:id/freeze
func (h *PhaseHandler) Freeze(c echo.Context) error {
	return h.setFrozen(c, true)
}

// POST /api/v1/phases/:id/unfreeze
func (h *PhaseHandler) Unfreeze(c echo.Context) error {
	return h.setFrozen(c, false)
}

func (h *PhaseHandler) setFrozen(c echo.Context, frozen bool) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase id")
	}
	phase, err := h.q.SetPhaseFrozen(c.Request().Context(), db.SetPhaseFrozenParams{
		ID: id, IsFrozen: frozen,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("phase not found")
		}
		return mw.ErrInternal("freeze failed")
	}
	return c.JSON(http.StatusOK, dto.PhaseToResponse(phase))
}
