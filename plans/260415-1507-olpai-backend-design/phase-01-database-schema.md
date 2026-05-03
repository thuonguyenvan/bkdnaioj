# Phase 1: Database Schema (Entry-Driven, 17 Tables)

**Status:** 🔄 Revised to align with `ai-contest-database-design-specification.md`
**Ref:** `plans/reports/planner-260424-1148-spec-reconciliation.md`

---

## 1. Design Principles (per spec)

1. **Contest-entry-driven** — `contest_entries` is the unit of participation (individual or team, official/virtual/practice)
2. **Logical vs real phases** — `contest_phase_defs` (per-contest logical) vs `phases` (per-task real)
3. **Score-on-submission** — V1 stores `raw_score`/`display_score`/`score_payload` directly on submissions (no separate multi-metric table)
4. **Dual leaderboards** — `task_phase_leaderboard_entries` and `contest_phase_leaderboard_entries`
5. **Composite FKs** — enforce cross-contest integrity with `UNIQUE(id, contest_id)` on parents
6. **JSONB for flex fields** — rules, schemas, validation, score_payload, breakdowns

---

## 2. Tech Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| DB | PostgreSQL 15+ | JSONB, CHECK, partial unique indexes |
| ORM | SQLAlchemy 2.0 / SQLModel | Async via asyncpg |
| Migration | Alembic | 5 migrations, 17 tables |

---

## 3. Entity-Relationship

```
users ──< team_members >── teams
  │                          │
  │                          │
  └─┬─── contest_entries ────┘
    │      │  ▲
    │      │  │
    │      ▼  │ (FK exactly-one)
    │    contest_entry_members
    │
  contests ──1:N─ tasks ──1:N─ phases
    │                           │
    └─1:N─ contest_phase_defs ──┘ (FK logical↔real)
                │
    contest_entries ──1:N─ submissions ─1:N─ submission_files
                              │
                              └─1:N─ evaluation_jobs

  Leaderboards (two kinds):
    task_phase_leaderboard_entries   (phase_id, contest_entry_id UNIQUE)
    contest_phase_leaderboard_entries (contest_phase_def_id, contest_entry_id UNIQUE)

  Comms: announcements, clarifications, tickets
```

---

## 4. Migration Plan (5 files)

### 4.1 `001_init_users_teams.py`

**Tables:** `users`, `teams`, `team_members`

Key columns:
- `users(id PK UUID, email UNIQUE, password_hash, full_name, role, student_id NULL, avatar_url NULL, last_visit NULL, created_at, updated_at)`
- `teams(id PK UUID, slug UNIQUE, name, owner_id FK users, created_at, updated_at)` — **global, no contest_id**
- `team_members(team_id, user_id, role, joined_at)` — PK `(team_id, user_id)`

Indexes: `users(email)`, `teams(slug)`, `team_members(user_id)`.

### 4.2 `002_contests_tasks_phases.py`

**Tables:** `contests`, `contest_phase_defs`, `tasks`, `phases`

- `contests(id PK, slug UNIQUE, title, description, banner_url, status, entry_policy ENUM[individual|team|both], registration_start/end, start_time, end_time, visibility, rules_json JSONB, created_by FK users, max_team_size, require_approval, created_at, updated_at)` + `UNIQUE(id, contest_id)` stub ⇒ actually `UNIQUE(id)` is PK; expose `UNIQUE(id)` as candidate for composite FK targets. Spec requires `UNIQUE(id, contest_id)` on children where contest_id exists — for contests themselves, PK is enough.
- `contest_phase_defs(id PK, contest_id FK contests, key ENUM[public_test|private_test|final_public|final_private], title, sort_order)` + `UNIQUE(contest_id, key)`.
- `tasks(id PK, contest_id FK, slug, title, description, problem_statement_url, submission_schema JSONB, score_label, higher_is_better BOOL, sort_order, created_at, updated_at)` + `UNIQUE(contest_id, slug)` + `UNIQUE(id, contest_id)`.
- `phases(id PK, task_id FK tasks, contest_phase_def_id FK contest_phase_defs, slug, title, description NULL, open_time, close_time, judge_key, submission_limit NULL, leaderboard_mode ENUM[best|latest], allow_official_submit BOOL, allow_virtual_submit BOOL, allow_practice_submit BOOL, display_scores BOOL, is_frozen BOOL, is_final BOOL, sort_order, created_at, updated_at)` + `UNIQUE(task_id, slug)` + `UNIQUE(task_id, contest_phase_def_id)` + `UNIQUE(id, task_id)`.

