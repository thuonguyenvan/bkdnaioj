# OLPAI Backend Design Plan

**Date:** 260415-1507 (revised 260424-1304)
**Project:** Olympic AI Platform — Backend, DB & System Design
**Stack:** **Hybrid Go (API/WS) + Python (Workers) via Redis Streams**
**Refs:**
- Spec: `ai-contest-database-design-specification.md`
- Reconciliation: `plans/reports/planner-260424-1148-spec-reconciliation.md`
- Go decision: `plans/reports/brainstorm-260424-1304-go-backend-decision.md`

---

## Overview

Entry-driven architecture. 17 core tables. Dual leaderboards. Score-on-submission V1. API layer in **Go**, judging workers in **Python**, communicating via **Redis Streams**.

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 1 | Database Schema (17 tables) | ✅ Aligned with spec | P0 |
| 2 | Go API Specification | 🔄 Rewritten | P0 |
| 3 | Worker Architecture (Python + Redis Streams) | 🔄 Rewritten | P1 |
| 4 | Go Project Scaffold | 🆕 New | P0 |
| 5 | Queue Protocol (Redis Streams) | 🆕 New | P0 |

---

## Phase 1 — Database Schema
📄 `phase-01-database-schema.md`

Unchanged. 5 Alembic-equivalent migrations rewritten as **goose SQL migrations** in Phase 4.

## Phase 2 — Go API Specification
📄 `phase-02-api-specification.md`

- Echo v4 router
- go-playground/validator struct tags
- gorilla/websocket for realtime
- sqlc-generated query methods
- ~89 endpoints, entry-centric
- Dual leaderboards with `entry_mode` filter
- JWT auth

## Phase 3 — Worker Architecture
📄 `phase-03-worker-architecture.md`

- Python workers (no Celery)
- `redis-py` + XREADGROUP
- 3 consumer groups: validate / judge / score
- Docker sandbox execution
- Writes score inline to `submissions`
- Publishes results to `jobs:results` stream

## Phase 4 — Go Project Scaffold
📄 `phase-04-go-project-scaffold.md`

- Layout: `cmd/api`, `cmd/migrate`, `internal/`, `pkg/`, `migrations/`, `queries/`
- sqlc.yaml + goose setup
- Makefile + Docker Compose
- 2-week Go ramp-up plan (team hobby-level)

## Phase 5 — Queue Protocol
📄 `phase-05-queue-protocol.md`

- Redis Streams: `jobs:validate`, `jobs:judge`, `jobs:score`, `jobs:rejudge`, `jobs:results`
- JSON envelope
- Consumer groups + XPENDING reclaim
- Retry/DLQ policy
- Single-writer rule between Go and Python
- WS bridge: `jobs:results` → WebSocket broadcast

---

## Tables (17 core, V1)

```
users, teams, team_members
contests, contest_phase_defs, tasks, phases
contest_entries, contest_entry_members
submissions, submission_files, evaluation_jobs
task_phase_leaderboard_entries, contest_phase_leaderboard_entries
announcements, clarifications, tickets
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| API Server | Go 1.22 + Echo v4 |
| DB Access | sqlc (code-gen) + pgx/v5 |
| Migration | goose (SQL-native) |
| Validation | go-playground/validator/v10 |
| WebSocket | gorilla/websocket |
| Auth | golang-jwt/jwt v5 |
| Logging | zerolog (structured JSON) |
| Config | viper |
| Workers | Python 3.11 |
| Worker Queue | Redis Streams (XREADGROUP) |
| Database | PostgreSQL 15 (JSONB) |
| Cache/Queue Broker | Redis 7 |
| Object Storage | MinIO / S3 |
| Container | Docker Compose |

---

## Single-Writer Rule

| Entity / Column | Writer |
|---|---|
| users, teams, contests, tasks, phases, contest_entries, contest_entry_members | Go |
| submissions (create), submission_files | Go |
| submissions.status, raw_score, display_score, score_payload, evaluated_at, error_message | Python |
| evaluation_jobs (full lifecycle) | Python |
| task_phase_leaderboard_entries, contest_phase_leaderboard_entries | Go |
| announcements, clarifications, tickets | Go |

---

## Timeline (2–3 devs, < 6 months)

| Week | Milestone |
|---|---|
| 1–2 | Go ramp-up + scaffold (Phase 4) |
| 3 | Migrations + seed (Phase 1 → goose) |
| 4–5 | Auth + users + teams + contests |
| 6–7 | Tasks, phases, contest_phase_defs, contest_entries |
| 8–9 | Submissions + file upload + Redis Streams producer |
| 10–12 | Python workers (validate/judge/score) + Phase 5 protocol |
| 13–14 | Dual leaderboards + WS bridge |
| 15–16 | Clarifications, announcements, tickets, admin |
| 17–20 | Tests, hardening, Docker Compose, load test, docs |
| 21–24 | Buffer, thesis defense prep |

---

## Next Steps

1. Review phases 2/3/4/5
2. Bootstrap Go project
3. 2-week Go ramp-up for team
4. Implement migrations → API → Workers → WS
