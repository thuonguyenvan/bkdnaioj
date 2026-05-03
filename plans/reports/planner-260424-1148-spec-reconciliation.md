# Plan Reconciliation Report — Spec vs Existing Phases

**Ref spec:** `ai-contest-database-design-specification.md` (17 tables, entry-driven)
**Target plan dir:** `plans/260415-1507-olpai-backend-design/`
**Scope:** Align phase-01/02/03 with new spec.

---

## 1. Key Gaps (Spec vs Current Plan)

| # | Spec Requirement | Current Plan | Action |
|---|---|---|---|
| 1 | `contest_entries` is unit of participation (individual/team × official/virtual/practice) | Submissions bound to `teams` | **Replace** teams-as-participant with `contest_entries` |
| 2 | `contest_entry_members` per-contest lineup | No per-contest lineup | **Add** table |
| 3 | `contest_phase_defs` (logical contest-wide phases) | Missing | **Add** table + FK on `phases` |
| 4 | `phases.contest_phase_def_id` links real phase → logical def | Only `phase_type` string | **Add** FK |
| 5 | Two leaderboards: `task_phase_leaderboard_entries` + `contest_phase_leaderboard_entries` | Single `leaderboard_entries` | **Split** into two |
| 6 | Submission stores `raw_score`, `display_score`, `score_payload` directly | Separate `scores` table (multi-metric) | **Drop** separate scores table in V1; merge into submissions |
| 7 | `evaluation_jobs` has NO `phase_id` (derived via submission) | Has `phase_id` | **Drop** `phase_id` column |
| 8 | Composite FKs for cross-contest consistency (e.g. `(contest_entry_id, contest_id) → contest_entries(id, contest_id)`) | Not enforced | **Add** composite uniques + FKs |
| 9 | `teams` is global (not per-contest) | `teams.contest_id` present | **Drop** `teams.contest_id`; move registration into `contest_entries` |
| 10 | `entry_mode` enum (official/virtual/practice) + per-phase allow flags | Not modeled | **Add** columns |
| 11 | `submissions.contest_id` explicit for integrity | Absent | **Add** column |
| 12 | V2 deferrals: `audit_logs`, `scores` multi-metric, `leaderboard_snapshots`, `evaluators` | Already in V1 (`audit_logs`, `scores`) | **Defer** to V2 (per YAGNI) |

---

## 2. Revised Phase Structure

### Phase 1 — Database Schema (restructured)

**Migrations (5, renumbered):**
1. `001_init_users_teams.py` — users, teams, team_members
2. `002_contests_tasks_phases.py` — contests, contest_phase_defs, tasks, phases (with composite uniques)
3. `003_contest_entries.py` — contest_entries, contest_entry_members (with CHECK exclusivity)
4. `004_submissions_jobs.py` — submissions (scores inline), submission_files, evaluation_jobs
5. `005_leaderboards_comms.py` — task_phase_leaderboard_entries, contest_phase_leaderboard_entries, announcements, clarifications, tickets

**Total tables:** 17 (matches spec). Defer `audit_logs`, multi-metric `scores`, `leaderboard_snapshots` to V2.

### Phase 2 — API Specification (delta)

**New modules:**
- `/contest-entries` — register individual/team entry (official/virtual/practice), manage lineup
- `/contest-phase-defs` — organizer CRUD for logical phases
- `/leaderboard/tasks/{phase_id}` — task-phase board
- `/leaderboard/contests/{contest_phase_def_id}` — contest-phase board (filter by `entry_mode`)

**Changed:**
- Submissions endpoints: require `contest_entry_id` (not `team_id`); enforce `submitted_by ∈ lineup`
- Leaderboard filters: `entry_mode` query param
- Virtual mode: entry carries `start_at`/`end_at`

### Phase 3 — Worker Architecture (delta)

- Evaluation job dispatch: pass `submission_id` only; worker dereferences phase via submission
- Scorer writes `raw_score`/`display_score`/`score_payload` onto `submissions` (no separate `scores` write)
- Leaderboard recompute: two cascaded tasks
  - `recompute_task_phase_board(phase_id, contest_entry_id)`
  - `recompute_contest_phase_board(contest_phase_def_id, contest_entry_id)`
- Simplify metric plugin: V1 only needs one metric per task (per spec §6.2); keep plugin interface for V2 multi-metric

---

## 3. Integrity Constraints to Add (DB-enforced)

- `UNIQUE(id, contest_id)` on `contests`, `tasks`, `contest_entries`
- `UNIQUE(id, task_id)` on `phases`
- Composite FKs per spec §5.10
- `CHECK` on `contest_entries`: exactly-one-of `user_id`/`team_id`
- `CHECK` on `contest_entries`: `entry_mode='virtual' ⇒ start_at<end_at`
- `UNIQUE(contest_id, entry_mode, user_id) WHERE user_id IS NOT NULL`
- `UNIQUE(contest_id, entry_mode, team_id) WHERE team_id IS NOT NULL`

---

## 4. App-Layer Rules (documented, not DB-enforced)

- Contest must define 4 logical phase defs
- Each task must have phase row per def
- Team-lineup user ∈ global team
- `submitted_by ∈ contest_entry_members`

---

## 5. Unresolved Questions

1. V1 scoring: single metric per task only, or still allow multiple metric keys in `submission_schema` for future? (Spec §6.2 ⇒ single)
2. Does virtual/practice share same task/phase datasets as official, or separate dataset refs?
3. Approval workflow for `contest_entries`: when `require_approval=true`, block submissions until `approved_at`?
4. Do we keep `audit_logs` in V1 (useful for organizers) or strictly follow spec §10 deferral?
5. Metric plugin system (6 metrics) — keep for V1 or defer per spec §6.2?
