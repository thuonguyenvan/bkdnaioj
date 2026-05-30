package queue

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/mank1/olpai-backend/db"
)

func TestRedisStreams_Smoke_EnqueueAndBridge(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	producer := NewProducer(rdb)

	subID := uuid.New()
	if err := producer.EnqueueJudge(context.Background(), subID, nil); err != nil {
		t.Fatalf("enqueue judge: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var taskCalls int32
	var contestCalls int32

	bridge := NewLeaderboardBridge(rdb, nil, zerolog.Nop()).WithHandlers(
		func(ctx context.Context, submissionID uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: submissionID}, nil
		},
		func(ctx context.Context, sub db.Submission) error {
			atomic.AddInt32(&taskCalls, 1)
			return nil
		},
		func(ctx context.Context, sub db.Submission) error {
			atomic.AddInt32(&contestCalls, 1)
			return nil
		},
	)

	// Avoid a race where the first message is produced before the consumer group exists.
	_ = rdb.XGroupCreateMkStream(context.Background(), StreamJobsResults, "cg:leaderboard-bridge", "$").Err()

	done := make(chan error, 1)
	go func() { done <- bridge.Run(ctx) }()

	payload, _ := json.Marshal(ResultEnvelope{SubmissionID: subID, Type: "done"})
	if err := rdb.XAdd(context.Background(), &redis.XAddArgs{
		Stream: StreamJobsResults,
		Values: map[string]any{"payload": string(payload)},
	}).Err(); err != nil {
		cancel()
		<-done
		t.Fatalf("xadd results: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if atomic.LoadInt32(&taskCalls) > 0 && atomic.LoadInt32(&contestCalls) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	<-done

	if atomic.LoadInt32(&taskCalls) == 0 {
		t.Fatalf("expected task-phase recompute to be called")
	}
	if atomic.LoadInt32(&contestCalls) == 0 {
		t.Fatalf("expected contest-phase recompute to be called")
	}
}
