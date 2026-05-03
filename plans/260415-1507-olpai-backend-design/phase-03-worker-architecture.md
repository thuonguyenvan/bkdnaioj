# Phase 3: Worker Architecture (Python + Redis Streams)

**Status:** 🔄 Rewritten — Celery removed, Redis Streams adopted
**Refs:** spec, brainstorm Go decision, Phase 5 protocol

---

## 1. Pipeline

```
Go API (producer)               Python Workers (consumers)              Go API
       │                                  │                               │
  enqueue jobs:validate ──► validator ──► enqueue jobs:judge              │
                                          │                               │
                                  judge ──► enqueue jobs:score            │
                                          │                               │
                                  score ──► UPDATE submissions            │
                                          ──► XADD jobs:results ──────► WS bridge
                                                                         │
                                                              recompute leaderboards (in Go)
```

Phase derived from `submission.phase_id` inside worker. **No `phase_id` on jobs envelope.**

---

## 2. Tech

| Component | Choice |
|---|---|
| Language | Python 3.11 |
| Redis client | `redis-py` 5.x |
| DB driver | `psycopg[binary]` 3.x |
| Container runtime | Docker SDK or `subprocess` |
| Logging | `structlog` JSON |
| Process mgmt | systemd / Docker Compose |

**No Celery, no SQLAlchemy** — workers stay thin: pull job, run, write score, ack.

---

## 3. Project Layout

```
workers/
  pyproject.toml
  Dockerfile
  app/
    config.py              # env loader
    db.py                  # psycopg pool
    queue.py               # XREADGROUP wrapper
    sandbox/
      docker_runner.py     # Docker exec + limits
      manifest.py          # validate ZIP/files
    judges/
      registry.py          # judge_key -> handler
      accuracy.py f1.py bleu.py psnr.py mae.py cosine.py
    consumers/
      validate.py
      judge.py
      score.py
      rejudge.py
    main.py                # entrypoint: pick consumer by env
```

Each consumer file < 200 LOC.

---

## 4. Consumers

### 4.1 Validator (`jobs:validate`)

```python
def handle(envelope):
    sub_id = envelope["submission_id"]
    sub = db.fetch_submission(sub_id)            # JOIN task for submission_schema
    files = db.fetch_files(sub_id)
    ok, result = manifest.validate(files, sub.task.submission_schema)
    db.update_submission_status(sub_id,
        status="queued" if ok else "failed",
        validation_result=result,
    )
    db.insert_eval_job(sub_id, job_type="validate", status="done" if ok else "failed", output_data=result)
    if ok:
        queue.xadd("jobs:judge", envelope)
    else:
        queue.xadd("jobs:results", {"submission_id": sub_id, "type": "failed", "stage": "validate"})
```

### 4.2 Judge (`jobs:judge`)

```python
def handle(envelope):
    sub_id = envelope["submission_id"]
    sub = db.fetch_submission_with_phase(sub_id)
    judge = registry.get(sub.phase.judge_key)
    db.update_submission_status(sub_id, status="running")
    db.insert_eval_job(sub_id, job_type="judge", status="running")
    try:
        result = sandbox.run(judge, sub)         # Docker exec, returns JudgeResult
        db.update_eval_job_done(..., output_data=result.dict(), execution_time_ms=...)
        envelope["judge_result"] = result.dict()
        queue.xadd("jobs:score", envelope)
    except Exception as e:
        db.update_submission_status(sub_id, status="failed", error_message=str(e))
        db.update_eval_job_failed(...)
        queue.xadd("jobs:results", {"submission_id": sub_id, "type": "failed", "stage": "judge"})
```

### 4.3 Scorer (`jobs:score`)

```python
def handle(envelope):
    sub_id = envelope["submission_id"]
    r = envelope["judge_result"]
    db.update_submission_score(sub_id,
        raw_score=r["raw_score"],
        display_score=r["display_score"],
        score_payload=r.get("payload"),
        evaluated_at=now(),
        status="done",
    )
    queue.xadd("jobs:results", {
        "submission_id": sub_id,
        "type": "done",
        "raw_score": r["raw_score"],
        "display_score": r["display_score"],
    })
```

Go API listens to `jobs:results`, recomputes both leaderboards, broadcasts WS.

### 4.4 Rejudge (`jobs:rejudge`)

