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
	MaxWorkers   int16           `json:"max_workers" validate:"min=1,max=32"`
}

type HeartbeatRequest struct {
	CPUUsage int `json:"cpu_usage" validate:"min=0,max=100"`
	RAMUsage int `json:"ram_usage" validate:"min=0,max=100"`
}

type JobResultRequest struct {
	AttemptID    uuid.UUID       `json:"attempt_id" validate:"required"`
	Status       string          `json:"status" validate:"required,oneof=done failed"`
	RawScore     *float64        `json:"raw_score"`
	DisplayScore *float64        `json:"display_score"`
	Payload      json.RawMessage `json:"payload"`
	ErrorMessage *string         `json:"error_message"`
}

type JobHeartbeatRequest struct {
	AttemptID uuid.UUID `json:"attempt_id" validate:"required"`
}

type WorkerResponse struct {
	ID            uuid.UUID       `json:"id"`
	DisplayName   string          `json:"display_name"`
	Status        string          `json:"status"`
	Capabilities  json.RawMessage `json:"capabilities"`
	Online        bool            `json:"online"`
	LastSeenAt    *time.Time      `json:"last_seen_at"`
	MaxWorkers    int16           `json:"max_workers"`
	ActiveJobs    int64           `json:"active_jobs"`
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
	AttemptID    uuid.UUID       `json:"attempt_id"`
	TaskID       uuid.UUID       `json:"task_id"`
	PhaseID      uuid.UUID       `json:"phase_id"`
	IsFinal      bool            `json:"is_final"`
	JudgeKey     string          `json:"judge_key"`
	Context      json.RawMessage `json:"context"`
	Artifacts    []ArtifactURL   `json:"artifacts"`
	TimeoutSecs  int             `json:"timeout_secs"`
}

// SchedulerSnapshot is the SSE payload streamed to the admin dashboard.
type SchedulerSnapshot struct {
	Workers    []WorkerSnapshotItem `json:"workers"`
	QueueDepth int64                `json:"queue_depth"`
	RecentLogs []ScheduleLogItem    `json:"recent_logs"`
	Timestamp  time.Time            `json:"timestamp"`
}

type WorkerSnapshotItem struct {
	ID            uuid.UUID       `json:"id"`
	DisplayName   string          `json:"display_name"`
	StatusLabel   string          `json:"status_label"` // online_idle | online_busy | offline
	Online        bool            `json:"online"`
	ActiveJobs    int64           `json:"active_jobs"`
	MaxWorkers    int16           `json:"max_workers"`
	Capabilities  json.RawMessage `json:"capabilities"`
	CPUUsage      *int16          `json:"cpu_usage"`
	RAMUsage      *int16          `json:"ram_usage"`
	JobsCompleted int32           `json:"jobs_completed"`
	JobsFailed    int32           `json:"jobs_failed"`
	LastSeenAt    *time.Time      `json:"last_seen_at"`
}

type ScheduleLogItem struct {
	SubmissionID     uuid.UUID `json:"submission_id"`
	WorkerID         uuid.UUID `json:"worker_id"`
	WorkerName       string    `json:"worker_name"`
	PhaseKey         string    `json:"phase_key"`
	IsFinal          bool      `json:"is_final"`
	PredictedSeconds *float32  `json:"predicted_seconds"`
	ActualSeconds    *float32  `json:"actual_seconds"`
	ErrorRatio       *float32  `json:"error_ratio"`
	CreatedAt        time.Time `json:"created_at"`
}

func VolunteerWorkerToResponse(w db.VolunteerWorker) WorkerResponse {
	r := WorkerResponse{
		ID:            w.ID,
		DisplayName:   w.DisplayName,
		Status:        string(w.Status),
		Capabilities:  json.RawMessage(w.Capabilities),
		MaxWorkers:    w.MaxWorkers,
		JobsCompleted: w.JobsCompleted,
		JobsFailed:    w.JobsFailed,
	}
	if w.LastSeenAt.Valid {
		t := w.LastSeenAt.Time
		r.LastSeenAt = &t
		r.Online = time.Since(t) < 2*time.Minute
	}
	// CurrentJobID removed — now tracked in volunteer_worker_claims table
	if w.ApprovedAt.Valid {
		t := w.ApprovedAt.Time
		r.ApprovedAt = &t
	}
	if w.CreatedAt.Valid {
		r.CreatedAt = w.CreatedAt.Time
	}
	return r
}
