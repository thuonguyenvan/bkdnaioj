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
)

type PhaseDefHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewPhaseDefHandler(q db.Querier) *PhaseDefHandler {
	return &PhaseDefHandler{q: q, val: validator.New()}
}

// POST /api/v1/contests/:id/phase-defs
func (h *PhaseDefHandler) Create(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var req dto.CreatePhaseDefRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	def, err := h.q.CreatePhaseDef(c.Request().Context(), db.CreatePhaseDefParams{
		ContestID: contestID,
		Key:       db.ContestPhaseKey(req.Key),
		Title:     req.Title,
		SortOrder: req.SortOrder,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("phase def key already exists for this contest")
		}
		return mw.ErrInternal("create phase def failed")
	}
	return c.JSON(http.StatusCreated, dto.PhaseDefToResponse(def))
}

// GET /api/v1/contests/:id/phase-defs
func (h *PhaseDefHandler) List(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	defs, err := h.q.ListPhaseDefsByContest(c.Request().Context(), contestID)
	if err != nil {
		return mw.ErrInternal("list phase defs failed")
	}
	resp := make([]dto.PhaseDefResponse, len(defs))
	for i, d := range defs {
		resp[i] = dto.PhaseDefToResponse(d)
	}
	return c.JSON(http.StatusOK, resp)
}

// PATCH /api/v1/contests/:id/phase-defs/:def_id
func (h *PhaseDefHandler) Update(c echo.Context) error {
	defID, err := uuid.Parse(c.Param("def_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase def id")
	}
	var body struct {
		Title     *string `json:"title,omitempty"`
		SortOrder *int32  `json:"sort_order,omitempty"`
	}
	if err := c.Bind(&body); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	def, err := h.q.UpdatePhaseDef(c.Request().Context(), db.UpdatePhaseDefParams{
		ID:        defID,
		Title:     body.Title,
		SortOrder: body.SortOrder,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("phase def not found")
		}
		return mw.ErrInternal("update phase def failed")
	}
	return c.JSON(http.StatusOK, dto.PhaseDefToResponse(def))
}

// DELETE /api/v1/contests/:id/phase-defs/:def_id
func (h *PhaseDefHandler) Delete(c echo.Context) error {
	defID, err := uuid.Parse(c.Param("def_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase def id")
	}
	if err := h.q.DeletePhaseDef(c.Request().Context(), defID); err != nil {
		return mw.ErrInternal("delete phase def failed")
	}
	return c.NoContent(http.StatusNoContent)
}
