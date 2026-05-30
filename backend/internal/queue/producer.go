package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	StreamJobsJudge   = "jobs:judge"
	StreamJobsResults = "jobs:results"
)

type JudgeEnvelope struct {
	SubmissionID uuid.UUID `json:"submission_id"`
	TraceID      uuid.UUID `json:"trace_id,omitempty"`
	EnqueuedAt   time.Time `json:"enqueued_at,omitempty"`
}

type Producer struct {
	rdb *redis.Client
}

func NewProducer(rdb *redis.Client) *Producer {
	return &Producer{rdb: rdb}
}

func (p *Producer) EnqueueJudge(ctx context.Context, submissionID uuid.UUID, traceID *uuid.UUID) error {
	if p == nil || p.rdb == nil {
		return fmt.Errorf("redis not configured")
	}
	env := JudgeEnvelope{SubmissionID: submissionID, EnqueuedAt: time.Now().UTC()}
	if traceID != nil {
		env.TraceID = *traceID
	}
	payload, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal judge envelope: %w", err)
	}
	return p.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamJobsJudge,
		MaxLen: 100_000,
		Approx: true,
		Values: map[string]any{"payload": string(payload)},
	}).Err()
}
