package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestLeaderboardHandler_TaskPhaseBoard_Success(t *testing.T) {
	phaseID := uuid.New()
	entryID := uuid.New()
	rank := int32(1)
	mock := &db.MockQuerier{
		GetTaskPhaseLeaderboardFunc: func(ctx context.Context, arg db.GetTaskPhaseLeaderboardParams) ([]db.GetTaskPhaseLeaderboardRow, error) {
			return []db.GetTaskPhaseLeaderboardRow{
				{
					ID: uuid.New(), PhaseID: phaseID, ContestEntryID: entryID,
					Rank: &rank, Score: "95.5", DisplayName: "Team A",
					EntryType: "team", EntryMode: "official",
				},
			}, nil
		},
	}
	h := NewLeaderboardHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/phases/"+phaseID.String()+"/leaderboard", "")
	c.SetParamNames("phase_id")
	c.SetParamValues(phaseID.String())

	err := h.TaskPhaseBoard(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestLeaderboardHandler_TaskPhaseBoard_InvalidID(t *testing.T) {
	h := NewLeaderboardHandler(&db.MockQuerier{})
	c, _ := newTestContext("GET", "/api/v1/phases/bad/leaderboard", "")
	c.SetParamNames("phase_id")
	c.SetParamValues("bad")

	err := h.TaskPhaseBoard(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestLeaderboardHandler_ContestPhaseBoard_Success(t *testing.T) {
	defID := uuid.New()
	entryID := uuid.New()
	rank := int32(1)
	mock := &db.MockQuerier{
		GetContestPhaseLeaderboardFunc: func(ctx context.Context, arg db.GetContestPhaseLeaderboardParams) ([]db.GetContestPhaseLeaderboardRow, error) {
			return []db.GetContestPhaseLeaderboardRow{
				{
					ID: uuid.New(), ContestPhaseDefID: defID, ContestEntryID: entryID,
					Rank: &rank, Score: "88.0", DisplayName: "Solo B",
					EntryType: "individual", EntryMode: "official",
				},
			}, nil
		},
	}
	h := NewLeaderboardHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/xxx/phase-defs/"+defID.String()+"/leaderboard", "")
	c.SetParamNames("def_id")
	c.SetParamValues(defID.String())

	err := h.ContestPhaseBoard(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestLeaderboardHandler_RecomputeTaskPhase(t *testing.T) {
	h := NewLeaderboardHandler(&db.MockQuerier{})
	c, rec := newTestContext("POST", "/api/v1/phases/"+uuid.New().String()+"/leaderboard/recompute", "")

	err := h.RecomputeTaskPhase(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestLeaderboardHandler_RecomputeContestPhase(t *testing.T) {
	h := NewLeaderboardHandler(&db.MockQuerier{})
	c, rec := newTestContext("POST", "/api/v1/contests/xxx/phase-defs/"+uuid.New().String()+"/leaderboard/recompute", "")

	err := h.RecomputeContestPhase(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}
