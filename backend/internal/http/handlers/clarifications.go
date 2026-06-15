package handlers

import (
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type ClarificationHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewClarificationHandler(q db.Querier) *ClarificationHandler {
	return &ClarificationHandler{q: q, val: validator.New()}
}

// POST /api/v1/contests/:id/clarifications
func (h *ClarificationHandler) Create(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var req dto.CreateClarificationRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	// In V1 we use a placeholder entry_id from query param
	entryID, err := uuid.Parse(c.QueryParam("entry_id"))
	if err != nil {
		return mw.ErrBadRequest("entry_id query param required")
	}
	cl, err := h.q.CreateClarification(c.Request().Context(), db.CreateClarificationParams{
		ContestID:      contestID,
		TaskID:         dto.UUIDToPgUUID(req.TaskID),
		PhaseID:        dto.UUIDToPgUUID(req.PhaseID),
		ContestEntryID: entryID,
		Question:       req.Question,
		AskedBy:        uid,
	})
	if err != nil {
		return mw.ErrInternal("create clarification failed: " + err.Error())
	}
	return c.JSON(http.StatusCreated, dto.ClarificationToResponse(cl))
}

// GET /api/v1/contests/:id/clarifications
func (h *ClarificationHandler) List(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var status *db.ClarificationStatus
	if s := c.QueryParam("status"); s != "" {
		v := db.ClarificationStatus(s)
		status = &v
	}
	uid := mw.GetUserID(c)
	role, _ := c.Get(mw.CtxRole).(string)
	items, err := h.q.ListClarificationsByContest(c.Request().Context(), db.ListClarificationsByContestParams{
		ContestID:  contestID,
		Status:     status,
		IncludeAll: role == "admin",
		ViewerID:   uid,
	})
	if err != nil {
		return mw.ErrInternal("list clarifications failed")
	}
	resp := make([]dto.ClarificationResponse, len(items))
	for i, cl := range items {
		resp[i] = dto.ClarificationToResponse(cl)
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/clarifications/:id
func (h *ClarificationHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid id")
	}
	cl, err := h.q.GetClarificationByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("clarification not found")
		}
		return mw.ErrInternal("fetch failed")
	}
	role, _ := c.Get(mw.CtxRole).(string)
	if role != "admin" && cl.AskedBy != mw.GetUserID(c) && !cl.IsPublic {
		return mw.ErrNotFound("clarification not found")
	}
	return c.JSON(http.StatusOK, dto.ClarificationToResponse(cl))
}

// POST /api/v1/clarifications/:id/answer
func (h *ClarificationHandler) Answer(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid id")
	}
	var req dto.AnswerClarificationRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	cl, err := h.q.AnswerClarification(c.Request().Context(), db.AnswerClarificationParams{
		ID: id, Answer: &req.Answer, IsPublic: req.IsPublic, AnsweredBy: dto.ToPgUUID(uid),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("clarification not found")
		}
		return mw.ErrInternal("answer failed")
	}
	return c.JSON(http.StatusOK, dto.ClarificationToResponse(cl))
}

// PATCH /api/v1/clarifications/:id
func (h *ClarificationHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid id")
	}
	var body struct {
		IsPublic *bool   `json:"is_public,omitempty"`
		Status   *string `json:"status,omitempty"`
	}
	if err := c.Bind(&body); err != nil {
		return mw.ErrBadRequest("invalid body")
	}
	var st *db.ClarificationStatus
	if body.Status != nil {
		v := db.ClarificationStatus(*body.Status)
		st = &v
	}
	cl, err := h.q.UpdateClarificationStatus(c.Request().Context(), db.UpdateClarificationStatusParams{
		ID: id, IsPublic: body.IsPublic, Status: st,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("clarification not found")
		}
		return mw.ErrInternal("update failed")
	}
	return c.JSON(http.StatusOK, dto.ClarificationToResponse(cl))
}
