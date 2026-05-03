package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
)

// --- Tasks ---

type CreateTaskRequest struct {
	Slug                string           `json:"slug" validate:"required,min=2,max=120"`
	Title               string           `json:"title" validate:"required,min=2,max=500"`
	Description         *string          `json:"description,omitempty"`
	ProblemStatementURL *string          `json:"problem_statement_url,omitempty"`
	SubmissionSchema    *json.RawMessage `json:"submission_schema,omitempty"`
	ScoreLabel          string           `json:"score_label" validate:"required,max=120"`
	HigherIsBetter      bool             `json:"higher_is_better"`
	SortOrder           int32            `json:"sort_order"`
}

type TaskResponse struct {
	ID                  uuid.UUID       `json:"id"`
	ContestID           uuid.UUID       `json:"contest_id"`
	Slug                string          `json:"slug"`
	Title               string          `json:"title"`
	Description         *string         `json:"description,omitempty"`
	ProblemStatementURL *string         `json:"problem_statement_url,omitempty"`
	SubmissionSchema    json.RawMessage `json:"submission_schema"`
	ScoreLabel          string          `json:"score_label"`
	HigherIsBetter      bool            `json:"higher_is_better"`
	SortOrder           int32           `json:"sort_order"`
	CreatedAt           time.Time       `json:"created_at"`
}

func TaskToResponse(t db.Task) TaskResponse {
	return TaskResponse{
		ID: t.ID, ContestID: t.ContestID, Slug: t.Slug, Title: t.Title,
		Description: t.Description, ProblemStatementURL: t.ProblemStatementUrl,
		SubmissionSchema: t.SubmissionSchema, ScoreLabel: t.ScoreLabel,
		HigherIsBetter: t.HigherIsBetter, SortOrder: t.SortOrder,
		CreatedAt: PgTimeVal(t.CreatedAt),
	}
}

// --- ContestPhaseDefs ---

type CreatePhaseDefRequest struct {
	Key       string `json:"key" validate:"required,oneof=public_test private_test final_public final_private"`
	Title     string `json:"title" validate:"required,min=2,max=255"`
	SortOrder int32  `json:"sort_order"`
}

type PhaseDefResponse struct {
	ID        uuid.UUID `json:"id"`
	ContestID uuid.UUID `json:"contest_id"`
	Key       string    `json:"key"`
	Title     string    `json:"title"`
	SortOrder int32     `json:"sort_order"`
}

func PhaseDefToResponse(d db.ContestPhaseDef) PhaseDefResponse {
	return PhaseDefResponse{
		ID: d.ID, ContestID: d.ContestID, Key: string(d.Key),
		Title: d.Title, SortOrder: d.SortOrder,
	}
}

// --- Phases ---

type CreatePhaseRequest struct {
	ContestPhaseDefID   uuid.UUID `json:"contest_phase_def_id" validate:"required"`
	Slug                string    `json:"slug" validate:"required,min=2,max=120"`
	Title               string    `json:"title" validate:"required,min=2,max=255"`
	Description         *string   `json:"description,omitempty"`
	OpenTime            time.Time `json:"open_time" validate:"required"`
	CloseTime           time.Time `json:"close_time" validate:"required"`
	JudgeKey            string    `json:"judge_key" validate:"required,max=255"`
	SubmissionLimit     *int32    `json:"submission_limit,omitempty"`
	LeaderboardMode     string    `json:"leaderboard_mode" validate:"required,oneof=best latest"`
	AllowOfficialSubmit bool      `json:"allow_official_submit"`
	AllowVirtualSubmit  bool      `json:"allow_virtual_submit"`
	AllowPracticeSubmit bool      `json:"allow_practice_submit"`
	DisplayScores       bool      `json:"display_scores"`
	IsFinal             bool      `json:"is_final"`
	SortOrder           int32     `json:"sort_order"`
}

type PhaseResponse struct {
	ID                  uuid.UUID  `json:"id"`
	TaskID              uuid.UUID  `json:"task_id"`
	ContestPhaseDefID   uuid.UUID  `json:"contest_phase_def_id"`
	Slug                string     `json:"slug"`
	Title               string     `json:"title"`
	Description         *string    `json:"description,omitempty"`
	OpenTime            time.Time  `json:"open_time"`
	CloseTime           time.Time  `json:"close_time"`
	JudgeKey            string     `json:"judge_key"`
	SubmissionLimit     *int32     `json:"submission_limit,omitempty"`
	LeaderboardMode     string     `json:"leaderboard_mode"`
	AllowOfficialSubmit bool       `json:"allow_official_submit"`
	AllowVirtualSubmit  bool       `json:"allow_virtual_submit"`
	AllowPracticeSubmit bool       `json:"allow_practice_submit"`
	DisplayScores       bool       `json:"display_scores"`
	IsFrozen            bool       `json:"is_frozen"`
	IsFinal             bool       `json:"is_final"`
	SortOrder           int32      `json:"sort_order"`
	CreatedAt           time.Time  `json:"created_at"`
}

func PhaseToResponse(p db.Phase) PhaseResponse {
	return PhaseResponse{
		ID: p.ID, TaskID: p.TaskID, ContestPhaseDefID: p.ContestPhaseDefID,
		Slug: p.Slug, Title: p.Title, Description: p.Description,
		OpenTime: PgTimeVal(p.OpenTime), CloseTime: PgTimeVal(p.CloseTime),
		JudgeKey: p.JudgeKey, SubmissionLimit: p.SubmissionLimit,
		LeaderboardMode: string(p.LeaderboardMode),
		AllowOfficialSubmit: p.AllowOfficialSubmit, AllowVirtualSubmit: p.AllowVirtualSubmit,
		AllowPracticeSubmit: p.AllowPracticeSubmit, DisplayScores: p.DisplayScores,
		IsFrozen: p.IsFrozen, IsFinal: p.IsFinal, SortOrder: p.SortOrder,
		CreatedAt: PgTimeVal(p.CreatedAt),
	}
}
