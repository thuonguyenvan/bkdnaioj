package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
)

// --- Tasks ---

var DefaultSubmissionSchema = json.RawMessage(`{"non_final":{"description":"Upload output artifact theo yêu cầu đề bài","examples":["submission.zip","adversarial_images.zip","predictions.jsonl"],"max_files":10},"final":{"description":"Upload checkpoint/code inference theo yêu cầu đề bài","examples":["final_submission.zip"],"max_files":10,"inference_entrypoint":"infer.py"},"task_assets":{"required_assets":["judge.py"],"description":"BTC uploads the shared task-level judge entrypoint once."},"evaluation":{"required_assets":["ground_truth","inputs"],"description":"BTC uploads task-specific ground_truth and inputs assets for each public/private evaluation set. The concrete file formats are defined by BTC and consumed by judge.py/infer.py."}}`)

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

type UpdateTaskRequest struct {
	Title               *string          `json:"title,omitempty" validate:"omitempty,min=2,max=500"`
	Description         *string          `json:"description,omitempty"`
	ProblemStatementURL *string          `json:"problem_statement_url,omitempty"`
	SubmissionSchema    *json.RawMessage `json:"submission_schema,omitempty"`
	ScoreLabel          *string          `json:"score_label,omitempty" validate:"omitempty,max=120"`
	HigherIsBetter      *bool            `json:"higher_is_better,omitempty"`
	SortOrder           *int32           `json:"sort_order,omitempty"`
}

type TaskResponse struct {
	ID                  uuid.UUID           `json:"id"`
	ContestID           uuid.UUID           `json:"contest_id"`
	Slug                string              `json:"slug"`
	Title               string              `json:"title"`
	Description         *string             `json:"description,omitempty"`
	ProblemStatementURL *string             `json:"problem_statement_url,omitempty"`
	SubmissionSchema    json.RawMessage     `json:"submission_schema"`
	Assets              []TaskAssetResponse `json:"assets"`
	AssetKeys           []string            `json:"asset_keys"`
	RequiredAssets      []string            `json:"required_assets"`
	ScoreLabel          string              `json:"score_label"`
	HigherIsBetter      bool                `json:"higher_is_better"`
	SortOrder           int32               `json:"sort_order"`
	CreatedAt           time.Time           `json:"created_at"`
}

