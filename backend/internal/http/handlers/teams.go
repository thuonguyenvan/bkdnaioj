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

// TeamHandler groups team-related handlers.
type TeamHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewTeamHandler(q db.Querier) *TeamHandler {
	return &TeamHandler{q: q, val: validator.New()}
}

// Create creates a new team. Caller becomes owner.
// POST /api/v1/teams
func (h *TeamHandler) Create(c echo.Context) error {
	var req dto.CreateTeamRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	uid := mw.GetUserID(c)
	team, err := h.q.CreateTeam(c.Request().Context(), db.CreateTeamParams{
		Slug:    req.Slug,
		Name:    req.Name,
		OwnerID: uid,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("team slug already taken")
		}
		return mw.ErrInternal("create team failed")
	}

	// Auto-add owner as member with 'manager' role
	_ = h.q.AddTeamMember(c.Request().Context(), db.AddTeamMemberParams{
		TeamID: team.ID,
		UserID: uid,
		Role:   db.TeamRoleManager,
	})

	return c.JSON(http.StatusCreated, teamToResponse(team))
}

// Get retrieves a team by ID.
// GET /api/v1/teams/:id
func (h *TeamHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	team, err := h.q.GetTeamByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("team not found")
		}
		return mw.ErrInternal("fetch team failed")
	}
	return c.JSON(http.StatusOK, teamToResponse(team))
}

// ListMembers lists all members of a team.
// GET /api/v1/teams/:id/members
func (h *TeamHandler) ListMembers(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	rows, err := h.q.ListTeamMembers(c.Request().Context(), id)
	if err != nil {
		return mw.ErrInternal("list members failed")
	}
	resp := make([]dto.TeamMemberResponse, len(rows))
	for i, r := range rows {
		resp[i] = dto.TeamMemberResponse{
			UserID:   r.UserID,
			Email:    r.Email,
			FullName: r.FullName,
			Role:     string(r.Role),
			JoinedAt: dto.PgTimeVal(r.JoinedAt),
		}
	}
	return c.JSON(http.StatusOK, resp)
}

// AddMember adds a user to a team.
// POST /api/v1/teams/:id/members
func (h *TeamHandler) AddMember(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	// Only owner or manager can add members
	uid := mw.GetUserID(c)
	team, err := h.q.GetTeamByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("team not found")
		}
		return mw.ErrInternal("fetch team failed")
	}
	if team.OwnerID != uid {
		return mw.ErrForbidden("only team owner can add members")
	}

	var req dto.AddMemberRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	ctx := c.Request().Context()
	target, err := h.q.GetUserByUsername(ctx, &req.Username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("user not found: " + req.Username)
		}
		return mw.ErrInternal("lookup user failed")
	}

	err = h.q.AddTeamMember(ctx, db.AddTeamMemberParams{
		TeamID: id,
		UserID: target.ID,
		Role:   db.TeamRole(req.Role),
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return mw.ErrNotFound("user not found")
		}
		return mw.ErrInternal("add member failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// RemoveMember removes a user from a team.
// DELETE /api/v1/teams/:id/members/:user_id
func (h *TeamHandler) RemoveMember(c echo.Context) error {
	teamID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid user id")
	}

	// Only owner can remove
	uid := mw.GetUserID(c)
	team, err := h.q.GetTeamByID(c.Request().Context(), teamID)
	if err != nil {
		return mw.ErrNotFound("team not found")
	}
	if team.OwnerID != uid {
		return mw.ErrForbidden("only team owner can remove members")
	}

	err = h.q.RemoveTeamMember(c.Request().Context(), db.RemoveTeamMemberParams{
		TeamID: teamID,
		UserID: userID,
	})
	if err != nil {
		return mw.ErrInternal("remove member failed")
	}
	return c.NoContent(http.StatusNoContent)
}

func teamToResponse(t db.Team) dto.TeamResponse {
	return dto.TeamResponse{
		ID:        t.ID,
		Slug:      t.Slug,
		Name:      t.Name,
		OwnerID:   t.OwnerID,
		CreatedAt: dto.PgTimeVal(t.CreatedAt),
	}
}
