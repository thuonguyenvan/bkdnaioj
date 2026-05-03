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

func TestContestHandler_Create_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		CreateContestFunc: func(ctx context.Context, arg db.CreateContestParams) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        arg.Slug,
				Title:       arg.Title,
				Status:      db.ContestStatusDraft,
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPublic,
				MaxTeamSize: arg.MaxTeamSize,
			}, nil
		},
	}
	h := NewContestHandler(mock)
	body := `{
		"slug":"test-contest",
		"title":"Test Contest",
		"entry_policy":"individual",
		"start_time":"2025-06-01T00:00:00Z",
		"end_time":"2025-06-30T00:00:00Z",
		"visibility":"public",
		"max_team_size":1
	}`
	c, rec := newTestContext("POST", "/api/v1/contests", body)
	setAuthContext(c, uuid.New(), "admin")

	err := h.Create(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, contestID.String(), resp["id"])
}

func TestContestHandler_Create_DuplicateSlug(t *testing.T) {
	mock := &db.MockQuerier{
		CreateContestFunc: func(ctx context.Context, arg db.CreateContestParams) (db.Contest, error) {
			return db.Contest{}, &pgconn.PgError{Code: "23505"}
		},
	}
	h := NewContestHandler(mock)
	body := `{
		"slug":"dup-slug",
		"title":"Dup Contest",
		"entry_policy":"individual",
		"start_time":"2025-06-01T00:00:00Z",
		"end_time":"2025-06-30T00:00:00Z",
		"visibility":"public",
		"max_team_size":1
	}`
	c, _ := newTestContext("POST", "/api/v1/contests", body)
	setAuthContext(c, uuid.New(), "admin")

	err := h.Create(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusConflict, appErr.Status)
}

func TestContestHandler_List_Success(t *testing.T) {
	mock := &db.MockQuerier{
		ListContestsFunc: func(ctx context.Context, arg db.ListContestsParams) ([]db.Contest, error) {
			return []db.Contest{
				{ID: uuid.New(), Slug: "c1", Title: "C1", Status: db.ContestStatusDraft,
					EntryPolicy: db.ContestEntryPolicyIndividual, Visibility: db.ContestVisibilityPublic},
			}, nil
		},
	}
	h := NewContestHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests", "")

	err := h.List(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestContestHandler_Get_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        "my-contest",
				Title:       "My Contest",
				Status:      db.ContestStatusDraft,
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPublic,
			}, nil
		},
	}
	h := NewContestHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Get(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, contestID.String(), resp["id"])
}

func TestContestHandler_Get_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{}, pgx.ErrNoRows
		},
	}
	h := NewContestHandler(mock)
	contestID := uuid.New()
	c, _ := newTestContext("GET", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Get(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusNotFound, appErr.Status)
}

func TestContestHandler_Get_InvalidID(t *testing.T) {
	mock := &db.MockQuerier{}
	h := NewContestHandler(mock)
	c, _ := newTestContext("GET", "/api/v1/contests/not-a-uuid", "")
	c.SetParamNames("id")
	c.SetParamValues("not-a-uuid")

	err := h.Get(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, appErr.Status)
}

func TestContestHandler_Delete_Success(t *testing.T) {
	mock := &db.MockQuerier{
		DeleteContestFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewContestHandler(mock)
	contestID := uuid.New()
	c, rec := newTestContext("DELETE", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Delete(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestContestHandler_Publish_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		UpdateContestStatusFunc: func(ctx context.Context, arg db.UpdateContestStatusParams) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        "pub-contest",
				Title:       "Pub Contest",
				Status:      db.ContestStatusRegistrationOpen,
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPublic,
			}, nil
		},
	}
	h := NewContestHandler(mock)
	c, rec := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/publish", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Publish(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, "registration_open", resp["status"])
}
