package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
)

// Shared leaderboard row shape for both task-phase and contest-phase boards.
type LeaderboardRow struct {
	Rank           *int32          `json:"rank"`
	Score          string          `json:"score"`
	ScoreBreakdown json.RawMessage `json:"score_breakdown,omitempty"`
	EntriesCount   int32           `json:"entries_count"`
	IsFrozen       bool            `json:"is_frozen"`
	IsDisqualified bool            `json:"is_disqualified"`
	DqReason       *string         `json:"dq_reason,omitempty"`
	UpdatedAt      time.Time       `json:"updated_at"`
	// Embedded entry brief
	EntryID     uuid.UUID `json:"entry_id"`
	DisplayName string    `json:"display_name"`
	EntryType   string    `json:"entry_type"`
	EntryMode   string    `json:"entry_mode"`
}

func TaskPhaseRowToResponse(r db.GetTaskPhaseLeaderboardRow) LeaderboardRow {
	return LeaderboardRow{
		Rank: r.Rank, Score: r.Score, ScoreBreakdown: r.ScoreBreakdown,
		EntriesCount: r.EntriesCount, IsFrozen: r.IsFrozen,
		IsDisqualified: r.IsDisqualified, DqReason: r.DqReason,
		UpdatedAt: PgTimeVal(r.UpdatedAt),
		EntryID: r.ContestEntryID, DisplayName: r.DisplayName,
		EntryType: string(r.EntryType), EntryMode: string(r.EntryMode),
	}
}

func ContestPhaseRowToResponse(r db.GetContestPhaseLeaderboardRow) LeaderboardRow {
	return LeaderboardRow{
		Rank: r.Rank, Score: r.Score, ScoreBreakdown: r.ScoreBreakdown,
		EntriesCount: r.EntriesCount, IsFrozen: r.IsFrozen,
		IsDisqualified: r.IsDisqualified, DqReason: r.DqReason,
		UpdatedAt: PgTimeVal(r.UpdatedAt),
		EntryID: r.ContestEntryID, DisplayName: r.DisplayName,
		EntryType: string(r.EntryType), EntryMode: string(r.EntryMode),
	}
}
