package handlers

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mank1/olpai-backend/db"
	"github.com/stretchr/testify/assert"
)

func TestPhaseDefHandler_Create_Success(t *testing.T) {
	contestID := uuid.New()
	defID := uuid.New()

	mock := &db.MockQuerier{
		CreatePhaseDefFunc: func(ctx context.Context, arg db.CreatePhaseDefParams) (db.ContestPhaseDef, error) {
			return db.ContestPhaseDef{
				ID: defID, ContestID: contestID,
				Key: db.ContestPhaseKeyPublicTest, Title: "Public Test", SortOrder: 1,
			}, nil
		},
	}
	h := NewPhaseDefHandler(mock)
	body := `{"key":"public_test","title":"Public Test","sort_order":1}`
	c, rec := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/phase-defs", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestPhaseDefHandler_Create_Duplicate(t *testing.T) {
	contestID := uuid.New()

	mock := &db.MockQuerier{
		CreatePhaseDefFunc: func(ctx context.Context, arg db.CreatePhaseDefParams) (db.ContestPhaseDef, error) {
			return db.ContestPhaseDef{}, &pgconn.PgError{Code: "23505"}
		},
	}
	h := NewPhaseDefHandler(mock)
	body := `{"key":"public_test","title":"Public Test","sort_order":1}`
	c, _ := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/phase-defs", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Create(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")
}

func TestPhaseDefHandler_List_Success(t *testing.T) {
	contestID := uuid.New()

	mock := &db.MockQuerier{
		ListPhaseDefsByContestFunc: func(ctx context.Context, cid uuid.UUID) ([]db.ContestPhaseDef, error) {
			return []db.ContestPhaseDef{
				{ID: uuid.New(), ContestID: contestID, Key: db.ContestPhaseKeyPublicTest, Title: "Public Test", SortOrder: 1},
			}, nil
		},
	}
	h := NewPhaseDefHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/phase-defs", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.List(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPhaseDefHandler_Update_Success(t *testing.T) {
	contestID := uuid.New()
	defID := uuid.New()

	mock := &db.MockQuerier{
		UpdatePhaseDefFunc: func(ctx context.Context, arg db.UpdatePhaseDefParams) (db.ContestPhaseDef, error) {
			return db.ContestPhaseDef{
				ID: defID, ContestID: contestID,
				Key: db.ContestPhaseKeyPublicTest, Title: "Updated Title", SortOrder: 2,
			}, nil
		},
	}
	h := NewPhaseDefHandler(mock)
	body := fmt.Sprintf(`{"title":"Updated Title","sort_order":2}`)
	c, rec := newTestContext("PATCH", "/api/v1/contests/"+contestID.String()+"/phase-defs/"+defID.String(), body)
	c.SetParamNames("id", "def_id")
	c.SetParamValues(contestID.String(), defID.String())

	err := h.Update(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPhaseDefHandler_Update_NotFound(t *testing.T) {
	contestID := uuid.New()
	defID := uuid.New()

	mock := &db.MockQuerier{
		UpdatePhaseDefFunc: func(ctx context.Context, arg db.UpdatePhaseDefParams) (db.ContestPhaseDef, error) {
			return db.ContestPhaseDef{}, pgx.ErrNoRows
		},
	}
	h := NewPhaseDefHandler(mock)
	body := `{"title":"Updated Title"}`
	c, _ := newTestContext("PATCH", "/api/v1/contests/"+contestID.String()+"/phase-defs/"+defID.String(), body)
	c.SetParamNames("id", "def_id")
	c.SetParamValues(contestID.String(), defID.String())

	err := h.Update(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestPhaseDefHandler_Delete_Success(t *testing.T) {
	contestID := uuid.New()
	defID := uuid.New()

	mock := &db.MockQuerier{
		DeletePhaseDefFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewPhaseDefHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/contests/"+contestID.String()+"/phase-defs/"+defID.String(), "")
	c.SetParamNames("id", "def_id")
	c.SetParamValues(contestID.String(), defID.String())

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
