package handlers

import (
	"errors"
	"net/http"
	"regexp"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

var slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type TeamHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewTeamHandler(q db.Querier) *TeamHandler {
	return &TeamHandler{q: q, val: validator.New()}
}

// POST /api/v1/teams
func (h *TeamHandler) Create(c echo.Context) error {
	var req dto.CreateTeamRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	if !slugRe.MatchString(req.Slug) {
		return mw.ErrBadRequest("slug must only contain lowercase letters, digits, and hyphens")
	}

	uid := mw.GetUserID(c)
	ctx := c.Request().Context()
	team, err := h.q.CreateTeam(ctx, db.CreateTeamParams{Slug: req.Slug, Name: req.Name, OwnerID: uid})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("team slug already taken")
		}
		return mw.ErrInternal("create team failed")
	}
	if err := h.q.AddTeamMember(ctx, db.AddTeamMemberParams{
		TeamID: team.ID, UserID: uid, Role: db.TeamRoleManager,
	}); err != nil {
		return mw.ErrInternal("add owner as member failed")
	}
	return c.JSON(http.StatusCreated, teamToResponse(team))
}

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

// PATCH /api/v1/teams/:id
func (h *TeamHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	var req struct {
		Name string `json:"name" validate:"required,min=2,max=255"`
	}
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	team, err := h.q.UpdateTeam(c.Request().Context(), db.UpdateTeamParams{
		ID: id, Name: req.Name, OwnerID: uid,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrForbidden("only team owner can update the team")
		}
		return mw.ErrInternal("update team failed")
	}
	return c.JSON(http.StatusOK, teamToResponse(team))
}

// DELETE /api/v1/teams/:id
func (h *TeamHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	uid := mw.GetUserID(c)
	team, err := h.q.GetTeamByID(c.Request().Context(), id)
	if err != nil {
		return mw.ErrNotFound("team not found")
	}
	if team.OwnerID != uid {
		return mw.ErrForbidden("only team owner can delete the team")
	}
	if err := h.q.DeleteTeam(c.Request().Context(), db.DeleteTeamParams{ID: id, OwnerID: uid}); err != nil {
		return mw.ErrInternal("delete team failed")
	}
	return c.NoContent(http.StatusNoContent)
}

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
			Username: r.Username,
			Role:     string(r.Role),
			Status:   r.Status,
			JoinedAt: dto.PgTimeVal(r.JoinedAt),
		}
	}
	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/teams/:id/members — invite (pending until accepted)
func (h *TeamHandler) AddMember(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	uid := mw.GetUserID(c)
	team, err := h.q.GetTeamByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("team not found")
		}
		return mw.ErrInternal("fetch team failed")
	}
	if team.OwnerID != uid {
		return mw.ErrForbidden("only team owner can invite members")
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
	if errors.Is(err, pgx.ErrNoRows) {
		target, err = h.q.GetUserByEmail(ctx, req.Username)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("user not found: " + req.Username)
		}
		return mw.ErrInternal("lookup user failed")
	}
	if target.ID == uid {
		return mw.ErrBadRequest("you are already in the team")
	}

	if err := h.q.InviteTeamMember(ctx, db.InviteTeamMemberParams{
		TeamID: id, UserID: target.ID, Role: db.TeamRole(req.Role),
	}); err != nil {
		return mw.ErrInternal("invite failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// POST /api/v1/teams/:id/accept — accept pending invitation
func (h *TeamHandler) AcceptInvitation(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	uid := mw.GetUserID(c)
	if err := h.q.AcceptTeamInvitation(c.Request().Context(), db.AcceptTeamInvitationParams{
		TeamID: id, UserID: uid,
	}); err != nil {
		return mw.ErrInternal("accept invitation failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// POST /api/v1/teams/:id/decline — decline pending invitation
func (h *TeamHandler) DeclineInvitation(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid team id")
	}
	uid := mw.GetUserID(c)
	if err := h.q.DeclineTeamInvitation(c.Request().Context(), db.DeclineTeamInvitationParams{
		TeamID: id, UserID: uid,
	}); err != nil {
		return mw.ErrInternal("decline invitation failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// GET /api/v1/teams/invitations — list pending invitations for current user
func (h *TeamHandler) ListInvitations(c echo.Context) error {
	uid := mw.GetUserID(c)
	rows, err := h.q.ListPendingInvitations(c.Request().Context(), uid)
	if err != nil {
		return mw.ErrInternal("list invitations failed")
	}
	resp := make([]dto.TeamInvitationResponse, len(rows))
	for i, r := range rows {
		resp[i] = dto.TeamInvitationResponse{
			TeamID:   r.ID,
			TeamName: r.Name,
			TeamSlug: r.Slug,
			Role:     string(r.Role),
		}
	}
	return c.JSON(http.StatusOK, resp)
}

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
	uid := mw.GetUserID(c)
	team, err := h.q.GetTeamByID(c.Request().Context(), teamID)
	if err != nil {
		return mw.ErrNotFound("team not found")
	}
	if team.OwnerID != uid {
		return mw.ErrForbidden("only team owner can remove members")
	}
	if err := h.q.RemoveTeamMember(c.Request().Context(), db.RemoveTeamMemberParams{
		TeamID: teamID, UserID: userID,
	}); err != nil {
		return mw.ErrInternal("remove member failed")
	}
	return c.NoContent(http.StatusNoContent)
}

func teamToResponse(t db.Team) dto.TeamResponse {
	return dto.TeamResponse{
		ID: t.ID, Slug: t.Slug, Name: t.Name, OwnerID: t.OwnerID,
		CreatedAt: dto.PgTimeVal(t.CreatedAt),
	}
}
