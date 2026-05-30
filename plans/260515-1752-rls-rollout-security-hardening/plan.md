# RLS Rollout Plan — OLPAI

**Status:** Draft
**Scope:** Planning only (no implementation)
**Goal:** Eliminate critical exposure from RLS-disabled tables with safe, incremental rollout.

## Problem Summary
Supabase advisory reports many `public.*` tables with RLS disabled. This can expose/allow modification of rows via anon/authenticated client paths if accessed directly.

## Constraints
- Must not break current backend/frontend flows.
- Must avoid big-bang `ENABLE RLS` across all tables.
- Must apply YAGNI/KISS: protect highest-risk tables first.

## Target Outcome
- Core sensitive tables protected by RLS + explicit policies.
- Verified role-based behavior for contestant/jury/admin.
- No regression in auth, contest join, submission, leaderboard read flows.

---

## Phase 01 — Access Model & Policy Matrix
**Objective:** Define who can do what before writing SQL.

### Deliverables
- Role model: `contestant`, `jury`, `admin`, service/backend role.
- Action matrix per table: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Public-read exceptions list (e.g., contests/tasks/announcements if needed).

### Focus tables (wave 1)
1. `public.users`
2. `public.contest_entries`
3. `public.submissions`

### Exit criteria
- Matrix approved and unambiguous for all three tables.

---

## Phase 02 — Draft Policies (Policy-First)
**Objective:** Create policy SQL without enabling RLS yet.

### Policy intent (high-level)
- `users`: user can read/update own profile; admin can broader access.
- `contest_entries`: user can see own entry; jury/admin can see contest scope.
- `submissions`: user/team can see own submissions; jury/admin can review contest scope.

### Deliverables
- Versioned SQL policy scripts (idempotent style where possible).
- Mapping comments from matrix row → policy statement.

### Exit criteria
- SQL scripts reviewed for completeness against matrix.

---

## Phase 03 — Staging Validation (Before Enable)
**Objective:** Validate behavior expectations with test personas.

### Test personas
- Contestant A
- Contestant B
- Jury user
- Admin user

### Validation checklist
- Own-data access allowed.
- Cross-user private access denied.
- Jury/admin moderation flows allowed.
- Existing API endpoints still return expected shapes/status codes.

### Exit criteria
- All positive/negative authorization tests pass in staging.

---

## Phase 04 — Incremental RLS Enablement
**Objective:** Enable RLS safely, one table at a time.

### Recommended order
1. `users`
2. `contest_entries`
3. `submissions`

### Process per table
1. Enable RLS for table.
2. Re-run focused smoke tests.
3. Verify no API regressions.
4. Proceed to next table only if green.

### Exit criteria
- RLS enabled + policies active for all wave-1 tables.

---

## Phase 05 — Expand Coverage (Wave 2)
**Objective:** Continue to remaining sensitive/public tables.

### Candidate next tables
- `clarifications`
- `teams`, `team_members`, `contest_entry_members`
- leaderboard tables
- `announcements` (public-read with controlled writes)

### Exit criteria
- Advisory count for RLS-disabled tables reduced per target milestone.

---

## Risk Register
1. **Lockout risk:** Enabling RLS without correct policy blocks legitimate traffic.
   - Mitigation: policy-first + staged enablement + persona tests.
2. **Hidden dependency risk:** Some backend paths may rely on broader table reads.
   - Mitigation: endpoint-by-endpoint smoke tests after each table enable.
3. **Over-permissive policy risk:** Quick policies may still leak rows.
   - Mitigation: explicit deny-by-default posture, negative tests mandatory.

---

## Validation Gates
- Gate A: Matrix approved.
- Gate B: Policy SQL reviewed.
- Gate C: Staging auth tests pass.
- Gate D: Incremental production rollout with rollback plan prepared.

---

## Rollback Strategy (Planning)
- Keep policy migration units small (per table).
- If regression appears, rollback last table’s enablement/policy change first.
- Maintain test script to re-check critical flows immediately after rollback.

---

## What This Plan Does NOT Do
- Does not execute SQL.
- Does not modify app/backend code.
- Does not define final policy SQL syntax yet (next step after matrix approval).

---

## Next Step (when you are ready)
- Produce Phase-02 policy SQL draft for `users`, `contest_entries`, `submissions` directly from the matrix.

## Unresolved Questions
1. Is frontend ever allowed direct Supabase access in production, or API-only through backend?
2. Exact jury scope: all contests or assigned contests only?
3. Should `announcements` be globally public-read or contest-entry scoped?
4. Do you need hard tenant isolation patterns now, or defer to later phase?
