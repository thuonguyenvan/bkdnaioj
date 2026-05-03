# Phase 1 Implementation Report — Schema Migrations

**Date:** 2026-04-24 16:10
**Plan:** `plans/260415-1507-olpai-backend-design/phase-01-database-schema.md`
**Output:** `migrations/*.sql` (5 files, goose-compatible)

---

## 1. Deliverables

| # | File | Tables | LOC |
|---|---|---|---|
| 001 | `20260415000001_init_users_teams.sql` | users, teams, team_members | ~70 |
| 002 | `20260415000002_contests_tasks_phases.sql` | contests, contest_phase_defs, tasks, phases | ~115 |
| 003 | `20260415000003_contest_entries.sql` | contest_entries, contest_entry_members | ~65 |
| 004 | `20260415000004_submissions_jobs.sql` | submissions, submission_files, evaluation_jobs | ~95 |
| 005 | `20260415000005_leaderboards_comms.sql` | task_phase_lb, contest_phase_lb, announcements, clarifications, tickets | ~125 |

**Total:** 17 tables (matches spec §11). 16 PostgreSQL ENUMs.

---

## 2. Spec Compliance Checklist

- [x] Entry-driven (`contest_entries` is unit; teams are global)
- [x] `contest_phase_defs` source-of-truth for logical phases
- [x] `phases.contest_phase_def_id` FK + `UNIQUE(task_id, contest_phase_def_id)`
- [x] Composite UNIQUEs: `tasks(id, contest_id)`, `contest_entries(id, contest_id)`, `contest_phase_defs(id, contest_id)`, `phases(id, task_id)`
- [x] Composite FKs on `submissions`:
  - `(contest_entry_id, contest_id) → contest_entries(id, contest_id)`
  - `(task_id, contest_id) → tasks(id, contest_id)`
  - `(phase_id, task_id) → phases(id, task_id)`
  - `(contest_entry_id, submitted_by) → contest_entry_members(contest_entry_id, user_id)`
- [x] Composite FKs on both leaderboard tables for entry/phase/def consistency
- [x] CHECK exactly-one user/team on contest_entries
- [x] CHECK type consistency (individual ⇔ user_id, team ⇔ team_id)
- [x] CHECK virtual window
- [x] Partial unique indexes preventing duplicate per `(contest, mode, user|team)`
- [x] Score inline on submissions (`raw_score`, `display_score`, `score_payload`)
- [x] `evaluation_jobs` has NO `phase_id` (derived via submission)
- [x] CHECK non-negative counters/sizes; CHECK time windows
- [x] All recommended indexes from spec §8

---

## 3. Validation

```
20260415000001_init_users_teams.sql:        up=11, down=5  stmts, 1882B
20260415000002_contests_tasks_phases.sql:   up=13, down=9  stmts, 5211B
20260415000003_contest_entries.sql:         up=10, down=6  stmts, 2895B
20260415000004_submissions_jobs.sql:        up=12, down=6  stmts, 4337B
20260415000005_leaderboards_comms.sql:      up=14, down=9  stmts, 5664B
ALL OK (sqlparse + balanced parens check)
```

Live `goose up` not yet runnable — Docker/Postgres not installed locally. Will validate during Phase 4 scaffold.

---

## 4. Goose Conventions Applied

- Filename: `<timestamp>_<snake_slug>.sql` matching `goose -dir migrations` discovery
- `-- +goose Up` / `-- +goose Down` markers
- All `DROP TABLE/TYPE IF EXISTS` in down migrations (idempotent)
- Drop order respects FK dependencies
- `CREATE EXTENSION IF NOT EXISTS pgcrypto` once in 001 (provides `gen_random_uuid()`)

---

## 5. Decisions Made (no spec ambiguity)

| Decision | Rationale |
|---|---|
| ENUM via `CREATE TYPE` (not VARCHAR + CHECK) | Type-safe, Postgres-native; sqlc handles cleanly |
| `pgcrypto` over `uuid-ossp` | Modern PG, built-in to PG13+ |
| `team_members.role` defaults `'member'` | KISS |
| `contests.rules_json` NOT NULL DEFAULT `'{}'` | Avoid null-handling everywhere |
| `submission_files.file_size BIGINT` + CHECK | Match spec |
| `evaluation_jobs.celery_task_id` retained as VARCHAR | Spec §5.12 keeps it; Phase 5 uses Redis Streams but column kept for future broker-id |
| FK ON DELETE: contests/tasks → CASCADE; users referenced by entry → RESTRICT | Don't delete user with active entries |

---

## 6. Files Created

```
D:/workspace/bkdnaioj/migrations/
├── 20260415000001_init_users_teams.sql
├── 20260415000002_contests_tasks_phases.sql
├── 20260415000003_contest_entries.sql
├── 20260415000004_submissions_jobs.sql
└── 20260415000005_leaderboards_comms.sql
```

---

## 7. How to Apply (when Phase 4 scaffold lands)

```bash
# Install goose
go install github.com/pressly/goose/v3/cmd/goose@latest

# Up
goose -dir migrations postgres "$DATABASE_URL" up

# Down (full rollback)
goose -dir migrations postgres "$DATABASE_URL" reset

# Status
goose -dir migrations postgres "$DATABASE_URL" status
```

`DATABASE_URL` example: `postgres://olpai:olpai@localhost:5432/olpai?sslmode=disable`

---

## 8. Outstanding (Phase 4+ work)

- [ ] Bootstrap Go project (cmd/api, cmd/migrate, sqlc.yaml, Makefile, Docker Compose)
- [ ] Live `goose up` validation against PG15 container
- [ ] sqlc code-gen against migrations/ as schema source
- [ ] Seed script: 1 admin user, 1 demo contest with 4 phase_defs + 1 task + 4 phases
- [ ] Migration tests (up/down idempotency)

---

## 9. Unresolved Questions

1. **`celery_task_id` column retained but stack uses Redis Streams** — keep for future broker swap, or rename to `external_job_id`? (Per spec literal — kept)
2. **Default `entry_policy = 'both'`** — spec doesn't specify default. Chose `'both'` for max flexibility.
3. **`team_members.role` ENUM** spec mentions "owner, manager, member" but `teams.owner_id` already exists → potential overlap. Kept ENUM as-is; app layer can ignore `'owner'` value if redundant.
4. **`contests.rules_json` defaulted `{}`** — spec marks as JSONB without NOT NULL/default. Defaulted for DX; reversible if needed.
5. **`max_team_size` default = 1** — spec doesn't specify default; chose 1 (individual-friendly).

---

## 10. Next

User decides next phase to implement:
- Phase 4 (Go scaffold) — recommended next, unblocks live migration test
- Phase 2 (API) — needs Phase 4 first
- Phase 3 (Workers) — needs Phase 4 + Phase 5
- Phase 5 (Queue protocol) — code touches Go scaffold

Recommend: **Phase 4 next**.
