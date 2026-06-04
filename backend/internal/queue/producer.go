package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/mank1/olpai-backend/internal/metrics"
)

const (
	StreamJobsJudge     = "jobs:judge"
	StreamJobsResults   = "jobs:results"
	WorkerConsumerGroup = "cg:judge-worker"
	apiConsumerName     = "api-dispatcher"
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
	if err := p.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamJobsJudge,
		MaxLen: 100_000,
		Approx: true,
		Values: map[string]any{"payload": string(payload)},
	}).Err(); err != nil {
		return err
	}
	if n, err := p.rdb.XLen(ctx, StreamJobsJudge).Result(); err == nil {
		metrics.QueueDepth.WithLabelValues(StreamJobsJudge).Set(float64(n))
	}
	return nil
}

// EnsureConsumerGroup creates the consumer group if it does not exist.
func (p *Producer) EnsureConsumerGroup(ctx context.Context) error {
	if p == nil || p.rdb == nil {
		return nil
	}
	err := p.rdb.XGroupCreateMkStream(ctx, StreamJobsJudge, WorkerConsumerGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("create consumer group: %w", err)
	}
	return nil
}

// DequeueOne reads a single job from the stream for volunteer dispatch (non-blocking).
func (p *Producer) DequeueOne(ctx context.Context) (*JudgeEnvelope, string, error) {
	if p == nil || p.rdb == nil {
		return nil, "", fmt.Errorf("redis not configured")
	}
	msgs, err := p.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    WorkerConsumerGroup,
		Consumer: apiConsumerName,
		Streams:  []string{StreamJobsJudge, ">"},
		Count:    1,
		Block:    -1,
	}).Result()
	if err == redis.Nil || len(msgs) == 0 || len(msgs[0].Messages) == 0 {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", fmt.Errorf("xreadgroup: %w", err)
	}
	msg := msgs[0].Messages[0]
	payload, ok := msg.Values["payload"].(string)
	if !ok {
		_ = p.rdb.XAck(ctx, StreamJobsJudge, WorkerConsumerGroup, msg.ID)
		return nil, "", fmt.Errorf("invalid message payload")
	}
	var env JudgeEnvelope
	if err := json.Unmarshal([]byte(payload), &env); err != nil {
		_ = p.rdb.XAck(ctx, StreamJobsJudge, WorkerConsumerGroup, msg.ID)
		return nil, "", fmt.Errorf("unmarshal envelope: %w", err)
	}
	return &env, msg.ID, nil
}

// PeekPendingJobs reads up to n pending messages from the stream WITHOUT consuming them.
// Uses XRANGE which does not affect consumer group state.
func (p *Producer) PeekPendingJobs(ctx context.Context, n int) ([]redis.XMessage, error) {
	if p == nil || p.rdb == nil {
		return nil, nil
	}
	return p.rdb.XRangeN(ctx, StreamJobsJudge, "-", "+", int64(n)).Result()
}

// Ack acknowledges a message as processed.
func (p *Producer) Ack(ctx context.Context, msgID string) error {
	if p == nil || p.rdb == nil {
		return nil
	}
	return p.rdb.XAck(ctx, StreamJobsJudge, WorkerConsumerGroup, msgID).Err()
}

func (p *Producer) EnqueueResult(ctx context.Context, submissionID uuid.UUID, typ string) error {
	if p == nil || p.rdb == nil {
		return fmt.Errorf("redis not configured")
	}
	env := ResultEnvelope{SubmissionID: submissionID, Type: typ}
	payload, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal result envelope: %w", err)
	}
	return p.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamJobsResults,
		MaxLen: 100_000,
		Approx: true,
		Values: map[string]any{"payload": string(payload)},
	}).Err()
}

