package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestUserHandler_GetUser_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		GetUserByIDFunc: func(ctx context.Context, id uuid.UUID) (db.User, error) {
			return db.User{
				ID:       userID,
				Email:    "user@example.com",
				FullName: "Some User",
				Role:     db.UserRoleContestant,
			}, nil
		},
	}
	h := NewUserHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/users/"+userID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(userID.String())

	err := h.GetUser(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, userID.String(), resp["id"])
}

func TestUserHandler_GetUser_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetUserByIDFunc: func(ctx context.Context, id uuid.UUID) (db.User, error) {
			return db.User{}, pgx.ErrNoRows
		},
	}
	h := NewUserHandler(mock)
	userID := uuid.New()
	c, _ := newTestContext("GET", "/api/v1/users/"+userID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(userID.String())

	err := h.GetUser(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusNotFound, appErr.Status)
}

func TestUserHandler_UpdateProfile_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		UpdateUserProfileFunc: func(ctx context.Context, arg db.UpdateUserProfileParams) (db.User, error) {
			return db.User{
				ID:       arg.ID,
				Email:    "user@example.com",
				FullName: "Updated Name",
				Role:     db.UserRoleContestant,
			}, nil
		},
	}
	h := NewUserHandler(mock)
	body := `{"full_name":"Updated Name"}`
	c, rec := newTestContext("PATCH", "/api/v1/users/"+userID.String(), body)
	c.SetParamNames("id")
	c.SetParamValues(userID.String())
	setAuthContext(c, userID, "contestant")

	err := h.UpdateProfile(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, "Updated Name", resp["full_name"])
}

func TestUserHandler_UpdateProfile_Forbidden(t *testing.T) {
	targetID := uuid.New()
	callerID := uuid.New()
	mock := &db.MockQuerier{}
	h := NewUserHandler(mock)
	body := `{"full_name":"Hacked"}`
	c, _ := newTestContext("PATCH", "/api/v1/users/"+targetID.String(), body)
	c.SetParamNames("id")
	c.SetParamValues(targetID.String())
	setAuthContext(c, callerID, "contestant")

	err := h.UpdateProfile(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusForbidden, appErr.Status)
}

func TestUserHandler_GetMyTeams_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		ListTeamsByUserFunc: func(ctx context.Context, uid uuid.UUID) ([]db.Team, error) {
			return []db.Team{
				{ID: uuid.New(), Slug: "team-a", Name: "Team A", OwnerID: userID},
			}, nil
		},
	}
	h := NewUserHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/users/me/teams", "")
	setAuthContext(c, userID, "contestant")

	err := h.GetMyTeams(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}