Same as judge → score, with `db.increment_rejudge_count` first. Reuses judge consumer logic.

---

## 5. Single-Writer Rule (cross-language)

| Field/Table | Owner |
|---|---|
| submissions (insert + file_count + total_size_bytes + manifest_hash) | **Go** |
| submissions.status, raw_score, display_score, score_payload, evaluated_at, error_message, validation_result | **Python** |
| submissions.rejudge_count | Python (on rejudge consumer) |
| submissions.is_final | Go (admin-only) |
| evaluation_jobs (full lifecycle) | Python |
| task_phase_leaderboard_entries / contest_phase_leaderboard_entries | Go |

Both connect to same Postgres but never overlap on same column.

---

## 6. Sandbox Execution

- Docker image per `judge_key` family (e.g., `olpai-judge-py:latest` with numpy/sklearn pre-installed)
- Mounts: `/sub` (RO submission dir), `/data` (RO dataset), `/out` (RW output)
- Limits: `--cpus`, `--memory`, `--network=none`, `--read-only`, `--pids-limit`
- Wall clock via `signal.alarm` outer + Docker timeout
- stdout JSON parsed → `JudgeResult{raw_score, display_score, payload?}`

---

## 7. Retry & DLQ

- Per-stream consumer group with `XREADGROUP`
- Failed processing → no XACK → re-claim by sweeper after `idle > 60s`
- `attempt_count` from `evaluation_jobs.attempt_count`; max 3
- After max → XADD to `jobs:dlq`, mark submission failed, file ticket auto

Details in Phase 5.

---

## 8. Configuration (env)

```
REDIS_URL=redis://redis:6379/0
PG_DSN=postgres://olpai:***@db:5432/olpai
S3_ENDPOINT=http://minio:9000
S3_BUCKET=submissions
WORKER_ROLE=validate|judge|score|rejudge
WORKER_CONCURRENCY=4
SANDBOX_CPUS=1
SANDBOX_MEM_MB=2048
SANDBOX_TIMEOUT_S=300
```

---

## 9. Monitoring

- Health: `/healthz` HTTP endpoint (Redis ping, DB ping, last-XACK age)
- Metrics: Prometheus client → `worker_jobs_total{role,status}`, `worker_exec_ms_bucket`, `redis_pending_count{stream}`
- Logs: structured JSON to stdout

---

## 10. Worker Startup (Docker Compose snippet)

```yaml
worker-validate:
  build: ./workers
  environment: { WORKER_ROLE: validate, WORKER_CONCURRENCY: 4, ... }
  depends_on: [redis, db, minio]

worker-judge:
  build: ./workers
  environment: { WORKER_ROLE: judge, WORKER_CONCURRENCY: 1, ... }
  privileged: true            # needs Docker-in-Docker for sandbox

worker-score:
  build: ./workers
  environment: { WORKER_ROLE: score, WORKER_CONCURRENCY: 4, ... }

worker-rejudge:
  build: ./workers
  environment: { WORKER_ROLE: rejudge, WORKER_CONCURRENCY: 2, ... }
```

---

## 11. Todo

- [ ] redis-py XREADGROUP wrapper + XPENDING reclaim
- [ ] psycopg pool + UPDATE helpers (single-writer columns only)
- [ ] Manifest validator
- [ ] Docker sandbox runner with limits
- [ ] Judge handlers: accuracy, F1, BLEU, cosine, PSNR, MAE
- [ ] Consumer entrypoints (validate/judge/score/rejudge)
- [ ] Prometheus + healthz HTTP server
- [ ] Integration test with seeded Postgres + Redis

---

## 12. Success Criteria

1. End-to-end: API enqueue → score on submissions → WS pushed
2. Throughput ≥ 50 jobs/s (validate+score; judge bound by sandbox)
3. Sandbox isolation verified (no network leak, OOM-killed cleanly)
4. Failed jobs land in DLQ + auto-ticket
5. Rejudge increments counter and reflows
6. No race with Go (single-writer enforced; verified by load test)

---

## 13. Deferrals (V2)

- First-class `evaluators` table
- Multi-metric scoring (separate `scores` table)
- GPU sandbox profiles
- Leaderboard snapshots

---

## 14. Next → Phase 4 (Go scaffold) & Phase 5 (queue protocol details)
