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

func TestClarificationHandler_Create_Success(t *testing.T) {
	contestID := uuid.New()
	entryID := uuid.New()
	userID := uuid.New()
	mock := &db.MockQuerier{
		CreateClarificationFunc: func(ctx context.Context, arg db.CreateClarificationParams) (db.Clarification, error) {
			return db.Clarification{
				ID: uuid.New(), ContestID: contestID, ContestEntryID: entryID,
				Question: "Why?", AskedBy: userID,
			}, nil
		},
	}
	h := NewClarificationHandler(mock)
	body := `{"question":"Why?"}`
	path := "/api/v1/contests/" + contestID.String() + "/clarifications?entry_id=" + entryID.String()
	c, rec := newTestContext("POST", path, body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())
	setAuthContext(c, userID, "contestant")

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestClarificationHandler_Create_MissingEntryID(t *testing.T) {
	mock := &db.MockQuerier{}
	h := NewClarificationHandler(mock)
	body := `{"question":"Why?"}`
	c, _ := newTestContext("POST", "/api/v1/contests/"+uuid.New().String()+"/clarifications", body)
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())
	setAuthContext(c, uuid.New(), "contestant")

	err := h.Create(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestClarificationHandler_List_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		ListClarificationsByContestFunc: func(ctx context.Context, arg db.ListClarificationsByContestParams) ([]db.Clarification, error) {
			return []db.Clarification{{ID: uuid.New(), ContestID: contestID}}, nil
		},
	}
	h := NewClarificationHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/clarifications", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.List(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestClarificationHandler_Get_Success(t *testing.T) {
	clID := uuid.New()
	mock := &db.MockQuerier{
		GetClarificationByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Clarification, error) {
			return db.Clarification{ID: clID, Question: "Why?"}, nil
		},
	}
	h := NewClarificationHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/clarifications/"+clID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(clID.String())

	err := h.Get(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestClarificationHandler_Get_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetClarificationByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Clarification, error) {
			return db.Clarification{}, pgx.ErrNoRows
		},
	}
	h := NewClarificationHandler(mock)
	c, _ := newTestContext("GET", "/api/v1/clarifications/"+uuid.New().String(), "")
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}

func TestClarificationHandler_Answer_Success(t *testing.T) {
	clID := uuid.New()
	userID := uuid.New()
	mock := &db.MockQuerier{
		AnswerClarificationFunc: func(ctx context.Context, arg db.AnswerClarificationParams) (db.Clarification, error) {
			ans := "Because"
			return db.Clarification{ID: clID, Answer: &ans}, nil
		},
	}
	h := NewClarificationHandler(mock)
	body := `{"answer":"Because"}`
	c, rec := newTestContext("POST", "/api/v1/clarifications/"+clID.String()+"/answer", body)
	c.SetParamNames("id")
	c.SetParamValues(clID.String())
	setAuthContext(c, userID, "jury")

	err := h.Answer(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestClarificationHandler_Answer_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		AnswerClarificationFunc: func(ctx context.Context, arg db.AnswerClarificationParams) (db.Clarification, error) {
			return db.Clarification{}, pgx.ErrNoRows
		},
	}
	h := NewClarificationHandler(mock)
	body := `{"answer":"Because"}`
	c, _ := newTestContext("POST", "/api/v1/clarifications/"+uuid.New().String()+"/answer", body)
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())
	setAuthContext(c, uuid.New(), "jury")

	err := h.Answer(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}
