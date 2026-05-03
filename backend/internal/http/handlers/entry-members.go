package handlers

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

// EntryMemberHandler handles lineup member operations.
type EntryMemberHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewEntryMemberHandler(q db.Querier) *EntryMemberHandler {
	return &EntryMemberHandler{q: q, val: validator.New()}
}

// GET /api/v1/entries/:id/members
func (h *EntryMemberHandler) List(c echo.Context) error {
	entryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	members, err := h.q.ListEntryMembers(c.Request().Context(), entryID)
	if err != nil {
		return mw.ErrInternal("list members failed")
	}
	resp := make([]dto.EntryMemberResponse, len(members))
	for i, m := range members {
		resp[i] = dto.EntryMemberToResponse(m)
	}
	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/entries/:id/members
func (h *EntryMemberHandler) Add(c echo.Context) error {
	entryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	var req dto.AddEntryMemberRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	err = h.q.AddEntryMember(c.Request().Context(), db.AddEntryMemberParams{
		ContestEntryID: entryID,
		UserID:         req.UserID,
		Role:           db.EntryMemberRole(req.Role),
	})
	if err != nil {
		return mw.ErrInternal("add member failed: " + err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// DELETE /api/v1/entries/:id/members/:user_id
func (h *EntryMemberHandler) Remove(c echo.Context) error {
	entryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid user id")
	}
	err = h.q.RemoveEntryMember(c.Request().Context(), db.RemoveEntryMemberParams{
		ContestEntryID: entryID, UserID: userID,
	})
	if err != nil {
		return mw.ErrInternal("remove member failed")
	}
	return c.NoContent(http.StatusNoContent)
}
