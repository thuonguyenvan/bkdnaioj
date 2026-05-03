package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type SubmissionHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewSubmissionHandler(q db.Querier) *SubmissionHandler {
	return &SubmissionHandler{q: q, val: validator.New()}
}

// POST /api/v1/entries/:entry_id/submissions — stub (no file upload yet)
func (h *SubmissionHandler) Create(c echo.Context) error {
	entryID, err := uuid.Parse(c.Param("entry_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	var req dto.CreateSubmissionRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	ctx := c.Request().Context()

	// Get entry to resolve contest_id
	entry, err := h.q.GetContestEntryByID(ctx, entryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("entry not found")
		}
		return mw.ErrInternal("fetch entry failed")
	}

	ip := c.RealIP()
	ua := c.Request().UserAgent()
	sub, err := h.q.CreateSubmission(ctx, db.CreateSubmissionParams{
		ContestID:      entry.ContestID,
		ContestEntryID: entryID,
		TaskID:         req.TaskID,
		PhaseID:        req.PhaseID,
		SubmittedBy:    uid,
		FileCount:      0, // stub — no file upload yet
		TotalSizeBytes: 0,
		ClientIp:       &ip,
		UserAgent:      &ua,
	})
	if err != nil {
		return mw.ErrInternal("create submission failed: " + err.Error())
	}
	return c.JSON(http.StatusCreated, dto.SubmissionToResponse(sub))
}

// GET /api/v1/submissions/:id
func (h *SubmissionHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	sub, err := h.q.GetSubmissionByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("submission not found")
		}
		return mw.ErrInternal("fetch submission failed")
	}
	return c.JSON(http.StatusOK, dto.SubmissionToResponse(sub))
}

// GET /api/v1/entries/:id/submissions
func (h *SubmissionHandler) ListByEntry(c echo.Context) error {
	entryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var taskFilter, phaseFilter pgtype.UUID
	if t := c.QueryParam("task_id"); t != "" {
		if v, e := uuid.Parse(t); e == nil {
			taskFilter = pgtype.UUID{Bytes: v, Valid: true}
		}
	}
	if p := c.QueryParam("phase_id"); p != "" {
		if v, e := uuid.Parse(p); e == nil {
			phaseFilter = pgtype.UUID{Bytes: v, Valid: true}
		}
	}
	subs, err := h.q.ListSubmissionsByEntry(c.Request().Context(), db.ListSubmissionsByEntryParams{
		ContestEntryID: entryID, Limit: int32(limit), Offset: int32(offset),
		TaskID: taskFilter, PhaseID: phaseFilter,
	})
	if err != nil {
		return mw.ErrInternal("list submissions failed")
	}
	resp := make([]dto.SubmissionResponse, len(subs))
	for i, s := range subs {
		resp[i] = dto.SubmissionToResponse(s)
	}
	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/submissions/:id/mark-final
func (h *SubmissionHandler) MarkFinal(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	sub, err := h.q.MarkSubmissionFinal(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("submission not found")
		}
		return mw.ErrInternal("mark final failed")
	}
	return c.JSON(http.StatusOK, dto.SubmissionToResponse(sub))
}