CHECKs: `contests.registration_start ≤ registration_end`, `contests.start_time < end_time`, `contests.max_team_size > 0`, `phases.open_time < close_time`, `phases.submission_limit IS NULL OR >= 0`.

Indexes: `contests(slug, status, start_time, end_time)`, `contest_phase_defs(contest_id, key, sort_order)`, `tasks(contest_id, sort_order)`, `phases(task_id, open_time, close_time)`.

### 4.3 `003_contest_entries.py`

**Tables:** `contest_entries`, `contest_entry_members`

- `contest_entries(id PK, contest_id FK, entry_type ENUM[individual|team], entry_mode ENUM[official|virtual|practice], user_id FK users NULL, team_id FK teams NULL, display_name, status ENUM[pending|approved|active|disqualified|finished], registered_by FK users, approved_by FK users NULL, approved_at NULL, start_at NULL, end_at NULL, created_at, updated_at)` + `UNIQUE(id, contest_id)`.
- `contest_entry_members(contest_entry_id FK contest_entries, user_id FK users, role ENUM[leader|member], joined_at)` — PK `(contest_entry_id, user_id)`.

CHECKs:
- Exactly-one: `(user_id IS NOT NULL AND team_id IS NULL) OR (user_id IS NULL AND team_id IS NOT NULL)`
- Type consistency: `(entry_type='individual' AND user_id IS NOT NULL) OR (entry_type='team' AND team_id IS NOT NULL)`
- Virtual window: `entry_mode <> 'virtual' OR (start_at IS NOT NULL AND end_at IS NOT NULL AND start_at < end_at)`

Partial unique indexes:
- `UNIQUE(contest_id, entry_mode, user_id) WHERE user_id IS NOT NULL`
- `UNIQUE(contest_id, entry_mode, team_id) WHERE team_id IS NOT NULL`

Indexes: `contest_entries(contest_id, entry_mode, status)`, `contest_entry_members(contest_entry_id, user_id)`.

**App-layer rules (documented):**
- Individual entry ⇒ exactly one lineup row matching `user_id`
- Team entry lineup ⊆ global `team_members`
- One user cannot join two official entries in same contest

### 4.4 `004_submissions_jobs.py`

**Tables:** `submissions`, `submission_files`, `evaluation_jobs`

- `submissions(id PK, contest_id FK, contest_entry_id FK, task_id FK, phase_id FK, submitted_by FK users, status ENUM[uploaded|validating|queued|running|done|failed], submitted_at, file_count, total_size_bytes, manifest_hash NULL, validation_result JSONB NULL, error_message NULL, raw_score NUMERIC NULL, display_score NUMERIC NULL, score_payload JSONB NULL, evaluated_at NULL, is_final BOOL, rejudge_count, client_ip NULL, user_agent NULL, created_at, updated_at)`
- Composite FKs:
  - `FK(contest_entry_id, contest_id) → contest_entries(id, contest_id)`
  - `FK(task_id, contest_id) → tasks(id, contest_id)`
  - `FK(phase_id, task_id) → phases(id, task_id)`
  - `FK(contest_entry_id, submitted_by) → contest_entry_members(contest_entry_id, user_id)`
- CHECKs: `file_count>=0`, `total_size_bytes>=0`, `rejudge_count>=0`.

- `submission_files(id PK, submission_id FK, original_filename, storage_path, file_size, content_type NULL, hash_sha256 NULL, created_at)`

- `evaluation_jobs(id PK, submission_id FK, job_type ENUM[validate|judge|rejudge], status ENUM[pending|running|done|failed], priority, worker_id NULL, attempt_count, max_attempts, input_data JSONB NULL, output_data JSONB NULL, started_at NULL, completed_at NULL, execution_time_ms NULL, error_log NULL, celery_task_id NULL, created_at)` — **no `phase_id`** (derived via submission)
- CHECKs: `attempt_count>=0`, `max_attempts>=0`, `priority>=0`.

Indexes: `submissions(contest_id, contest_entry_id, task_id, phase_id, submitted_at)`, `submissions(status)`, `evaluation_jobs(status, created_at)`.

### 4.5 `005_leaderboards_comms.py`

**Tables:** `task_phase_leaderboard_entries`, `contest_phase_leaderboard_entries`, `announcements`, `clarifications`, `tickets`

