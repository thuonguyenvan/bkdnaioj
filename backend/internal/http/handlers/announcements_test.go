package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestAnnouncementHandler_Create_Success(t *testing.T) {
	contestID := uuid.New()
	userID := uuid.New()
	mock := &db.MockQuerier{
		CreateAnnouncementFunc: func(ctx context.Context, arg db.CreateAnnouncementParams) (db.Announcement, error) {
			return db.Announcement{ID: uuid.New(), ContestID: pgtype.UUID{Bytes: contestID, Valid: true}, Title: "Test", Content: "body", CreatedBy: userID}, nil
		},
	}
	h := NewAnnouncementHandler(mock)
	body := `{"title":"Test","content":"body"}`
	c, rec := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/announcements", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())
	setAuthContext(c, userID, "admin")

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestAnnouncementHandler_Create_ValidationError(t *testing.T) {
	mock := &db.MockQuerier{}
	h := NewAnnouncementHandler(mock)
	// Missing title
	body := `{"content":"body"}`
	c, _ := newTestContext("POST", "/api/v1/contests/"+uuid.New().String()+"/announcements", body)
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())
	setAuthContext(c, uuid.New(), "admin")

	err := h.Create(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestAnnouncementHandler_List_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		ListAnnouncementsByContestFunc: func(ctx context.Context, id pgtype.UUID) ([]db.Announcement, error) {
			return []db.Announcement{{ID: uuid.New(), ContestID: pgtype.UUID{Bytes: contestID, Valid: true}, Title: "A"}}, nil
		},
	}
	h := NewAnnouncementHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/announcements", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.List(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestAnnouncementHandler_Update_Success(t *testing.T) {
	annID := uuid.New()
	mock := &db.MockQuerier{
		UpdateAnnouncementFunc: func(ctx context.Context, arg db.UpdateAnnouncementParams) (db.Announcement, error) {
			return db.Announcement{ID: annID, Title: "Updated"}, nil
		},
	}
	h := NewAnnouncementHandler(mock)
	body := `{"title":"Updated"}`
	c, rec := newTestContext("PATCH", "/api/v1/announcements/"+annID.String(), body)
	c.SetParamNames("id")
	c.SetParamValues(annID.String())

	err := h.Update(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestAnnouncementHandler_Update_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		UpdateAnnouncementFunc: func(ctx context.Context, arg db.UpdateAnnouncementParams) (db.Announcement, error) {
			return db.Announcement{}, pgx.ErrNoRows
		},
	}
	h := NewAnnouncementHandler(mock)
	body := `{"title":"Updated"}`
	c, _ := newTestContext("PATCH", "/api/v1/announcements/"+uuid.New().String(), body)
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.Update(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}

func TestAnnouncementHandler_Delete_Success(t *testing.T) {
	annID := uuid.New()
	mock := &db.MockQuerier{
		DeleteAnnouncementFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewAnnouncementHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/announcements/"+annID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(annID.String())

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
