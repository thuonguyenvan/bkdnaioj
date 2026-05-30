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

func TestSubmissionHandler_Create_Unsupported(t *testing.T) {
	h := NewSubmissionHandler(&db.MockQuerier{}, nil, nil)
	c, _ := newTestContext("POST", "/api/v1/entries/"+uuid.New().String()+"/submissions", `{}`)

	err := h.Create(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestSubmissionHandler_Get_Success(t *testing.T) {
	subID := uuid.New()
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, rec := newTestContext("GET", "/api/v1/submissions/"+subID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(subID.String())

	err := h.Get(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestSubmissionHandler_Get_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{}, pgx.ErrNoRows
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, _ := newTestContext("GET", "/api/v1/submissions/"+uuid.New().String(), "")
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}

func TestSubmissionHandler_ListByEntry_Success(t *testing.T) {
	entryID := uuid.New()
	mock := &db.MockQuerier{
		ListSubmissionsByEntryFunc: func(ctx context.Context, arg db.ListSubmissionsByEntryParams) ([]db.Submission, error) {
			return []db.Submission{{ID: uuid.New()}}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, rec := newTestContext("GET", "/api/v1/entries/"+entryID.String()+"/submissions", "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.ListByEntry(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestSubmissionHandler_MarkFinal_Success(t *testing.T) {
	subID := uuid.New()
	mock := &db.MockQuerier{
		MarkSubmissionFinalFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID, IsFinal: true}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, rec := newTestContext("POST", "/api/v1/submissions/"+subID.String()+"/mark-final", "")
	c.SetParamNames("id")
	c.SetParamValues(subID.String())

	err := h.MarkFinal(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestSubmissionHandler_MarkFinal_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		MarkSubmissionFinalFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{}, pgx.ErrNoRows
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, _ := newTestContext("POST", "/api/v1/submissions/"+uuid.New().String()+"/mark-final", "")
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.MarkFinal(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}
