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

type AnnouncementHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewAnnouncementHandler(q db.Querier) *AnnouncementHandler {
	return &AnnouncementHandler{q: q, val: validator.New()}
}

// POST /api/v1/contests/:id/announcements
func (h *AnnouncementHandler) Create(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var req dto.CreateAnnouncementRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	a, err := h.q.CreateAnnouncement(c.Request().Context(), db.CreateAnnouncementParams{
		ContestID: dto.UUIDToPgUUID(&contestID),
		TaskID:    dto.UUIDToPgUUID(req.TaskID),
		Title:     req.Title,
		Content:   req.Content,
		IsPinned:  req.IsPinned,
		IsPublic:  req.IsPublic,
		CreatedBy: uid,
	})
	if err != nil {
		return mw.ErrInternal("create announcement failed")
	}
	return c.JSON(http.StatusCreated, dto.AnnouncementToResponse(a))
}

// GET /api/v1/contests/:id/announcements
func (h *AnnouncementHandler) List(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	items, err := h.q.ListAnnouncementsByContest(c.Request().Context(), dto.UUIDToPgUUID(&contestID))
	if err != nil {
		return mw.ErrInternal("list announcements failed")
	}
	resp := make([]dto.AnnouncementResponse, len(items))
	for i, a := range items {
		resp[i] = dto.AnnouncementToResponse(a)
	}
	return c.JSON(http.StatusOK, resp)
}

// PATCH /api/v1/announcements/:id
func (h *AnnouncementHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid id")
	}
	var body struct {
		Title    *string `json:"title,omitempty"`
		Content  *string `json:"content,omitempty"`
		IsPinned *bool   `json:"is_pinned,omitempty"`
		IsPublic *bool   `json:"is_public,omitempty"`
	}
	if err := c.Bind(&body); err != nil {
		return mw.ErrBadRequest("invalid body")
	}
	a, err := h.q.UpdateAnnouncement(c.Request().Context(), db.UpdateAnnouncementParams{
		ID: id, Title: body.Title, Content: body.Content,
		IsPinned: body.IsPinned, IsPublic: body.IsPublic,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("announcement not found")
		}
		return mw.ErrInternal("update failed")
	}
	return c.JSON(http.StatusOK, dto.AnnouncementToResponse(a))
}

// DELETE /api/v1/announcements/:id
func (h *AnnouncementHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid id")
	}
	if err := h.q.DeleteAnnouncement(c.Request().Context(), id); err != nil {
		return mw.ErrInternal("delete failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// GET /api/v1/announcements
func (h *AnnouncementHandler) ListSystem(c echo.Context) error {
	items, err := h.q.ListSystemAnnouncements(c.Request().Context())
	if err != nil {
		return mw.ErrInternal("list system announcements failed")
	}
	resp := make([]dto.AnnouncementResponse, len(items))
	for i, a := range items {
		resp[i] = dto.AnnouncementToResponse(a)
	}
	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/announcements
func (h *AnnouncementHandler) CreateSystem(c echo.Context) error {
	var req dto.CreateAnnouncementRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	a, err := h.q.CreateAnnouncement(c.Request().Context(), db.CreateAnnouncementParams{
		ContestID: dto.UUIDToPgUUID(nil), // System announcement (null contest_id)
		TaskID:    dto.UUIDToPgUUID(req.TaskID),
		Title:     req.Title,
		Content:   req.Content,
		IsPinned:  req.IsPinned,
		IsPublic:  req.IsPublic,
		CreatedBy: uid,
	})
	if err != nil {
		return mw.ErrInternal("create system announcement failed")
	}
	return c.JSON(http.StatusCreated, dto.AnnouncementToResponse(a))
}
