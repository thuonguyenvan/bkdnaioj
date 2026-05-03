package handlers

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mank1/olpai-backend/db"
	"github.com/stretchr/testify/assert"
)

func TestPhaseHandler_Create_Success(t *testing.T) {
	taskID := uuid.New()
	phaseDefID := uuid.New()
	phaseID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)
	later := now.Add(24 * time.Hour)

	mock := &db.MockQuerier{
		CreatePhaseFunc: func(ctx context.Context, arg db.CreatePhaseParams) (db.Phase, error) {
			return db.Phase{
				ID:                  phaseID,
				TaskID:              taskID,
				ContestPhaseDefID:   phaseDefID,
				Slug:                "public-test",
				Title:               "Public Test",
				JudgeKey:            "rmse-judge",
				LeaderboardMode:     db.LeaderboardModeBest,
				AllowOfficialSubmit: true,
			}, nil
		},
	}
	h := NewPhaseHandler(mock)
	body := fmt.Sprintf(
		`{"contest_phase_def_id":"%s","slug":"public-test","title":"Public Test","open_time":"%s","close_time":"%s","judge_key":"rmse-judge","leaderboard_mode":"best","allow_official_submit":true,"allow_virtual_submit":false,"allow_practice_submit":false,"display_scores":true,"is_final":false,"sort_order":1}`,
		phaseDefID, now.Format(time.RFC3339), later.Format(time.RFC3339),
	)
	c, rec := newTestContext("POST", "/api/v1/tasks/"+taskID.String()+"/phases", body)
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestPhaseHandler_Get_Success(t *testing.T) {
	phaseID := uuid.New()

	mock := &db.MockQuerier{
		GetPhaseByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Phase, error) {
			return db.Phase{
				ID: phaseID, TaskID: uuid.New(), ContestPhaseDefID: uuid.New(),
				Slug: "public-test", Title: "Public Test", JudgeKey: "rmse-judge",
				LeaderboardMode: db.LeaderboardModeBest,
			}, nil
		},
	}
	h := NewPhaseHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/phases/"+phaseID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(phaseID.String())

	err := h.Get(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPhaseHandler_Get_NotFound(t *testing.T) {
	phaseID := uuid.New()

	mock := &db.MockQuerier{
		GetPhaseByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Phase, error) {
			return db.Phase{}, pgx.ErrNoRows
		},
	}
	h := NewPhaseHandler(mock)
	c, _ := newTestContext("GET", "/api/v1/phases/"+phaseID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(phaseID.String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestPhaseHandler_ListByTask_Success(t *testing.T) {
	taskID := uuid.New()

	mock := &db.MockQuerier{
		ListPhasesByTaskFunc: func(ctx context.Context, tid uuid.UUID) ([]db.Phase, error) {
			return []db.Phase{
				{ID: uuid.New(), TaskID: taskID, ContestPhaseDefID: uuid.New(), Slug: "p1", Title: "Phase 1", JudgeKey: "j1", LeaderboardMode: db.LeaderboardModeBest},
			}, nil
		},
	}
	h := NewPhaseHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/tasks/"+taskID.String()+"/phases", "")
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.ListByTask(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPhaseHandler_Delete_Success(t *testing.T) {
	phaseID := uuid.New()

	mock := &db.MockQuerier{
		DeletePhaseFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewPhaseHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/phases/"+phaseID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(phaseID.String())

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestPhaseHandler_Freeze_Success(t *testing.T) {
	phaseID := uuid.New()

	mock := &db.MockQuerier{
		SetPhaseFrozenFunc: func(ctx context.Context, arg db.SetPhaseFrozenParams) (db.Phase, error) {
			assert.True(t, arg.IsFrozen)
			return db.Phase{
				ID: phaseID, TaskID: uuid.New(), ContestPhaseDefID: uuid.New(),
				Slug: "p1", Title: "Phase 1", JudgeKey: "j1",
				LeaderboardMode: db.LeaderboardModeBest, IsFrozen: true,
			}, nil
		},
	}
	h := NewPhaseHandler(mock)
	c, rec := newTestContext("POST", "/api/v1/phases/"+phaseID.String()+"/freeze", "")
	c.SetParamNames("id")
	c.SetParamValues(phaseID.String())

	err := h.Freeze(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPhaseHandler_Unfreeze_Success(t *testing.T) {
	phaseID := uuid.New()

	mock := &db.MockQuerier{
		SetPhaseFrozenFunc: func(ctx context.Context, arg db.SetPhaseFrozenParams) (db.Phase, error) {
			assert.False(t, arg.IsFrozen)
			return db.Phase{
				ID: phaseID, TaskID: uuid.New(), ContestPhaseDefID: uuid.New(),
				Slug: "p1", Title: "Phase 1", JudgeKey: "j1",
				LeaderboardMode: db.LeaderboardModeBest, IsFrozen: false,
			}, nil
		},
	}
	h := NewPhaseHandler(mock)
	c, rec := newTestContext("POST", "/api/v1/phases/"+phaseID.String()+"/unfreeze", "")
	c.SetParamNames("id")
	c.SetParamValues(phaseID.String())

	err := h.Unfreeze(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPhaseHandler_Freeze_NotFound(t *testing.T) {
	phaseID := uuid.New()

	mock := &db.MockQuerier{
		SetPhaseFrozenFunc: func(ctx context.Context, arg db.SetPhaseFrozenParams) (db.Phase, error) {
			return db.Phase{}, pgx.ErrNoRows
		},
	}
	h := NewPhaseHandler(mock)
	c, _ := newTestContext("POST", "/api/v1/phases/"+phaseID.String()+"/freeze", "")
	c.SetParamNames("id")
	c.SetParamValues(phaseID.String())

	err := h.Freeze(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}
