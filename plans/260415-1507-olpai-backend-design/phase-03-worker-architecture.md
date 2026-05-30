# Phase 3: Worker Architecture (Python + Redis Streams)

**Status:** 🔄 Rewritten — Celery removed, Redis Streams adopted
**Refs:** spec, brainstorm Go decision, Phase 5 protocol

---

## 1. Pipeline

```
Go API (producer) / Orchestrator (ORCH)             Python Judge Worker                    Go API
                │                                          │                               │
         enqueue jobs:judge (submission_id) ─────────────► │                               │
                                                           │ 1) DB: mark running           │
                                                           │ 2) OS: download artifact      │
                                                           │ 3) unzip + validate schema     │
                                                           │ 4) run judge.py (public/private)
                                                           │    OR run infer.py → judge.py (final)
                                                           │ 5) DB: write done/failed + score
                                                           │ 6) XADD jobs:results ───────────────► Leaderboard updater (Go)
                                                                                               │
                                                                                     recompute leaderboards (polling UI)
```

Worker derives phase context from `submission.phase_id` by querying DB. Queue payload stays minimal (submission_id + trace_id).

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
    storage.py             # download artifact from object storage
    sandbox/
      docker_runner.py     # Docker exec + limits
      manifest.py          # validate ZIP/files
      runner.py            # run infer.py and/or judge.py
    worker_judge.py        # single judge worker (Lean V1)
    main.py                # entrypoint
```

Lean V1 uses a single worker role (`judge`). Keep the main worker module small; sandbox helpers can be split out.

---

## 4. Consumers

### 4.1 Judge Worker (`jobs:judge`)

Single job = single submission. The worker performs the full lifecycle:
validate schema, unzip if needed, run contestant inference (final only), run organizer judge script, then write result.

**Queue payload:** `{submission_id, trace_id?, enqueued_at?}`

```python
def handle(envelope):
    sub_id = envelope["submission_id"]

    # 1) Load context
    sub = db.fetch_submission_with_phase_and_task(sub_id)
    phase = sub.phase

    # 2) Mark running
    db.update_submission_status(sub_id, status="running")

    # 3) Prepare working directory + artifact
    sub_dir = storage.download_submission_artifact(sub)
    work_dir = sandbox.prepare_workdir(sub_id)
    sandbox.unpack_if_needed(sub_dir, work_dir)

    # 4) Validate submission schema (task/phase-defined)
    ok, validation = manifest.validate(work_dir, phase.submission_schema)
    db.update_submission_validation(sub_id, validation_result=validation)
    if not ok:
        db.update_submission_status(sub_id, status="failed", error_message=validation.get("message"))
        queue.xadd("jobs:results", {"payload": json.dumps({"submission_id": sub_id, "type": "failed"})})
        return

    try:
        # 5) Execute judging logic inside sandbox
        # - public/private: run organizer judge.py
        # - final: run contestant infer.py to produce /out, then run organizer judge.py on /out
        result = sandbox.run_phase_judging(phase=phase, work_dir=work_dir)

        # 6) Persist outcome
        db.update_submission_score(sub_id,
            raw_score=result["raw_score"],
            display_score=result["display_score"],
            score_payload=result.get("payload"),
            evaluated_at=now(),
            status="done",
        )
        # Lean V1: no evaluation_jobs table; persist directly on submissions only

        # 7) Notify Go leaderboard bridge to recompute leaderboards (polling UI)
        queue.xadd("jobs:results", {"payload": json.dumps({
            "submission_id": sub_id,
            "type": "done",
            "raw_score": result["raw_score"],
            "display_score": result["display_score"],
        })})

    except Exception as e:
        db.update_submission_status(sub_id, status="failed", error_message=str(e))
        queue.xadd("jobs:results", {"payload": json.dumps({"submission_id": sub_id, "type": "failed"})})
```

Go API listens to `jobs:results` and recomputes both leaderboards. Lean V1 UI uses polling (no WS requirement).

### 4.2 Rejudge

Rejudge is the same `jobs:judge` flow, initiated by an admin action (enqueue submission_id again). In Lean V1, `submissions.rejudge_count` is incremented by Go/API (business action), not by the worker.

---

## 5. Single-Writer Rule (cross-language)

| Field/Table | Owner |
|---|---|
| submissions (insert + file_count + total_size_bytes + manifest_hash) | **Go** |
| submissions.status, raw_score, display_score, score_payload, evaluated_at, error_message, validation_result | **Python (Judge Worker)** |
| submissions.rejudge_count | Go/API (admin action) |
| submissions.is_final | Go (admin-only) |
| evaluation_jobs | **(removed in Lean V1)** |
| task_phase_leaderboard_entries / contest_phase_leaderboard_entries | Go |

Both connect to same Postgres but never overlap on same column.

---

## 6. Sandbox Execution

- Single base Docker image for Lean V1 (e.g., `olpai-runtime-py:latest` with required libs pre-installed); organizer/contestant provide `.py` scripts only
- Mounts: `/sub` (RO submission dir), `/data` (RO dataset), `/out` (RW output)
- Limits: `--cpus`, `--memory`, `--network=none`, `--read-only`, `--pids-limit`
- Wall clock via `signal.alarm` outer + Docker timeout
- stdout JSON parsed → `JudgeResult{raw_score, display_score, payload?}`

---

## 7. Retry & DLQ (V2)

Lean V1 keeps failure handling simple:

- Worker errors (schema invalid / infer.py crash / judge.py crash / timeout) → set `submissions.status='failed'` and persist `error_message`.
- No DB-backed job bookkeeping and no retry policy in V1.

Optional later (V2): XPENDING reclaim + retry backoff + DLQ + auto-ticketing.

---

## 8. Configuration (env)

```
REDIS_URL=redis://redis:6379/0
PG_DSN=postgres://olpai:***@db:5432/olpai
S3_ENDPOINT=http://minio:9000
S3_BUCKET=submissions
WORKER_ROLE=judge
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
worker-judge:
  build: ./workers
  environment: { WORKER_ROLE: judge, WORKER_CONCURRENCY: 2, ... }
  depends_on: [redis, db, minio]
  privileged: true            # needs Docker-in-Docker for sandbox
```

---

## 11. Todo

- [ ] redis-py XREADGROUP wrapper + XACK (reclaim/XPENDING deferred to V2)
- [ ] psycopg pool + UPDATE helpers (single-writer columns only)
- [ ] Manifest validator
- [ ] Docker sandbox runner with limits
- [ ] Sandbox runner: run infer.py (final) and judge.py (all phases)
- [ ] Single judge worker entrypoint
- [ ] Prometheus + healthz HTTP server
- [ ] Integration test with seeded Postgres + Redis

---

## 12. Success Criteria

1. End-to-end: API creates submission (`queued`) and enqueues `submission_id`.
2. Worker validates schema + runs judge (public/private) and infer→judge (final).
3. Worker writes `done/failed`, `raw_score/display_score`, `evaluated_at`, `error_message` directly on `submissions`.
4. Leaderboards update correctly (task-phase + contest-phase) after results.
5. Frontend polling reflects latest submission status/score/leaderboard.
6. Rejudge works by Go/API incrementing `rejudge_count`, setting status back to `queued`, and re-enqueuing the same `submission_id`.
7. Sandbox is safe (no network, timeouts, resource limits) and failures are persisted as `failed`.

---

## 13. Deferrals (V2)

- First-class `evaluators` table
- Multi-metric scoring (separate `scores` table)
- GPU sandbox profiles
- Leaderboard snapshots

---

## 14. Next → Phase 4 (Go scaffold) & Phase 5 (queue protocol details)
