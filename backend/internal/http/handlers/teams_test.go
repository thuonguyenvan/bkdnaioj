package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestTeamHandler_Create_Success(t *testing.T) {
	ownerID := uuid.New()
	teamID := uuid.New()
	mock := &db.MockQuerier{
		CreateTeamFunc: func(ctx context.Context, arg db.CreateTeamParams) (db.Team, error) {
			return db.Team{
				ID:      teamID,
				Slug:    arg.Slug,
				Name:    arg.Name,
				OwnerID: ownerID,
			}, nil
		},
	}
	h := NewTeamHandler(mock)
	body := `{"slug":"myteam","name":"My Team"}`
	c, rec := newTestContext("POST", "/api/v1/teams", body)
	setAuthContext(c, ownerID, "contestant")

	err := h.Create(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, teamID.String(), resp["id"])
}

func TestTeamHandler_Create_DuplicateSlug(t *testing.T) {
	mock := &db.MockQuerier{
		CreateTeamFunc: func(ctx context.Context, arg db.CreateTeamParams) (db.Team, error) {
			return db.Team{}, &pgconn.PgError{Code: "23505"}
		},
	}
	h := NewTeamHandler(mock)
	body := `{"slug":"dupteam","name":"Dup Team"}`
	c, _ := newTestContext("POST", "/api/v1/teams", body)
	setAuthContext(c, uuid.New(), "contestant")

	err := h.Create(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusConflict, appErr.Status)
}

func TestTeamHandler_Get_Success(t *testing.T) {
	teamID := uuid.New()
	mock := &db.MockQuerier{
		GetTeamByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Team, error) {
			return db.Team{
				ID:      teamID,
				Slug:    "team1",
				Name:    "Team One",
				OwnerID: uuid.New(),
			}, nil
		},
	}
	h := NewTeamHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/teams/"+teamID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(teamID.String())

	err := h.Get(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, teamID.String(), resp["id"])
}

func TestTeamHandler_Get_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetTeamByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Team, error) {
			return db.Team{}, pgx.ErrNoRows
		},
	}
	h := NewTeamHandler(mock)
	teamID := uuid.New()
	c, _ := newTestContext("GET", "/api/v1/teams/"+teamID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(teamID.String())

	err := h.Get(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusNotFound, appErr.Status)
}

func TestTeamHandler_AddMember_Success(t *testing.T) {
	ownerID := uuid.New()
	teamID := uuid.New()
	memberID := uuid.New()
	mock := &db.MockQuerier{
		GetTeamByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Team, error) {
			return db.Team{ID: teamID, OwnerID: ownerID}, nil
		},
		AddTeamMemberFunc: func(ctx context.Context, arg db.AddTeamMemberParams) error {
			return nil
		},
	}
	h := NewTeamHandler(mock)
	body := `{"user_id":"` + memberID.String() + `","role":"member"}`
	c, rec := newTestContext("POST", "/api/v1/teams/"+teamID.String()+"/members", body)
	c.SetParamNames("id")
	c.SetParamValues(teamID.String())
	setAuthContext(c, ownerID, "contestant")

	err := h.AddMember(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestTeamHandler_AddMember_Forbidden(t *testing.T) {
	ownerID := uuid.New()
	callerID := uuid.New()
	teamID := uuid.New()
	memberID := uuid.New()
	mock := &db.MockQuerier{
		GetTeamByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Team, error) {
			return db.Team{ID: teamID, OwnerID: ownerID}, nil
		},
	}
	h := NewTeamHandler(mock)
	body := `{"user_id":"` + memberID.String() + `","role":"member"}`
	c, _ := newTestContext("POST", "/api/v1/teams/"+teamID.String()+"/members", body)
	c.SetParamNames("id")
	c.SetParamValues(teamID.String())
	setAuthContext(c, callerID, "contestant")

	err := h.AddMember(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusForbidden, appErr.Status)
}

func TestTeamHandler_RemoveMember_Success(t *testing.T) {
	ownerID := uuid.New()
	teamID := uuid.New()
	memberID := uuid.New()
	mock := &db.MockQuerier{
		GetTeamByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Team, error) {
			return db.Team{ID: teamID, OwnerID: ownerID}, nil
		},
		RemoveTeamMemberFunc: func(ctx context.Context, arg db.RemoveTeamMemberParams) error {
			return nil
		},
	}
	h := NewTeamHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/teams/"+teamID.String()+"/members/"+memberID.String(), "")
	c.SetParamNames("id", "user_id")
	c.SetParamValues(teamID.String(), memberID.String())
	setAuthContext(c, ownerID, "contestant")

	err := h.RemoveMember(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
