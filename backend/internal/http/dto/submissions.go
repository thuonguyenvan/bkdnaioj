package dto

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
)

type CreateSubmissionRequest struct {
	TaskID  uuid.UUID `json:"task_id" validate:"required"`
	PhaseID uuid.UUID `json:"phase_id" validate:"required"`
}

type InitiateSubmissionUploadRequest struct {
	TaskID  uuid.UUID                   `json:"task_id" validate:"required"`
	PhaseID uuid.UUID                   `json:"phase_id" validate:"required"`
	Files   []InitiateUploadFileRequest `json:"files" validate:"required,min=1"`
}

type InitiateUploadFileRequest struct {
	Filename    string `json:"filename" validate:"required,min=1,max=500"`
	ContentType string `json:"content_type" validate:"required,min=1,max=255"`
	SizeBytes   int64  `json:"size_bytes" validate:"required,min=1"`
}

type InitiateSubmissionUploadResponse struct {
	SubmissionID uuid.UUID                    `json:"submission_id"`
	Uploads      []InitiateUploadFileResponse `json:"uploads"`
}

type InitiateUploadFileResponse struct {
	Filename  string `json:"filename"`
	ObjectKey string `json:"object_key"`
	PutURL    string `json:"put_url"`
}

type CompleteSubmissionUploadRequest struct {
	Files []CompleteUploadFileRequest `json:"files" validate:"required,min=1"`
}

type CompleteUploadFileRequest struct {
	Filename    string  `json:"filename" validate:"required,min=1,max=500"`
	ObjectKey   string  `json:"object_key" validate:"required,min=1,max=1000"`
	SizeBytes   int64   `json:"size_bytes" validate:"required,min=1"`
	ContentType string  `json:"content_type" validate:"required,min=1,max=255"`
	SHA256      *string `json:"sha256,omitempty" validate:"omitempty,max=128"`
}

type SubmissionResponse struct {
	ID             uuid.UUID       `json:"id"`
	ContestID      uuid.UUID       `json:"contest_id"`
	ContestEntryID uuid.UUID       `json:"contest_entry_id"`
	TaskID         uuid.UUID       `json:"task_id"`
	PhaseID        uuid.UUID       `json:"phase_id"`
	SubmittedBy    uuid.UUID       `json:"submitted_by"`
	Status         string          `json:"status"`
	SubmittedAt    time.Time       `json:"submitted_at"`
	FileCount      int32           `json:"file_count"`
	TotalSizeBytes int64           `json:"total_size_bytes"`
	RawScore       *string         `json:"raw_score,omitempty"`
	DisplayScore   *string         `json:"display_score,omitempty"`
	ScorePayload   json.RawMessage `json:"score_payload,omitempty"`
	EvaluatedAt    *time.Time      `json:"evaluated_at,omitempty"`
	IsFinal        bool            `json:"is_final"`
	RejudgeCount   int32           `json:"rejudge_count"`
	ErrorMessage   *string         `json:"error_message,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

func SubmissionToResponse(s db.Submission) SubmissionResponse {
	return SubmissionResponse{
		ID: s.ID, ContestID: s.ContestID, ContestEntryID: s.ContestEntryID,
		TaskID: s.TaskID, PhaseID: s.PhaseID, SubmittedBy: s.SubmittedBy,
		Status: string(s.Status), SubmittedAt: PgTimeVal(s.SubmittedAt),
		FileCount: s.FileCount, TotalSizeBytes: s.TotalSizeBytes,
		RawScore: pgNumericToStr(s.RawScore), DisplayScore: pgNumericToStr(s.DisplayScore),
		ScorePayload: s.ScorePayload, EvaluatedAt: PgTime(s.EvaluatedAt),
		IsFinal: s.IsFinal, RejudgeCount: s.RejudgeCount,
		ErrorMessage: s.ErrorMessage, CreatedAt: PgTimeVal(s.CreatedAt),
	}
}

func pgNumericToStr(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	s := n.Int.String()
	if n.Exp < 0 {
		// Format with decimal point
		f, _ := n.Float64Value()
		if f.Valid {
			str := fmt.Sprintf("%g", f.Float64)
			return &str
		}
	}
	return &s
}