type TaskAssetResponse struct {
	ID          uuid.UUID `json:"id"`
	TaskID      uuid.UUID `json:"task_id"`
	AssetKey    string    `json:"asset_key"`
	Filename    string    `json:"filename"`
	ObjectKey   string    `json:"object_key"`
	SizeBytes   int64     `json:"size_bytes"`
	ContentType *string   `json:"content_type,omitempty"`
	SHA256      *string   `json:"sha256,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

func TaskToResponse(t db.Task) TaskResponse {
	return TaskResponse{
		ID: t.ID, ContestID: t.ContestID, Slug: t.Slug, Title: t.Title,
		Description: t.Description, ProblemStatementURL: t.ProblemStatementUrl,
		SubmissionSchema: t.SubmissionSchema, Assets: nil, AssetKeys: nil, RequiredAssets: []string{"judge.py"}, ScoreLabel: t.ScoreLabel,
		HigherIsBetter: t.HigherIsBetter, SortOrder: t.SortOrder,
		CreatedAt: PgTimeVal(t.CreatedAt),
	}
}

func TaskAssetToResponse(a db.TaskAsset) TaskAssetResponse {
	return TaskAssetResponse{
		ID: a.ID, TaskID: a.TaskID, AssetKey: a.AssetKey,
		Filename: a.OriginalFilename, ObjectKey: a.StoragePath, SizeBytes: a.FileSize,
		ContentType: a.ContentType, SHA256: a.HashSha256, CreatedAt: PgTimeVal(a.CreatedAt),
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
	EvaluationSetID     uuid.UUID `json:"evaluation_set_id" validate:"required"`
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
	ID                  uuid.UUID `json:"id"`
	TaskID              uuid.UUID `json:"task_id"`
	ContestPhaseDefID   uuid.UUID `json:"contest_phase_def_id"`
	EvaluationSetID     uuid.UUID `json:"evaluation_set_id"`
	Slug                string    `json:"slug"`
	Title               string    `json:"title"`
	Description         *string   `json:"description,omitempty"`
	OpenTime            time.Time `json:"open_time"`
	CloseTime           time.Time `json:"close_time"`
	JudgeKey            string    `json:"judge_key"`
	SubmissionLimit     *int32    `json:"submission_limit,omitempty"`
	LeaderboardMode     string    `json:"leaderboard_mode"`
	AllowOfficialSubmit bool      `json:"allow_official_submit"`
	AllowVirtualSubmit  bool      `json:"allow_virtual_submit"`
	AllowPracticeSubmit bool      `json:"allow_practice_submit"`
	DisplayScores       bool      `json:"display_scores"`
	IsFrozen            bool      `json:"is_frozen"`
	IsFinal             bool      `json:"is_final"`
	SortOrder           int32     `json:"sort_order"`
	CreatedAt           time.Time `json:"created_at"`
}

func PhaseToResponse(p db.Phase) PhaseResponse {
	return PhaseResponse{
		ID: p.ID, TaskID: p.TaskID, ContestPhaseDefID: p.ContestPhaseDefID,
		EvaluationSetID: p.EvaluationSetID,
		Slug:            p.Slug, Title: p.Title, Description: p.Description,
		OpenTime: PgTimeVal(p.OpenTime), CloseTime: PgTimeVal(p.CloseTime),
		JudgeKey: p.JudgeKey, SubmissionLimit: p.SubmissionLimit,
		LeaderboardMode:     string(p.LeaderboardMode),
		AllowOfficialSubmit: p.AllowOfficialSubmit, AllowVirtualSubmit: p.AllowVirtualSubmit,
		AllowPracticeSubmit: p.AllowPracticeSubmit, DisplayScores: p.DisplayScores,
		IsFrozen: p.IsFrozen, IsFinal: p.IsFinal, SortOrder: p.SortOrder,
		CreatedAt: PgTimeVal(p.CreatedAt),
	}
}

type CreateEvaluationSetRequest struct {
	Key         string  `json:"key" validate:"required,oneof=public private"`
	Title       string  `json:"title" validate:"required,min=2,max=255"`
	Description *string `json:"description,omitempty"`
}

type EvaluationSetResponse struct {
	ID             uuid.UUID                    `json:"id"`
	TaskID         uuid.UUID                    `json:"task_id"`
	Key            string                       `json:"key"`
	Title          string                       `json:"title"`
	Description    *string                      `json:"description,omitempty"`
	CreatedAt      time.Time                    `json:"created_at"`
	Assets         []EvaluationSetAssetResponse `json:"assets"`
	AssetKeys      []string                     `json:"asset_keys"`
	RequiredAssets []string                     `json:"required_assets"`
	HasJudgeScript bool                         `json:"has_judge_script"`
	HasGroundTruth bool                         `json:"has_ground_truth"`
	HasInputs      bool                         `json:"has_inputs"`
}

func EvaluationSetToResponse(s db.TaskEvaluationSet) EvaluationSetResponse {
	return EvaluationSetResponse{
		ID: s.ID, TaskID: s.TaskID, Key: string(s.Key), Title: s.Title,
		Description: s.Description, CreatedAt: PgTimeVal(s.CreatedAt),
		Assets: nil, AssetKeys: nil, RequiredAssets: []string{"ground_truth", "inputs"},
		HasJudgeScript: false, HasGroundTruth: false, HasInputs: false,
	}
}

type InitiateEvaluationSetAssetsRequest struct {
	Assets []InitiateEvaluationSetAssetRequest `json:"assets" validate:"required,min=1"`
}

type InitiateEvaluationSetAssetRequest struct {
	AssetKey    string `json:"asset_key" validate:"required,min=1,max=255"`
	Filename    string `json:"filename" validate:"required,min=1,max=500"`
	ContentType string `json:"content_type" validate:"required,min=1,max=255"`
	SizeBytes   int64  `json:"size_bytes" validate:"required,min=1"`
}

type InitiateEvaluationSetAssetsResponse struct {
	Uploads []InitiateEvaluationSetAssetResponse `json:"uploads"`
}

type InitiateEvaluationSetAssetResponse struct {
	AssetKey  string `json:"asset_key"`
	Filename  string `json:"filename"`
	ObjectKey string `json:"object_key"`
	PutURL    string `json:"put_url"`
}

type CompleteEvaluationSetAssetsRequest struct {
	Assets []CompleteEvaluationSetAssetRequest `json:"assets" validate:"required,min=1"`
}

type CompleteEvaluationSetAssetRequest struct {
	AssetKey    string  `json:"asset_key" validate:"required,min=1,max=255"`
	Filename    string  `json:"filename" validate:"required,min=1,max=500"`
	ObjectKey   string  `json:"object_key" validate:"required,min=1,max=1000"`
	SizeBytes   int64   `json:"size_bytes" validate:"required,min=1"`
	ContentType string  `json:"content_type" validate:"required,min=1,max=255"`
	SHA256      *string `json:"sha256,omitempty" validate:"omitempty,max=128"`
}

type EvaluationSetAssetResponse struct {
	ID              uuid.UUID `json:"id"`
	EvaluationSetID uuid.UUID `json:"evaluation_set_id"`
	AssetKey        string    `json:"asset_key"`
	Filename        string    `json:"filename"`
	ObjectKey       string    `json:"object_key"`
	SizeBytes       int64     `json:"size_bytes"`
	ContentType     *string   `json:"content_type,omitempty"`
	SHA256          *string   `json:"sha256,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

func EvaluationSetAssetToResponse(a db.EvaluationSetAsset) EvaluationSetAssetResponse {
	return EvaluationSetAssetResponse{
		ID: a.ID, EvaluationSetID: a.EvaluationSetID, AssetKey: a.AssetKey,
		Filename: a.OriginalFilename, ObjectKey: a.StoragePath, SizeBytes: a.FileSize,
		ContentType: a.ContentType, SHA256: a.HashSha256, CreatedAt: PgTimeVal(a.CreatedAt),
	}
}
