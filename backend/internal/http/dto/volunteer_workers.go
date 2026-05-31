package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
)

type RegisterWorkerRequest struct {
	DisplayName  string          `json:"display_name" validate:"required,max=120"`
	Capabilities json.RawMessage `json:"capabilities" validate:"required"`
}

type HeartbeatRequest struct {
	CPUUsage int `json:"cpu_usage" validate:"min=0,max=100"`
	RAMUsage int `json:"ram_usage" validate:"min=0,max=100"`
}

type JobResultRequest struct {
	Status       string          `json:"status" validate:"required,oneof=done failed"`
	RawScore     *float64        `json:"raw_score"`
	DisplayScore *float64        `json:"display_score"`
	Payload      json.RawMessage `json:"payload"`
	ErrorMessage *string         `json:"error_message"`
}

type WorkerResponse struct {
	ID            uuid.UUID       `json:"id"`
	DisplayName   string          `json:"display_name"`
	Status        string          `json:"status"`
	Capabilities  json.RawMessage `json:"capabilities"`
	Online        bool            `json:"online"`
	LastSeenAt    *time.Time      `json:"last_seen_at"`
	CurrentJobID  *uuid.UUID      `json:"current_job_id"`
	JobsCompleted int32           `json:"jobs_completed"`
	JobsFailed    int32           `json:"jobs_failed"`
	ApprovedAt    *time.Time      `json:"approved_at"`
	CreatedAt     time.Time       `json:"created_at"`
}

type ApproveWorkerResponse struct {
	Worker WorkerResponse `json:"worker"`
	Token  string         `json:"token"`
}

type ArtifactURL struct {
	Type             string `json:"type"`
	Key              string `json:"key"`
	OriginalFilename string `json:"original_filename"`
	URL              string `json:"url"`
}

type JobResponse struct {
	SubmissionID uuid.UUID       `json:"submission_id"`
	TaskID       uuid.UUID       `json:"task_id"`
	PhaseID      uuid.UUID       `json:"phase_id"`
	IsFinal      bool            `json:"is_final"`
	JudgeKey     string          `json:"judge_key"`
	Context      json.RawMessage `json:"context"`
	Artifacts    []ArtifactURL   `json:"artifacts"`
	TimeoutSecs  int             `json:"timeout_secs"`
}

func VolunteerWorkerToResponse(w db.VolunteerWorker) WorkerResponse {
	r := WorkerResponse{
		ID:            w.ID,
		DisplayName:   w.DisplayName,
		Status:        string(w.Status),
		Capabilities:  json.RawMessage(w.Capabilities),
		JobsCompleted: w.JobsCompleted,
		JobsFailed:    w.JobsFailed,
	}
	if w.LastSeenAt.Valid {
		t := w.LastSeenAt.Time
		r.LastSeenAt = &t
		r.Online = time.Since(t) < 2*time.Minute
	}
	if w.CurrentJobID.Valid {
		id := w.CurrentJobID.Bytes
		uid := uuid.UUID(id)
		r.CurrentJobID = &uid
	}
	if w.ApprovedAt.Valid {
		t := w.ApprovedAt.Time
		r.ApprovedAt = &t
	}
	if w.CreatedAt.Valid {
		r.CreatedAt = w.CreatedAt.Time
	}
	return r
}