- `task_phase_leaderboard_entries(id PK, contest_id FK, task_id FK, phase_id FK, contest_entry_id FK, rank, score NUMERIC, score_breakdown JSONB NULL, chosen_submission_id FK submissions NULL, entries_count, is_frozen, is_disqualified, dq_reason NULL, updated_at)` + `UNIQUE(phase_id, contest_entry_id)`. Composite FKs guaranteeing phase∈task, entry∈contest.
- `contest_phase_leaderboard_entries(id PK, contest_id FK, contest_phase_def_id FK, contest_entry_id FK, rank, score NUMERIC, score_breakdown JSONB NULL, entries_count, is_frozen, is_disqualified, dq_reason NULL, updated_at)` + `UNIQUE(contest_phase_def_id, contest_entry_id)`.
- `announcements(id PK, contest_id FK, task_id FK NULL, title, content, is_pinned, is_public, created_by FK users, created_at, updated_at)`
- `clarifications(id PK, contest_id FK, task_id FK NULL, phase_id FK NULL, contest_entry_id FK, question, answer NULL, is_public, status ENUM[pending|answered|closed], asked_by FK users, answered_by FK users NULL, answered_at NULL, created_at, updated_at)`
- `tickets(id PK, submission_id FK NULL, contest_entry_id FK, category ENUM[upload|judge|score|system], subject, description, status ENUM[open|in_progress|resolved|rejected], priority ENUM[low|normal|high|urgent], assigned_to FK users NULL, created_by FK users, created_at, resolved_at NULL, updated_at)`

Indexes: `task_phase_leaderboard_entries(phase_id, rank)`, `contest_phase_leaderboard_entries(contest_phase_def_id, rank)`, `clarifications(contest_id, status)`, `tickets(contest_entry_id, status)`.

---

## 5. ORM Models (SQLModel sketch)

File layout: `backend/app/models/{users,teams,contests,phases,entries,submissions,jobs,leaderboards,comms}.py` (split per domain to stay <200 LOC per file).

Follow migration column definitions above 1:1. Relationships:
- `User.team_memberships`, `User.contest_entries_registered`
- `Team.members`, `Team.entries`
- `Contest.phase_defs`, `Contest.tasks`, `Contest.entries`
- `Task.phases`, `Task.submissions`
- `Phase.def` (→ contest_phase_def), `Phase.submissions`
- `ContestEntry.members`, `ContestEntry.submissions`, `ContestEntry.task_board_rows`, `ContestEntry.contest_board_rows`
- `Submission.files`, `Submission.jobs`

---

## 6. Integrity — DB vs App Layer

**DB-enforced (hard):**
- Entry participant exclusivity (CHECK)
- Cross-contest consistency via composite FKs
- Phase↔task consistency
- Non-negative counters, time-range checks
- Leaderboard row uniqueness

**App-layer (documented, V1):**
- Each contest has 4 logical phase defs
- Each task has 1 phase per def
- Team lineup ⊆ global team
- Chosen submission belongs to same entry/task/phase (verified before upsert)
- Unique user across official entries in same contest

---

## 7. Database Config

Async SQLAlchemy engine (`asyncpg`), pool 20+10, `pool_pre_ping=True`. Alembic with `async` env. See `backend/app/core/database.py`.

---

## 8. Seed Data

- Seed 3 roles: `contestant`, `jury`, `admin`
- Demo contest seed: create 4 `contest_phase_defs` per contest (public_test, private_test, final_public, final_private)
- No metric table in V1 (score_label per task is free text)

---

## 9. Todo

- [ ] Finalize ENUM types (PG native vs VARCHAR+CHECK)
- [ ] Write migrations 001–005
- [ ] Write ORM models (one file per domain)
- [ ] Composite FK verification tests
- [ ] Seed script + demo contest fixture
- [ ] Alembic up/down tests

---

## 10. Success Criteria

1. All 17 tables created with spec-required constraints
2. Composite FKs prevent cross-contest row mixing
3. Partial unique indexes prevent duplicate entries per mode
4. Alembic up/down idempotent
5. ORM models align 1:1 with schema

---

## 11. Deferrals (V2)

- `audit_logs`, `user_stats_cache`, `leaderboard_snapshots`
- Separate multi-metric `scores` table
- First-class `evaluators` table

---

## 12. Next → Phase 2

API layer: contest-entry-centric endpoints, dual leaderboard endpoints.
