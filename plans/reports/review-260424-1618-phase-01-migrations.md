# Phase 1 Migration Review — Pre‑Phase‑4 Gate

**Scope:** `migrations/2026041500000{1..5}_*.sql` vs `plans/260415-1507-olpai-backend-design/phase-01-database-schema.md`
**Date:** 2026-04-24
**Verdict:** ✅ PASS — safe to start Phase 4. Minor nits only.

---

## 1. Table Inventory (17/17 ✅)

| Migration | Tables | Count |
|---|---|---|
| 001 | users, teams, team_members | 3 |
| 002 | contests, contest_phase_defs, tasks, phases | 4 |
| 003 | contest_entries, contest_entry_members | 2 |
| 004 | submissions, submission_files, evaluation_jobs | 3 |
| 005 | task_phase_lb, contest_phase_lb, announcements, clarifications, tickets | 5 |

Matches §4 spec exactly.

---

## 2. Constraints Checklist

| Requirement | Status |
|---|---|
| ENUM types (PG native) | ✅ all 13 enums created (user_role, team_role, contest_status, contest_visibility, contest_entry_policy, contest_phase_key, leaderboard_mode, entry_type, entry_mode, entry_status, entry_member_role, submission_status, eval_job_{type,status}, clarification_status, ticket_{category,status,priority}) |
| `UNIQUE(id, contest_id)` on tasks, contest_phase_defs, contest_entries | ✅ |
| `UNIQUE(id, task_id)` on phases | ✅ |
| `UNIQUE(task_id, contest_phase_def_id)` on phases | ✅ |
| Composite FK submissions→(entries, tasks, phases, members) | ✅ all 4 |
| Composite FK leaderboards→(tasks, phases, entries, phase_defs) | ✅ |
| CHECK exactly‑one user_id XOR team_id | ✅ chk_entry_exactly_one |
| CHECK type consistency (entry_type ↔ user/team) | ✅ chk_entry_type_consistency |
| CHECK virtual window required | ✅ chk_entry_virtual_window |
| CHECK contests reg/run windows, team_size > 0 | ✅ |
| CHECK phases open<close, submission_limit≥0 | ✅ |
| CHECK submissions/jobs non-neg counters | ✅ |
| Partial UNIQUE on (contest,mode,user) WHERE user_id IS NOT NULL | ✅ uq_entries_user_per_mode |
| Partial UNIQUE on (contest,mode,team) WHERE team_id IS NOT NULL | ✅ uq_entries_team_per_mode |
| `evaluation_jobs` has NO phase_id column | ✅ (per spec §5.12) |
| Score columns inline on submissions (raw/display/payload) | ✅ |

---

## 3. Indexes (spec-aligned + extras)

Spec-required: `users(email)`, `teams(slug)`, `team_members(user_id)`, `contests` lookup, `contest_phase_defs`, `tasks(contest_id,sort_order)`, `phases(task_id,open_time,close_time)`, `submissions(contest_id,entry,task,phase,submitted_at)`, `submissions(status)`, `evaluation_jobs(status,created_at)`, `task_phase_lb(phase_id,rank)`, `contest_phase_lb(def,rank)`, `clarifications(contest_id,status)`, `tickets(entry,status)` — **all present**.

Extras (harmless): `idx_users_role`, `idx_teams_owner`, `idx_sub_phase`, `idx_subfiles_submission`, `idx_evjob_submission`, `idx_announcements_contest`.

---

## 4. ON DELETE Policy Audit

| FK | Policy | Note |
|---|---|---|
| teams.owner_id → users | RESTRICT | ✅ protects ownership |
| team_members.{team,user} | CASCADE | ✅ |
| contests.created_by → users | SET NULL | ✅ soft |
| contest_phase_defs/tasks/entries.contest_id | CASCADE | ✅ |
| phases.task_id | CASCADE | ✅ |
| phases.contest_phase_def_id | RESTRICT | ✅ preserve logical link |
| entries.{user,team,registered_by} | RESTRICT | ✅ |
| entries.approved_by | SET NULL | ✅ |
| submissions.contest_id | CASCADE | ✅ |
| submission_files/eval_jobs.submission_id | CASCADE | ✅ |
| leaderboards composite FKs | default NO ACTION | ⚠️ see §6 |
| lb.chosen_submission_id | SET NULL | ✅ |

---

## 5. Down Migrations

All 5 files have `-- +goose Down` with reverse-order DROP TABLE + DROP TYPE. CASCADE drops are unnecessary because each file owns its own tables and goose runs in reverse order. ✅ idempotent with `DROP … IF EXISTS`.

---

## 6. Nits / Observations (non-blocking)

1. **Composite FKs default NO ACTION.** Cascade from `contests(id)` reaches submissions via `contest_id` direct FK (CASCADE), but the composite FK `fk_sub_entry_contest` has default NO ACTION. Net effect: contest delete still cascades correctly because the direct `contest_id` FK fires first; composite acts as integrity guard. OK as-is.
2. **`numeric(20,10)` raw vs `numeric(20,5)` display** not specified in Phase 1 §4.4 (only "NUMERIC"). Reasonable choice; document in ORM.
3. **`submission.manifest_hash VARCHAR(128)`** — SHA‑256 hex only needs 64; room for longer alg IDs. Fine.
4. **`idx_sub_lookup` uses DESC on `submitted_at`** — good for latest-first pagination; matches spec.
5. **No trigger-based `updated_at`** — defers to app layer. Align with spec §7 ("app-level responsibility"). Document in phase-04 ORM layer.
6. **Order of ENUM drop in 002 Down:** drops types in reverse of creation. ✅
7. **`teams` is global** (no contest_id) — matches spec §4.1 correctly.
8. **No `audit_logs`, `user_stats_cache`, `scores`, `evaluators`** — correctly deferred per spec §11.

---

## 7. Phase 1 Todo Reconciliation

- [x] Finalize ENUM types (PG native) — done
- [x] Write migrations 001–005 — done
- [ ] Write ORM models — **Phase 4 scope** (sqlc generates, not ORM)
- [ ] Composite FK verification tests — **Phase 4 scope**
- [ ] Seed script + demo contest fixture — **Phase 4 scope**
- [ ] Alembic up/down tests — N/A (replaced by goose; tests in Phase 4)

---

## 8. Green Light for Phase 4

Migrations are spec-faithful, all 17 tables present, composite FKs + CHECKs + partial UNIQUEs intact. Phase 4 can proceed to:
1. `go mod init` + directory scaffold
2. Wire `sqlc.yaml` pointing `schema: "migrations"` — files are ready
3. `make migrate-up` should succeed end-to-end (no inter-file ordering issues observed)

---

## 9. Unresolved Questions

1. Confirm `numeric(20,10)` raw_score / `numeric(20,5)` display_score precisions — acceptable for all task types (MSE, accuracy %, large counts)?
2. Add trigger-based `updated_at` in a later migration, or keep app-layer? Current plan says app-layer — confirm.
3. Should `fk_sub_*` composite FKs declare explicit `ON DELETE CASCADE` for defense-in-depth, or keep NO ACTION as integrity guard?
4. Need a migration #006 for seed roles / demo contest, or handle via a separate `cmd/seed` Go tool?
