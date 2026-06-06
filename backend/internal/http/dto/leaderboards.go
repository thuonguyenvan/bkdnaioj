package dto

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
)

// Shared leaderboard row shape for both task-phase and contest-phase boards.
type LeaderboardRow struct {
	Rank           *int32          `json:"rank"`
	Score          string          `json:"score"`
	RawScore       string          `json:"raw_score"`
	ScoreBreakdown json.RawMessage `json:"score_breakdown,omitempty"`
	EntriesCount   int32           `json:"entries_count"`
	IsFrozen       bool            `json:"is_frozen"`
	IsDisqualified bool            `json:"is_disqualified"`
	DqReason       *string         `json:"dq_reason,omitempty"`
	UpdatedAt      time.Time       `json:"updated_at"`
	// Embedded entry brief
	EntryID         uuid.UUID  `json:"entry_id"`
	DisplayName     string     `json:"display_name"`
	EntryType       string     `json:"entry_type"`
	EntryMode       string     `json:"entry_mode"`
	Usernames       []string   `json:"usernames"`
	FullNames       []string   `json:"full_names"`
	LastSubmittedAt *time.Time `json:"last_submitted_at"`
	PenaltyMinutes  float64    `json:"penalty_minutes"`
}

type GlobalRankingRow struct {
	Rank        int32           `json:"rank"`
	DisplayName string          `json:"display_name"`
	FullName    string          `json:"full_name"`
	UserEmail   string          `json:"user_email"`
	TotalScore  string          `json:"total_score"`
	TaskCount   int32           `json:"task_count"`
	Details     json.RawMessage `json:"details"`
}

func convertStringArray(emails interface{}) []string {
	if emails == nil {
		return []string{}
	}
	if arr, ok := emails.([]string); ok {
		return arr
	}
	if arr, ok := emails.([]interface{}); ok {
		res := make([]string, 0, len(arr))
		for _, v := range arr {
			if s, ok := v.(string); ok {
				res = append(res, s)
			}
		}
		return res
	}
	return []string{}
}

func pgTimestamptzToPtr(ts pgtype.Timestamptz) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time
	return &t
}

func interfaceToTimePtr(v interface{}) *time.Time {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case time.Time:
		return &t
	case pgtype.Timestamptz:
		return pgTimestamptzToPtr(t)
	}
	return nil
}

func parseNumeric(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}

func TaskPhaseRowToResponse(r db.GetTaskPhaseLeaderboardRow) LeaderboardRow {
	return LeaderboardRow{
		Rank: r.Rank, Score: r.Score, RawScore: r.RawScore, ScoreBreakdown: r.ScoreBreakdown,
		EntriesCount: r.EntriesCount, IsFrozen: r.IsFrozen,
		IsDisqualified: r.IsDisqualified, DqReason: r.DqReason,
		UpdatedAt: PgTimeVal(r.UpdatedAt),
		EntryID: r.ContestEntryID, DisplayName: r.DisplayName,
		EntryType: string(r.EntryType), EntryMode: string(r.EntryMode),
		Usernames:       convertStringArray(r.Usernames),
		FullNames:       convertStringArray(r.FullNames),
		LastSubmittedAt: pgTimestamptzToPtr(r.LastSubmittedAt),
		PenaltyMinutes:  parseNumeric(r.PenaltyMinutes),
	}
}

func ContestPhaseRowToResponse(r db.GetContestPhaseLeaderboardRow) LeaderboardRow {
	return LeaderboardRow{
		Rank: r.Rank, Score: r.Score, RawScore: r.RawScore, ScoreBreakdown: r.ScoreBreakdown,
		EntriesCount: r.EntriesCount, IsFrozen: r.IsFrozen,
		IsDisqualified: r.IsDisqualified, DqReason: r.DqReason,
		UpdatedAt: PgTimeVal(r.UpdatedAt),
		EntryID: r.ContestEntryID, DisplayName: r.DisplayName,
		EntryType: string(r.EntryType), EntryMode: string(r.EntryMode),
		Usernames:       convertStringArray(r.Usernames),
		FullNames:       convertStringArray(r.FullNames),
		LastSubmittedAt: interfaceToTimePtr(r.LastSubmittedAt),
		PenaltyMinutes:  parseNumeric(r.PenaltyMinutes),
	}
}

func GlobalRankingRowToResponse(r db.GetGlobalPhaseRankingRow) GlobalRankingRow {
	fullName := ""
	if r.FullName != nil {
		fullName = *r.FullName
	}
	return GlobalRankingRow{
		Rank:        r.Rank,
		DisplayName: r.DisplayName,
		FullName:    fullName,
		UserEmail:   r.UserEmail,
		TotalScore:  r.TotalScore,
		TaskCount:   r.TaskCount,
		Details:     json.RawMessage(r.Details),
	}
}
