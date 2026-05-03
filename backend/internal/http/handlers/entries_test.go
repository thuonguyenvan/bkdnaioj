package handlers

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mank1/olpai-backend/db"
	"github.com/stretchr/testify/assert"
)

func TestEntryHandler_Create_Success(t *testing.T) {
	userID := uuid.New()
	contestID := uuid.New()
	entryID := uuid.New()

	mock := &db.MockQuerier{
		CreateContestEntryFunc: func(ctx context.Context, arg db.CreateContestEntryParams) (db.ContestEntry, error) {
			return db.ContestEntry{
				ID:           entryID,
				ContestID:    contestID,
				EntryType:    db.EntryTypeIndividual,
				EntryMode:    db.EntryModeOfficial,
				DisplayName:  "Test Entry",
				Status:       db.EntryStatusPending,
				RegisteredBy: userID,
			}, nil
		},
		AddEntryMemberFunc: func(ctx context.Context, arg db.AddEntryMemberParams) error {
			return nil
		},
	}
	h := NewEntryHandler(mock)
	body := fmt.Sprintf(`{"entry_type":"individual","user_id":"%s","display_name":"Test Entry","entry_mode":"official"}`, userID)
	c, rec := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/entries", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())
	setAuthContext(c, userID, "user")

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestEntryHandler_Create_BothIDs(t *testing.T) {
	userID := uuid.New()
	teamID := uuid.New()
	contestID := uuid.New()

	mock := &db.MockQuerier{}
	h := NewEntryHandler(mock)
	body := fmt.Sprintf(
		`{"entry_type":"individual","user_id":"%s","team_id":"%s","display_name":"Test","entry_mode":"official"}`,
		userID, teamID,
	)
	c, _ := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/entries", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())
	setAuthContext(c, userID, "user")

	err := h.Create(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "exactly one")
}

func TestEntryHandler_List_Success(t *testing.T) {
	contestID := uuid.New()

	mock := &db.MockQuerier{
		ListContestEntriesFunc: func(ctx context.Context, arg db.ListContestEntriesParams) ([]db.ContestEntry, error) {
			return []db.ContestEntry{
				{ID: uuid.New(), ContestID: contestID, EntryType: db.EntryTypeIndividual, EntryMode: db.EntryModeOfficial, DisplayName: "E1", Status: db.EntryStatusPending, RegisteredBy: uuid.New()},
			}, nil
		},
	}
	h := NewEntryHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/entries", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.List(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestEntryHandler_Get_Success(t *testing.T) {
	entryID := uuid.New()

	mock := &db.MockQuerier{
		GetContestEntryByIDFunc: func(ctx context.Context, id uuid.UUID) (db.ContestEntry, error) {
			return db.ContestEntry{
				ID: entryID, ContestID: uuid.New(), EntryType: db.EntryTypeIndividual,
				EntryMode: db.EntryModeOfficial, DisplayName: "E1",
				Status: db.EntryStatusPending, RegisteredBy: uuid.New(),
			}, nil
		},
	}
	h := NewEntryHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/entries/"+entryID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.Get(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestEntryHandler_Get_NotFound(t *testing.T) {
	entryID := uuid.New()

	mock := &db.MockQuerier{
		GetContestEntryByIDFunc: func(ctx context.Context, id uuid.UUID) (db.ContestEntry, error) {
			return db.ContestEntry{}, pgx.ErrNoRows
		},
	}
	h := NewEntryHandler(mock)
	c, _ := newTestContext("GET", "/api/v1/entries/"+entryID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestEntryHandler_Delete_Success(t *testing.T) {
	entryID := uuid.New()

	mock := &db.MockQuerier{
		DeleteContestEntryFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewEntryHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/entries/"+entryID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestEntryHandler_Approve_Success(t *testing.T) {
	entryID := uuid.New()
	userID := uuid.New()

	mock := &db.MockQuerier{
		ApproveContestEntryFunc: func(ctx context.Context, arg db.ApproveContestEntryParams) (db.ContestEntry, error) {
			return db.ContestEntry{
				ID: entryID, ContestID: uuid.New(), EntryType: db.EntryTypeIndividual,
				EntryMode: db.EntryModeOfficial, DisplayName: "E1",
				Status: db.EntryStatusApproved, RegisteredBy: uuid.New(),
			}, nil
		},
	}
	h := NewEntryHandler(mock)
	c, rec := newTestContext("POST", "/api/v1/entries/"+entryID.String()+"/approve", "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())
	setAuthContext(c, userID, "admin")

	err := h.Approve(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestEntryHandler_Disqualify_NotFound(t *testing.T) {
	entryID := uuid.New()

	mock := &db.MockQuerier{
		DisqualifyContestEntryFunc: func(ctx context.Context, id uuid.UUID) (db.ContestEntry, error) {
			return db.ContestEntry{}, pgx.ErrNoRows
		},
	}
	h := NewEntryHandler(mock)
	c, _ := newTestContext("POST", "/api/v1/entries/"+entryID.String()+"/disqualify", "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.Disqualify(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}
