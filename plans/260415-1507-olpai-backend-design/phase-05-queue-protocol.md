# Phase 5: Queue Protocol (Redis Streams)

**Status:** 🆕 New
**Refs:** phases 02/03/04

---

## 1. Why Redis Streams

- Cross-language (Go producer, Python consumer) without Celery/asynq incompatibility
- Persistent log + consumer groups + ACK. (XPENDING reclaim / at-least-once recovery deferred to V2)
- Built into Redis 7 (already in stack)
- Simple JSON envelope; no client library lock-in

---

## 2. Stream Topology

Lean V1 uses a single judging queue. One job == one submission.

| Stream | Producer | Consumer Group | Consumers |
|---|---|---|---|
| `jobs:judge`    | ORCH (Go) | `cg:judge-worker` | Python judge workers |
| `jobs:results`  | Python judge worker | `cg:leaderboard-bridge` | Go (leaderboard recompute; polling UI) |
| `jobs:dlq`      | *(V2)* | *(V2)* | *(V2)* |

---

## 3. Envelope Schema

For `jobs:judge`, keep the payload minimal; workers derive all context from Postgres by `submission_id`.

```json
{
  "submission_id": "uuid",
  "trace_id": "uuid",             // optional
  "enqueued_at": "2026-04-24T12:34:56Z" // optional
}
```

Stored as Redis stream entry fields (single field `payload` containing a JSON string).

---

## 4. Producer (Go)

```go
// internal/queue/producer.go
type JobEnvelope struct {
    SubmissionID uuid.UUID `json:"submission_id"`
    EnqueuedAt   time.Time `json:"enqueued_at,omitempty"`
    TraceID      uuid.UUID `json:"trace_id,omitempty"`
}

func (p *Producer) Enqueue(ctx context.Context, stream string, env JobEnvelope) error {
    payload, _ := json.Marshal(env)
    return p.rdb.XAdd(ctx, &redis.XAddArgs{
        Stream: stream,
        MaxLen: 100_000,
        Approx: true,
        Values: map[string]any{"payload": string(payload)},
    }).Err()
}
```

Called from orchestrator after submission row + artifact persisted:
```go
producer.Enqueue(ctx, "jobs:judge", JobEnvelope{SubmissionID: subID, TraceID: traceID, EnqueuedAt: time.Now().UTC()})
```

---

## 5. Consumer (Python)

```python
# workers/app/queue.py
# Lean V1: no retry/DLQ. On any failure, persist `submissions.status='failed'` + `error_message`, then ACK.
def consume(stream: str, group: str, consumer: str, handler):
    rdb.xgroup_create(stream, group, id="$", mkstream=True)  # idempotent
    while True:
        resp = rdb.xreadgroup(group, consumer,
                              streams={stream: ">"},
                              count=BATCH, block=5000)
        for _stream, msgs in resp or []:
            for msg_id, fields in msgs:
                env = json.loads(fields[b"payload"])
                try:
                    handler(env)
                except Exception as e:
                    handler.mark_failed(env, str(e))
                finally:
                    rdb.xack(stream, group, msg_id)
```

---

## 6. Reclaim Sweeper (V2)

Deferred to V2. Lean V1 does not implement reclaim/retry/DLQ.

If a worker crashes mid-job, the submission may remain `running`; admins can requeue manually via an admin endpoint/action. In V2 we can add XPENDING reclaim + controlled retry schedule.

---

## 7. Retry Policy (V2)

Lean V1 does not implement retries/backoff/DLQ. If judging fails, the worker marks the submission as failed and persists an error message.

Retry/backoff can be added in V2 using XPENDING reclaim + a controlled retry schedule.

---

## 8. DLQ Handling (V2)

Deferred to V2. Lean V1 simply marks the submission as failed on any error/timeout and relies on logs + admin UI for triage.

---

## 9. Result Stream → Leaderboard Bridge (Go)

Bridge consumes `jobs:results` events emitted by the Python judge worker. It recomputes leaderboards by looking up phase context from Postgres using `submission_id` (no need to carry phase IDs in the message). Lean V1 does not require WebSocket; frontend uses polling.

