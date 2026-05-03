package handlers

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestEntryMemberHandler_List_Success(t *testing.T) {
	entryID := uuid.New()
	memberID := uuid.New()

	mock := &db.MockQuerier{
		ListEntryMembersFunc: func(ctx context.Context, contestEntryID uuid.UUID) ([]db.ListEntryMembersRow, error) {
			return []db.ListEntryMembersRow{
				{
					ContestEntryID: entryID,
					UserID:         memberID,
					Role:           db.EntryMemberRoleLeader,
					JoinedAt:       pgtype.Timestamptz{},
					Email:          "user@example.com",
					FullName:       "Test User",
				},
			}, nil
		},
	}
	h := NewEntryMemberHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/entries/"+entryID.String()+"/members", "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.List(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestEntryMemberHandler_Add_Success(t *testing.T) {
	entryID := uuid.New()
	memberID := uuid.New()

	mock := &db.MockQuerier{
		AddEntryMemberFunc: func(ctx context.Context, arg db.AddEntryMemberParams) error {
			return nil
		},
	}
	h := NewEntryMemberHandler(mock)
	body := fmt.Sprintf(`{"user_id":"%s","role":"member"}`, memberID)
	c, rec := newTestContext("POST", "/api/v1/entries/"+entryID.String()+"/members", body)
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.Add(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestEntryMemberHandler_Add_ValidationError(t *testing.T) {
	entryID := uuid.New()

	mock := &db.MockQuerier{}
	h := NewEntryMemberHandler(mock)
	// Missing user_id
	body := `{"role":"member"}`
	c, _ := newTestContext("POST", "/api/v1/entries/"+entryID.String()+"/members", body)
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.Add(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestEntryMemberHandler_Remove_Success(t *testing.T) {
	entryID := uuid.New()
	userID := uuid.New()

	mock := &db.MockQuerier{
		RemoveEntryMemberFunc: func(ctx context.Context, arg db.RemoveEntryMemberParams) error {
			return nil
		},
	}
	h := NewEntryMemberHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/entries/"+entryID.String()+"/members/"+userID.String(), "")
	c.SetParamNames("id", "user_id")
	c.SetParamValues(entryID.String(), userID.String())

	err := h.Remove(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
