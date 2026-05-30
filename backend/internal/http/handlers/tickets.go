package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type TicketHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewTicketHandler(q db.Querier) *TicketHandler {
	return &TicketHandler{q: q, val: validator.New()}
}

// POST /api/v1/tickets
func (h *TicketHandler) Create(c echo.Context) error {
	var req dto.CreateTicketRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	t, err := h.q.CreateTicket(c.Request().Context(), db.CreateTicketParams{
		SubmissionID:   dto.UUIDToPgUUID(req.SubmissionID),
		ContestEntryID: req.ContestEntryID,
		Category:       db.TicketCategory(req.Category),
		Subject:        req.Subject,
		Description:    req.Description,
		CreatedBy:      uid,
	})
	if err != nil {
		return mw.ErrInternal("create ticket failed: " + err.Error())
	}
	return c.JSON(http.StatusCreated, dto.TicketToResponse(t))
}

// GET /api/v1/tickets/me
func (h *TicketHandler) ListMine(c echo.Context) error {
	uid := mw.GetUserID(c)
	items, err := h.q.ListTicketsByUser(c.Request().Context(), uid)
	if err != nil {
		return mw.ErrInternal("list tickets failed")
	}
	resp := make([]dto.TicketResponse, len(items))
	for i, t := range items {
		resp[i] = dto.TicketToResponse(t)
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/tickets (staff)
func (h *TicketHandler) ListAll(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var status *db.TicketStatus
	if s := c.QueryParam("status"); s != "" {
		v := db.TicketStatus(s)
		status = &v
	}
	items, err := h.q.ListTicketsAll(c.Request().Context(), db.ListTicketsAllParams{
		Limit: int32(limit), Offset: int32(offset), Status: status,
	})
	if err != nil {
		return mw.ErrInternal("list tickets failed")
	}
	resp := make([]dto.TicketResponse, len(items))
	for i, t := range items {
		resp[i] = dto.TicketToResponse(t)
	}
	return c.JSON(http.StatusOK, resp)
}

// PATCH /api/v1/tickets/:id
func (h *TicketHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid ticket id")
	}
	var body struct {
		Status     *string    `json:"status,omitempty"`
		Priority   *string    `json:"priority,omitempty"`
		AssignedTo *uuid.UUID `json:"assigned_to,omitempty"`
	}
	if err := c.Bind(&body); err != nil {
		return mw.ErrBadRequest("invalid body")
	}
	var st *db.TicketStatus
	if body.Status != nil {
		v := db.TicketStatus(*body.Status)
		st = &v
	}
	var pr *db.TicketPriority
	if body.Priority != nil {
		v := db.TicketPriority(*body.Priority)
		pr = &v
	}
	t, err := h.q.UpdateTicket(c.Request().Context(), db.UpdateTicketParams{
		ID: id, Status: st, Priority: pr,
		AssignedTo: dto.UUIDToPgUUID(body.AssignedTo),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("ticket not found")
		}
		return mw.ErrInternal("update failed")
	}
	return c.JSON(http.StatusOK, dto.TicketToResponse(t))
}

// POST /api/v1/tickets/:id/resolve
func (h *TicketHandler) Resolve(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid ticket id")
	}
	t, err := h.q.ResolveTicket(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("ticket not found")
		}
		return mw.ErrInternal("resolve failed")
	}
	return c.JSON(http.StatusOK, dto.TicketToResponse(t))
}
