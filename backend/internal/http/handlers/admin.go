package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type AdminHandler struct {
	q db.Querier
}

func NewAdminHandler(q db.Querier) *AdminHandler {
	return &AdminHandler{q: q}
}

// GET /api/v1/admin/stats
func (h *AdminHandler) Stats(c echo.Context) error {
	ctx := c.Request().Context()
	users, _ := h.q.CountUsers(ctx)
	contests, _ := h.q.CountContests(ctx)
	subs, _ := h.q.CountSubmissions(ctx)
	entries, _ := h.q.CountActiveEntries(ctx)
	return c.JSON(http.StatusOK, map[string]int64{
		"users": users, "contests": contests,
		"submissions": subs, "active_entries": entries,
	})
}

// GET /api/v1/admin/users
func (h *AdminHandler) ListUsers(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	users, err := h.q.ListUsersAdmin(c.Request().Context(), db.ListUsersAdminParams{
		Limit: int32(limit), Offset: int32(offset),
	})
	if err != nil {
		return mw.ErrInternal("list users failed")
	}
	return c.JSON(http.StatusOK, users)
}

// PATCH /api/v1/admin/users/:id/role
func (h *AdminHandler) UpdateUserRole(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid user id")
	}
	var body struct {
		Role string `json:"role" validate:"required,oneof=contestant admin"`
	}
	if err := c.Bind(&body); err != nil {
		return mw.ErrBadRequest("invalid body")
	}
	user, err := h.q.UpdateUserRole(c.Request().Context(), db.UpdateUserRoleParams{
		ID: id, Role: db.UserRole(body.Role),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("user not found")
		}
		return mw.ErrInternal("update role failed")
	}
	return c.JSON(http.StatusOK, user)
}

// GET /api/v1/admin/health
func (h *AdminHandler) Health(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "ok", "service": "olpai-api"})
}
