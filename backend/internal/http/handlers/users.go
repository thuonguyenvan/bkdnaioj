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

// UserHandler groups user-related handlers.
type UserHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewUserHandler(q db.Querier) *UserHandler {
	return &UserHandler{q: q, val: validator.New()}
}

// GetUser retrieves a user by ID.
// GET /api/v1/users/:id
func (h *UserHandler) GetUser(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid user id")
	}
	user, err := h.q.GetUserByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("user not found")
		}
		return mw.ErrInternal("fetch user failed")
	}
	return c.JSON(http.StatusOK, dto.UserToResponse(user))
}

// UpdateProfile updates the current user's profile.
// PATCH /api/v1/users/:id
func (h *UserHandler) UpdateProfile(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid user id")
	}
	// Only self or admin can update
	caller := mw.GetUserID(c)
	role, _ := c.Get(mw.CtxRole).(string)
	if caller != id && role != "admin" {
		return mw.ErrForbidden("can only update own profile")
	}

	var req dto.UpdateProfileRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	// COALESCE in SQL handles nil fields (keeps old value)
	fullName := ""
	if req.FullName != nil {
		fullName = *req.FullName
	}
	user, err := h.q.UpdateUserProfile(c.Request().Context(), db.UpdateUserProfileParams{
		ID:        id,
		FullName:  fullName,
		StudentID: req.StudentID,
		AvatarUrl: req.AvatarURL,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("user not found")
		}
		return mw.ErrInternal("update failed")
	}
	return c.JSON(http.StatusOK, dto.UserToResponse(user))
}

// GetMyTeams returns teams the current user belongs to.
// GET /api/v1/users/me/teams
func (h *UserHandler) GetMyTeams(c echo.Context) error {
	uid := mw.GetUserID(c)
	teams, err := h.q.ListTeamsByUser(c.Request().Context(), uid)
	if err != nil {
		return mw.ErrInternal("list teams failed")
	}
	resp := make([]dto.TeamResponse, len(teams))
	for i, t := range teams {
		resp[i] = dto.TeamResponse{
			ID:        t.ID,
			Slug:      t.Slug,
			Name:      t.Name,
			OwnerID:   t.OwnerID,
			CreatedAt: dto.PgTimeVal(t.CreatedAt),
		}
	}
	return c.JSON(http.StatusOK, resp)
}