```go
// internal/queue/consumer.go
func (b *Bridge) Run(ctx context.Context) error {
    rdb.XGroupCreateMkStream(ctx, "jobs:results", "cg:leaderboard-bridge", "$")
    for {
        msgs, _ := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
            Group: "cg:leaderboard-bridge", Consumer: hostname,
            Streams: []string{"jobs:results", ">"},
            Count: 50, Block: 5*time.Second,
        }).Result()
        for _, m := range msgs[0].Messages {
            var r ResultEnvelope
            _ = json.Unmarshal([]byte(m.Values["payload"].(string)), &r)

            srv.RecomputeTaskPhaseBoard(ctx, r.SubmissionID)
            srv.RecomputeContestPhaseBoard(ctx, r.SubmissionID)

            rdb.XAck(ctx, "jobs:results", "cg:leaderboard-bridge", m.ID)
        }
    }
}
```

---

## 10. Single-Writer Rule (recap, enforced via discipline + code review)

| Stream | Allowed DB writes |
|---|---|
| Go `Enqueue` (`jobs:judge`) | submissions INSERT (and enqueue) |
| Python judge worker | submissions UPDATE: status, validation_result, raw_score, display_score, score_payload, evaluated_at, error_message |
| Go `Leaderboard Bridge` (`jobs:results`) | leaderboard UPSERT, NOT submissions |

Code review checklist enforces no overlap.

---

## 11. Observability

- Prometheus metrics from both Go + Python:
  - `stream_lag_ms{stream,group}` (now - last consumed entry time)
  - `judge_exec_ms_bucket{phase}` (worker runtime)
  - `judge_failed_total{reason}`
- Tracing (optional): propagate `trace_id` via envelope; both sides can emit OTel spans

---

## 12. Failure Modes

| Mode | Detection | Recovery |
|---|---|---|
| Worker crash mid-job | submission may remain `running` | admin can requeue manually (V2: reclaim) |
| Bad envelope JSON | consumer parse error | log + ACK + drop |
| Postgres deadlock on score update | worker exception | mark submission failed with error_message (V2: retry policy) |
| Redis down | producer error → 5xx to client | client retries; submission remains queued but not enqueued yet |
| Bridge crash | lag on `jobs:results` consumer group | resumes when bridge restarts |

---

## 13. Todo

- [ ] Go producer + minimal envelope marshaling
- [ ] Python consumer wrapper (XREADGROUP + XACK)
- [ ] Go leaderboard bridge: jobs:results → leaderboard recompute
- [ ] Prometheus metrics for both languages
- [ ] Basic end-to-end integration test (submit → judge → leaderboard visible via polling)

V2:
- sweeper / reclaim / retry / DLQ / auto-ticketing
- high-throughput load testing targets

---

## 14. Success Criteria (Lean V1)

1. API/ORCH enqueues `submission_id` into `jobs:judge` successfully.
2. Python judge worker processes a submission end-to-end: validate/unzip → (final: infer.py) → judge.py → write `done/failed` + score/error_message.
3. Go leaderboard bridge updates task-phase and contest-phase leaderboards after `jobs:results`.
4. Frontend polling sees updated submission status/score and leaderboards.
5. Rejudge works by Go/API re-enqueueing the same `submission_id` (and incrementing `rejudge_count`).
6. Sandbox execution is safe (no network, timeouts, resource limits).

---

## 15. Unresolved Questions

1. **Backpressure:** if `jobs:judge` lags, should producer slow down or queue infinitely (with MAXLEN guard)? Currently MAXLEN=100k approx — acceptable for V1.
2. **Multi-region:** scope V1 is single-region; Streams not replicated cross-region. OK for thesis.
3. **(V2) Sweeper leader election:** Redis SETNX with TTL vs full Raft?
4. **Idempotency on `jobs:results`:** rare double-delivery → ensure leaderboard upsert is idempotent (already is via UNIQUE constraint).
5. **Submission retry endpoint** when Redis down at submit time — manual `POST /submissions/{id}/enqueue` (admin) needed?

---

## 16. Done — Loop Back

Ensure Phase 4 scaffold exposes `internal/queue/{producer,consumer,bridge}.go` with single-writer comment headers, and Phase 3 Python worker references these stream names verbatim. (Sweeper/DLQ are V2.)
