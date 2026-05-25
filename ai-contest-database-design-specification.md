# Database Design Specification

## for an AI Contest Management, Judging, and Practice Platform

## Abstract

This document presents a detailed database specification for a web-based platform designed to support AI contests, virtual contests, and post-contest practice. The schema is intentionally centered around *contest entries* rather than directly around teams, because a contest participant can be an individual or a team, and the same user may participate in multiple teams with different lineups across contests. The design also supports multiple tasks per contest, multiple phases per task, asynchronous evaluation jobs, official/virtual/practice modes, communication between contestants and organizers, and current leaderboard views for both task-level and contest-level ranking.

---

## 1. Purpose of the Database

The goal of this database is to serve as the **system of record** for an AI competition platform. The platform must support:

- official contests,
- virtual replays of past contests,
- post-contest practice submissions,
- individual participation and team participation,
- dynamic team lineups per contest,
- multiple tasks inside one contest,
- multiple phases for each task, such as public test, private test, final public, and final private,
- submission upload, validation, judging, and rejudging,
- task-level and contest-level leaderboards,
- announcements, clarification requests, and technical tickets.

This design favors clarity, maintainability, and practical implementation over premature generalization.

## 2. Technology Choice: SQL, NoSQL, or Hybrid

### 2.1. Recommended Architecture

The recommended architecture is:

- **PostgreSQL** as the primary relational database,
- **JSONB** fields inside PostgreSQL for flexible configuration and structured payloads,
- **Redis** for caching, queues, and short-lived operational data,
- **MinIO or S3-compatible object storage** for uploaded files, ZIP archives, logs, and large artifacts.

### 2.2. Why PostgreSQL Should Be the Core

This platform contains many strongly related entities:

- users, teams, and memberships,
- contests, tasks, and phases,
- contest entries and lineups,
- submissions and judging jobs,
- leaderboard rows tied to contest entries,
- clarification and ticket flows tied to contest participation.

These entities require:

- foreign keys,
- uniqueness constraints,
- transactional consistency,
- predictable joins,
- strong integrity guarantees.

These are exactly the strengths of a relational database.

### 2.3. Why Not Use NoSQL as the Main Database

A NoSQL-first design would make some flexible fields easier to store, but it would complicate:

- enforcing one source of truth for contest participation,
- guaranteeing one active lineup per contest entry,
- maintaining leaderboard consistency,
- querying official versus virtual participation,
- joining user/team/entry/submission/leaderboard data.

Therefore, NoSQL is not recommended as the primary database for this project.

### 2.4. Why a Hybrid Approach Is Best

A hybrid design gives the best balance:

- PostgreSQL stores structured and relational domain data,
- JSONB stores flexible configuration and result payloads,
- Redis handles operational speed concerns,
- object storage handles large files outside the relational database.

## 3. Core Design Principles

The schema is built on the following principles:

### 3.1. Contest-Centric but Entry-Driven

The most important design decision is that the database is **not centered directly on team IDs**. Instead, it is centered on **contest entries**. A contest entry is the actual participant in a specific contest. It may represent:

- one individual participant,
- or one team with a contest-specific lineup.

This makes the model much cleaner for:

- official contests,
- virtual contests,
- practice mode,
- lineups that vary across contests,
- users belonging to multiple teams.

### 3.2. Task-Phase Separation

Each contest can contain multiple tasks, and each task can contain multiple phases. This supports workflows such as:

- `public_test`: quick scoring on the public test dataset from contestant-provided outputs,
- `private_test`: quick scoring on the private test dataset from contestant-provided outputs,
- `final_public`: reproducible scoring on the public test dataset by running the submitted inference artifact,
- `final_private`: reproducible scoring on the private test dataset by running the submitted inference artifact.

Each phase can have its own judging logic, submission limit, leaderboard visibility, and availability for official/virtual/practice modes.

The public/private distinction identifies which evaluation dataset is used. The final/non-final distinction identifies how the output is produced. Non-final phases are optimized for fast feedback during model development: contestants upload task-specific output artifacts directly. Final phases are optimized for transparency and reproducibility: contestants upload checkpoint/inference artifacts, and the platform runs inference to produce task-specific output artifacts before judging them. After the public phases close, contestants are expected to stop training from public feedback; the final phases represent the locked artifacts used for reproducible scoring.

The platform must not hardcode a universal submission format such as CSV. Each task defines its own submission contract, and the organizer-provided judge/inference pipeline is responsible for validating and processing that contract. Depending on the AI task, artifacts may be CSV, JSONL, images, masks, audio files, folders, ZIP archives, adversarial attack outputs, or another structure required by the problem.

### 3.3. One Final Score Per Submission in V1

For the first version, each submission stores one final score:

- a raw score used for ranking,
- a display score shown in the UI,
- an optional JSON breakdown for debugging or future reporting.

This keeps the system simple while remaining flexible enough for AI contests.

### 3.4. Split Leaderboards by Scope

Instead of forcing task-scoped and contest-scoped ranking into one generic structure, the database uses:

- one table for task-phase leaderboard rows,
- one table for contest-phase leaderboard rows.

This makes the leaderboard model easier to reason about and avoids a weak abstraction based on free-form board identifiers.

### 3.5. Flexible Metadata with JSONB

Fields that can vary by contest or by judging logic are stored as JSONB:

- contest rules,
- task submission schema,
- submission validation result,
- submission score payload,
- leaderboard score breakdown.

## 4. High-Level Entity Relationship View

The main relationships are:

- A **user** can belong to multiple teams.
- A **team** can contain multiple users.
- A **contest** contains multiple tasks.
- A **task** contains multiple phases.
- A **contest entry** belongs to exactly one contest.
- A **contest entry** represents either one user or one team.
- A **contest entry** has one lineup through contest_entry_members.
- A **submission** belongs to one contest entry, one task, and one phase.
- A **submission** can have one or more stored uploaded files.
- A **submission** can generate one or more evaluation jobs.
- A **task-phase leaderboard entry** belongs to one contest entry, one task, and one real task phase.
- A **contest-phase leaderboard entry** belongs to one contest entry and one logical contest phase definition.

## 5. Detailed Table Specification

### 5.1. Table 1: users

**Purpose:** stores user accounts in the system.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Internal primary key for the user. |
| email | VARCHAR, UNIQUE | Login email address. Must be unique. |
| password_hash | VARCHAR | Hashed password. Never store plaintext passwords. |
| full_name | VARCHAR | User's display name. |
| role | ENUM/VARCHAR | Role in the platform: contestant, jury, or admin. |
| student_id | VARCHAR, NULL | Student identifier if the institution needs it. |
| avatar_url | VARCHAR, NULL | Optional profile image URL. |
| last_visit | TIMESTAMPTZ, NULL | Last known activity timestamp. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Last update time. |

**Notes:**

- The role belongs to the platform, not necessarily to a team.
- A contestant may later become jury or admin without changing their identity record.

### 5.2. Table 2: teams

**Purpose:** stores global teams, not tied directly to a specific contest.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Team primary key. |
| slug | VARCHAR, UNIQUE | Short readable identifier for URLs and references. |
| name | VARCHAR | Human-readable team name. |
| owner_id | UUID, FK users(id) | Team creator or owner. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Last update time. |

**Notes:**

- The same team can participate in multiple contests.
- Team composition may exist globally, but contest-specific lineups are handled separately.

### 5.3. Table 3: team_members

**Purpose:** stores the many-to-many relation between users and teams.

| Column | Type | Meaning |
|---|---|---|
| team_id | UUID, FK teams(id) | Team identifier. |
| user_id | UUID, FK users(id) | User identifier. |
| role | ENUM/VARCHAR | Team role such as owner, manager, or member. |
| joined_at | TIMESTAMPTZ | When the user joined the team. |

**Primary key:** `(team_id, user_id)`

**Notes:**

- One user may belong to many teams.
- One team may contain many users.

### 5.4. Table 4: contests

**Purpose:** stores one contest event.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Contest primary key. |
| slug | VARCHAR, UNIQUE | Human-readable contest code for URLs. |
| title | VARCHAR | Contest title. |
| description | TEXT | Contest description. |
| banner_url | VARCHAR, NULL | Optional banner or poster URL. |
| status | ENUM/VARCHAR | Lifecycle state: draft, registration_open, running, ended, archived. |
| entry_policy | ENUM/VARCHAR | Whether the contest allows individual entries, team entries, or both. |
| registration_start | TIMESTAMPTZ | Registration opening time. |
| registration_end | TIMESTAMPTZ | Registration closing time. |
| start_time | TIMESTAMPTZ | Official contest start time. |
| end_time | TIMESTAMPTZ | Official contest end time. |
| visibility | ENUM/VARCHAR | Public or private contest visibility. |
| rules_json | JSONB | Flexible contest rules configuration. |
| created_by | UUID, FK users(id) | Contest creator. |
| max_team_size | INTEGER | Maximum allowed lineup size for team entries. |
| require_approval | BOOLEAN | Whether entry approval is required. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

### 5.5. Table 5: tasks

**Purpose:** stores contest tasks. A contest may contain one or multiple tasks.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Task primary key. |
| contest_id | UUID, FK contests(id) | Parent contest. |
| slug | VARCHAR | Short task identifier, unique within a contest. |
| title | VARCHAR | Task title. |
| description | TEXT | Task summary. |
| problem_statement_url | VARCHAR, NULL | Link to statement or PDF. |
| submission_schema | JSONB | Definition of expected uploaded structure. |
| score_label | VARCHAR | UI label for the score, e.g., Score, Accuracy, MAPE. |
| higher_is_better | BOOLEAN | Whether larger scores rank higher. |
| sort_order | INTEGER | Display order inside the contest. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

**Recommended uniqueness:** `UNIQUE(contest_id, slug)`

### 5.6. Table 6: contest_phase_defs

**Purpose:** stores logical contest-wide phase definitions such as `public_test`, `final_public`, `private_test`, and `final_private`.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Contest-phase definition primary key. |
| contest_id | UUID, FK contests(id) | Parent contest. |
| key | ENUM/VARCHAR | Stable logical key such as `public_test` or `final_private`. |
| title | VARCHAR | Human-readable title shown in UI. |
| sort_order | INTEGER | Display order among contest-level phase tabs. |

**Required uniqueness:** `UNIQUE(contest_id, key)`

**Design note:**
This table is the source of truth for logical phase identities used consistently across tasks and contest-level leaderboards. Typical values are:

- `public_test`
- `final_public`
- `private_test`
- `final_private`

For V1, each contest is expected to define exactly these four logical phase definitions. This completeness rule is best enforced in application or service-layer logic when creating or publishing the contest.

**Meaning of the four logical phases:**

| Phase key | Dataset | Submission artifact | Purpose |
|---|---|---|---|
| `public_test` | Public test dataset | Precomputed output artifact defined by the task contract | Fast feedback so contestants can evaluate and improve model training against public feedback. |
| `final_public` | Public test dataset | Checkpoint/inference artifact | The platform runs inference to regenerate output and score it, making the public result reproducible and transparent from the locked artifact. |
| `private_test` | Private test dataset | Precomputed output artifact defined by the task contract | Fast scoring on the private dataset when the contest rules allow this phase to open or display feedback. |
| `final_private` | Private test dataset | Checkpoint/inference artifact | The platform runs inference and scores the regenerated output on the private dataset. This phase is intended for final private evaluation. |

The dataset axis and artifact axis are intentionally separate:

- `public_test` and `final_public` use the same public evaluation set.
- `private_test` and `final_private` use the same private evaluation set.
- `public_test` and `private_test` are non-final phases where contestants provide output directly.
- `final_public` and `final_private` are final phases where the platform derives output by running inference.
- The concrete file layout is task-specific and should be described in `tasks.submission_schema`, task statements, and/or evaluation-set metadata. The judge must consume that declared layout rather than assuming a fixed filename.

### 5.7. Table 7: phases

**Purpose:** stores real task-specific phases. Each phase belongs to one task and maps to one logical contest phase definition.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Phase primary key. |
| task_id | UUID, FK tasks(id) | Parent task. |
| contest_phase_def_id | UUID, FK contest_phase_defs(id) | Logical contest-phase identity for this task phase. |
| slug | VARCHAR | Short phase identifier. |
| title | VARCHAR | Human-readable phase name. |
| description | TEXT, NULL | Optional explanation of the phase. |
| open_time | TIMESTAMPTZ | Phase opening time. |
| close_time | TIMESTAMPTZ | Phase closing time. |
| judge_key | VARCHAR | Key that maps to the judging script for this phase. |
| submission_limit | INTEGER, NULL | Maximum number of allowed submissions. |
| leaderboard_mode | ENUM/VARCHAR | Ranking mode, for example best or latest. |
| allow_official_submit | BOOLEAN | Whether official entries may submit. |
| allow_virtual_submit | BOOLEAN | Whether virtual entries may submit. |
| allow_practice_submit | BOOLEAN | Whether practice entries may submit. |
| display_scores | BOOLEAN | Whether scores are visible to contestants. |
| is_frozen | BOOLEAN | Whether the task-phase leaderboard is frozen. |
| is_final | BOOLEAN | Whether this phase is considered a final-model or final-result phase. |
| sort_order | INTEGER | Display order inside the task. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

**Required uniqueness:**

- `UNIQUE(task_id, slug)`
- `UNIQUE(task_id, contest_phase_def_id)`
- `UNIQUE(id, task_id)` to support composite foreign keys from child tables

**V1 rule:**
Each task is expected to instantiate exactly one phase for each contest-wide phase definition. In other words, if a contest defines `public_test`, `private_test`, `final_public`, and `final_private`, then every task should have exactly four corresponding rows in `phases`. The uniqueness constraint above prevents duplicates, while the completeness rule is best enforced in application or service-layer logic.

**V1 phase mapping rule:**

- `public_test` maps to the task's public evaluation set and uses `is_final = false`.
- `final_public` maps to the task's public evaluation set and uses `is_final = true`.
- `private_test` maps to the task's private evaluation set and uses `is_final = false`.
- `final_private` maps to the task's private evaluation set and uses `is_final = true`.

For `is_final = false`, the submission should contain a precomputed output artifact accepted by the task schema. For `is_final = true`, the submission should contain the locked checkpoint/inference artifact; the worker runs inference to generate the task-specific output artifact and then judges that generated output.

The same flexibility applies to both normal and final phases. The organizer defines what files must be submitted and how they are interpreted. The contestant submits artifacts matching that contract. The platform stores those artifacts and passes them to the judge pipeline without imposing a global format.

**Interpretation of judge_key:**
This is not a metric. It is the identifier of the judging script for that task-specific phase. For example:

- `task1_public_test`
- `task1_final_public`
- `task2_private_test`

### 5.8. Table 8: contest_entries

**Purpose:** stores actual participants in a contest.

A contest entry is the unit that competes. It may be:

- one individual,
- or one team.

It may also be in one of three modes:

- official,
- virtual,
- practice.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Contest entry primary key. |
| contest_id | UUID, FK contests(id) | Parent contest. |
| entry_type | ENUM/VARCHAR | individual or team. |
| entry_mode | ENUM/VARCHAR | official, virtual, or practice. |
| user_id | UUID, NULL, FK users(id) | Used when the entry is individual. |
| team_id | UUID, NULL, FK teams(id) | Used when the entry is team-based. |
| display_name | VARCHAR | Name shown in leaderboards. |
| status | ENUM/VARCHAR | pending, approved, active, disqualified, finished. |
| registered_by | UUID, FK users(id) | Who created the entry. |
| approved_by | UUID, NULL, FK users(id) | Approver if approval is required. |
| approved_at | TIMESTAMPTZ, NULL | Approval timestamp. |
| start_at | TIMESTAMPTZ, NULL | Used for virtual mode start time. |
| end_at | TIMESTAMPTZ, NULL | Used for virtual mode end time. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

**Design note:**
This table replaces the older idea of attaching submissions directly to teams.

**Required integrity rules:**

- Exactly one of `user_id` or `team_id` must be present.
- If `entry_type = individual`, then `user_id` must be non-null and `team_id` must be null.
- If `entry_type = team`, then `team_id` must be non-null and `user_id` must be null.
- If `entry_mode = virtual`, then `start_at` and `end_at` should both be non-null and must satisfy `start_at < end_at`.
- For `official` and `practice` entries, `start_at` and `end_at` are usually null.

**Recommended uniqueness:**

- At minimum, prevent duplicate individual entries in the same mode with `UNIQUE(contest_id, entry_mode, user_id)` where `user_id IS NOT NULL`.
- Prevent duplicate team entries in the same mode with `UNIQUE(contest_id, entry_mode, team_id)` where `team_id IS NOT NULL`.

### 5.9. Table 9: contest_entry_members

**Purpose:** stores the lineup of a contest entry.

This is especially important for team entries because a global team may have many members, but only a subset may participate in a given contest.

| Column | Type | Meaning |
|---|---|---|
| contest_entry_id | UUID, FK contest_entries(id) | Parent contest entry. |
| user_id | UUID, FK users(id) | Participating user. |
| role | ENUM/VARCHAR | leader or member for this lineup. |
| joined_at | TIMESTAMPTZ | When this user was attached to the contest entry. |

**Primary key:** `(contest_entry_id, user_id)`

**Required design clarification:**

- If the parent entry is `individual`, the table should contain exactly one member row and that member should be the same as `contest_entries.user_id`.
- If the parent entry is `team`, every member listed here should be a valid member of the referenced global team, unless the platform explicitly treats contest lineups as independent snapshots.
- A rule such as "one user may not join two official entries in the same contest" is best treated as application-level validation in V1 because the required uniqueness spans parent and child tables and depends on `entry_mode`.

### 5.10. Table 10: submissions

**Purpose:** stores every submission attempt.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Submission primary key. |
| contest_id | UUID, FK contests(id) | Explicit contest scope used to enforce cross-table consistency. |
| contest_entry_id | UUID, FK contest_entries(id) | Who submitted for the contest. |
| task_id | UUID, FK tasks(id) | Target task. |
| phase_id | UUID, FK phases(id) | Target phase. |
| submitted_by | UUID, FK users(id) | User who actually initiated the submission. In V1 this is assumed to be a member of the contest entry lineup. |
| status | ENUM/VARCHAR | uploaded, validating, queued, running, done, failed. |
| submitted_at | TIMESTAMPTZ | Submission timestamp. |
| file_count | INTEGER | Number of uploaded files linked to this submission. |
| total_size_bytes | BIGINT | Total uploaded size. |
| manifest_hash | VARCHAR, NULL | Hash describing submission content structure. |
| validation_result | JSONB, NULL | Validation details, including schema mismatches if any. |
| error_message | TEXT, NULL | Human-readable failure reason. |
| raw_score | NUMERIC, NULL | Internal score used for ranking. |
| display_score | NUMERIC, NULL | Formatted score for UI display. |
| score_payload | JSONB, NULL | Optional breakdown or structured evaluator output. |
| evaluated_at | TIMESTAMPTZ, NULL | Evaluation completion time. |
| is_final | BOOLEAN | Marks a final submission if the contest uses that rule. |
| rejudge_count | INTEGER | How many times the submission has been rejudged. |
| client_ip | VARCHAR, NULL | Request IP. |
| user_agent | VARCHAR, NULL | Client user agent. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

**Important note:**
For V1, one submission stores one final score. This is intentional and sufficient for a Kaggle-like public display of score and rank.

**Required integrity rules:**

- The parent `contest_entry` and the target `task` must belong to the same contest.
- The target `phase` must belong to the selected `task`.
- In V1, the `submitted_by` user must belong to the submitting entry's active lineup.

**Required relational mechanism:**

- Add `UNIQUE(id, contest_id)` on `contest_entries`.
- Add `UNIQUE(id, contest_id)` on `tasks`.
- Add `UNIQUE(id, task_id)` on `phases`.
- Enforce `FK(contest_entry_id, contest_id) -> contest_entries(id, contest_id)`.
- Enforce `FK(task_id, contest_id) -> tasks(id, contest_id)`.
- Enforce `FK(phase_id, task_id) -> phases(id, task_id)`.
- Enforce `FK(contest_entry_id, submitted_by) -> contest_entry_members(contest_entry_id, user_id)`.

### 5.11. Table 11: submission_files

**Purpose:** stores uploaded files that belong to a submission.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | File row identifier. |
| submission_id | UUID, FK submissions(id) | Parent submission. |
| original_filename | VARCHAR | Original filename uploaded by the user. |
| storage_path | VARCHAR | Object key or storage path in MinIO/S3/local storage. |
| file_size | BIGINT | File size in bytes. |
| content_type | VARCHAR, NULL | MIME type if known. |
| hash_sha256 | VARCHAR, NULL | File integrity hash. |
| created_at | TIMESTAMPTZ | Creation time. |

**Design note:**

- In V1, this table is intentionally minimal and can be used simply for the main uploaded artifact.
- It does not need to store every extracted file inside a ZIP archive.
- Submission files are intentionally generic. They may represent predictions, images, archives, checkpoints, scripts, generated outputs, or any other files required by the task submission contract.

### 5.12. Table 12: evaluation_jobs

**Purpose:** stores asynchronous evaluation pipeline jobs.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Job identifier. |
| submission_id | UUID, FK submissions(id) | Submission being processed. |
| job_type | ENUM/VARCHAR | validate, judge, or rejudge. |
| status | ENUM/VARCHAR | pending, running, done, failed. |
| priority | INTEGER | Relative scheduling priority. |
| worker_id | VARCHAR, NULL | Worker identifier that processed the job. |
| attempt_count | INTEGER | Retry count. |
| max_attempts | INTEGER | Maximum allowed retries. |
| input_data | JSONB, NULL | Structured input metadata for the worker. |
| output_data | JSONB, NULL | Structured output payload from the worker. |
| started_at | TIMESTAMPTZ, NULL | Start time. |
| completed_at | TIMESTAMPTZ, NULL | Completion time. |
| execution_time_ms | INTEGER, NULL | Runtime in milliseconds. |
| error_log | TEXT, NULL | Internal error detail. |
| celery_task_id | VARCHAR, NULL | Background queue task identifier if Celery is used. |
| created_at | TIMESTAMPTZ | Creation time. |

**Design decision:**
This table intentionally does not store `phase_id` as a separate column. The evaluation phase is derived from the referenced submission, which avoids denormalization drift.

### 5.13. Table 13: task_phase_leaderboard_entries

**Purpose:** stores current leaderboard rows for one task at one real task phase.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Task-phase leaderboard row identifier. |
| contest_id | UUID, FK contests(id) | Contest identifier. |
| task_id | UUID, FK tasks(id) | Ranked task. |
| phase_id | UUID, FK phases(id) | Ranked task-specific phase. |
| contest_entry_id | UUID, FK contest_entries(id) | Ranked contest entry. |
| rank | INTEGER | Rank position. |
| score | NUMERIC | Displayed ranking score. |
| score_breakdown | JSONB, NULL | Optional detailed subscore breakdown or cached UI payload. |
| chosen_submission_id | UUID, NULL, FK submissions(id) | Submission currently used for ranking. |
| entries_count | INTEGER | Number of submissions considered for this entry in this board. |
| is_frozen | BOOLEAN | Whether this row is part of a frozen board state. |
| is_disqualified | BOOLEAN | Whether the row is disqualified. |
| dq_reason | TEXT, NULL | Reason for disqualification. |
| updated_at | TIMESTAMPTZ | Update time. |

**Required uniqueness:** `UNIQUE(phase_id, contest_entry_id)`

**Required integrity rules:**

- The ranked `contest_entry` must belong to the same `contest_id` as the leaderboard row.
- The selected `phase_id` must belong to the selected `task_id`.
- If `chosen_submission_id` is non-null, it should belong to the same `contest_entry`, `task_id`, and `phase_id` as the leaderboard row.

### 5.14. Table 14: contest_phase_leaderboard_entries

**Purpose:** stores current contest-level leaderboard rows for one logical contest phase definition.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Contest-phase leaderboard row identifier. |
| contest_id | UUID, FK contests(id) | Contest identifier. |
| contest_phase_def_id | UUID, FK contest_phase_defs(id) | Ranked logical contest phase. |
| contest_entry_id | UUID, FK contest_entries(id) | Ranked contest entry. |
| rank | INTEGER | Rank position. |
| score | NUMERIC | Displayed aggregate ranking score. |
| score_breakdown | JSONB, NULL | Optional task-level breakdown or cached UI payload. |
| entries_count | INTEGER | Number of task submissions or task-phase results considered. |
| is_frozen | BOOLEAN | Whether this row is part of a frozen board state. |
| is_disqualified | BOOLEAN | Whether the row is disqualified. |
| dq_reason | TEXT, NULL | Reason for disqualification. |
| updated_at | TIMESTAMPTZ | Update time. |

**Required uniqueness:** `UNIQUE(contest_phase_def_id, contest_entry_id)`

**Required integrity rules:**

- The ranked `contest_entry` must belong to the same `contest_id` as the leaderboard row.
- The selected `contest_phase_def_id` must belong to the same `contest_id` as the leaderboard row.
- Official, virtual, and practice views are derived by joining to `contest_entries.entry_mode`; the leaderboard table itself does not duplicate `entry_mode`.

**Practical UI interpretation:**

- Official leaderboard: join to `contest_entries` and filter `entry_mode = official`
- Virtual leaderboard: join to `contest_entries` and filter `entry_mode = virtual`
- Practice leaderboard: join to `contest_entries` and filter `entry_mode = practice`

### 5.15. Table 15: announcements

**Purpose:** stores organizer announcements.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Announcement identifier. |
| contest_id | UUID, FK contests(id) | Parent contest. |
| task_id | UUID, NULL, FK tasks(id) | Optional task-specific announcement. |
| title | VARCHAR | Title of the announcement. |
| content | TEXT | Body content. |
| is_pinned | BOOLEAN | Whether this announcement is pinned. |
| is_public | BOOLEAN | Whether contestants can see it. |
| created_by | UUID, FK users(id) | Author. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

### 5.16. Table 16: clarifications

**Purpose:** stores clarification requests and responses.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Clarification identifier. |
| contest_id | UUID, FK contests(id) | Parent contest. |
| task_id | UUID, NULL, FK tasks(id) | Related task if applicable. |
| phase_id | UUID, NULL, FK phases(id) | Related phase if applicable. |
| contest_entry_id | UUID, FK contest_entries(id) | Entry that asked the question. |
| question | TEXT | Clarification request. |
| answer | TEXT, NULL | Organizer answer. |
| is_public | BOOLEAN | Whether the answer is public to all contestants. |
| status | ENUM/VARCHAR | pending, answered, or closed. |
| asked_by | UUID, FK users(id) | User who asked. |
| answered_by | UUID, NULL, FK users(id) | User who answered. |
| answered_at | TIMESTAMPTZ, NULL | Answer timestamp. |
| created_at | TIMESTAMPTZ | Creation time. |
| updated_at | TIMESTAMPTZ | Update time. |

### 5.17. Table 17: tickets

**Purpose:** stores technical support issues and operational complaints.

| Column | Type | Meaning |
|---|---|---|
| id | UUID, PK | Ticket identifier. |
| submission_id | UUID, NULL, FK submissions(id) | Related submission if applicable. |
| contest_entry_id | UUID, FK contest_entries(id) | Entry that reported the issue. |
| category | ENUM/VARCHAR | upload, judge, score, or system. |
| subject | VARCHAR | Ticket subject. |
| description | TEXT | Full issue description. |
| status | ENUM/VARCHAR | open, in_progress, resolved, rejected. |
| priority | ENUM/VARCHAR | e.g. low, normal, high, urgent. |
| assigned_to | UUID, NULL, FK users(id) | Staff member handling the ticket. |
| created_by | UUID, FK users(id) | Reporter. |
| created_at | TIMESTAMPTZ | Creation time. |
| resolved_at | TIMESTAMPTZ, NULL | Resolution time. |
| updated_at | TIMESTAMPTZ | Update time. |

## 6. Important Design Decisions Explained

### 6.1. Why We Use contest_entries

Without `contest_entries`, the system would need to attach submissions and leaderboard records directly to either users or teams. That approach becomes messy when:

- a contest allows both individuals and teams,
- a team has a different lineup in each contest,
- a user belongs to multiple teams,
- virtual and practice participation must be stored separately from official participation.

The `contest_entries` table solves all of these in one abstraction.

### 6.2. Why We Store Submission Scores Directly in submissions

For V1, the UI only needs one final score per submission, similar to many competition platforms where contestants mostly care about rank and score. Therefore:

- we do not need a separate `scores` table yet,
- we do not need a separate `metrics` table yet,
- we only store `raw_score`, `display_score`, and `score_payload`.

This keeps the schema simple without preventing future extension.

### 6.3. Why We Split Leaderboards into Two Tables

The final schema intentionally uses two leaderboard tables:

- `task_phase_leaderboard_entries` for one task at one real task phase,
- `contest_phase_leaderboard_entries` for one contest-wide logical phase.

This is clearer than one generalized table because:

- there is no `board_type` column to interpret,
- there is no free-form `phase_key`,
- task-scoped ranking and contest-scoped ranking have different natural keys.

### 6.4. Why submission_files Is Kept Even in a Simple Version

Although the first version may only upload one main ZIP file or one prediction file, keeping `submission_files` is still useful because:

- it preserves file metadata cleanly,
- it allows future multi-file submissions,
- it separates file storage concerns from the submission record itself.

## 7. Suggested Integrity Constraints

The following constraints are strongly recommended:

- `users.email` must be unique.
- `teams.slug` must be unique.
- `contests.slug` must be unique.
- `CHECK(registration_start <= registration_end)` on contests when both values are present.
- `CHECK(start_time < end_time)` on contests.
- `CHECK(max_team_size > 0)` on contests.
- `UNIQUE(contest_id, key)` on `contest_phase_defs`.
- `UNIQUE(contest_id, slug)` on tasks.
- `UNIQUE(id, contest_id)` on tasks.
- `UNIQUE(task_id, slug)` on phases.
- `UNIQUE(task_id, contest_phase_def_id)` on phases.
- `UNIQUE(id, task_id)` on phases.
- `CHECK(open_time < close_time)` on phases.
- `CHECK(submission_limit IS NULL OR submission_limit >= 0)` on phases.
- `PRIMARY KEY(team_id, user_id)` on team_members.
- `UNIQUE(id, contest_id)` on contest_entries.
- A `CHECK` on `contest_entries` to enforce exactly one participant source: either `user_id` or `team_id`.
- `PRIMARY KEY(contest_entry_id, user_id)` on contest_entry_members.
- A relational consistency rule ensuring each submission references a `contest_entry`, `task`, and `phase` from the same contest/task chain.
- `FK(contest_entry_id, contest_id) -> contest_entries(id, contest_id)` on submissions.
- `FK(task_id, contest_id) -> tasks(id, contest_id)` on submissions.
- `FK(phase_id, task_id) -> phases(id, task_id)` on submissions.
- `FK(contest_entry_id, submitted_by) -> contest_entry_members(contest_entry_id, user_id)` on submissions.
- `CHECK(file_count >= 0)`, `CHECK(total_size_bytes >= 0)`, and `CHECK(rejudge_count >= 0)` on submissions.
- `CHECK(attempt_count >= 0)`, `CHECK(max_attempts >= 0)`, and `CHECK(priority >= 0)` on evaluation_jobs.
- `UNIQUE(phase_id, contest_entry_id)` on `task_phase_leaderboard_entries`.
- `UNIQUE(contest_phase_def_id, contest_entry_id)` on `contest_phase_leaderboard_entries`.

### 7.1. What Must Be Enforced by the Database

The following rules are strong candidates for database-level enforcement rather than only application-level validation:

- contest entry participant exclusivity,
- contest consistency between entries, tasks, phases, and submissions,
- parent-child phase/task consistency,
- non-negative counters and valid time ranges,
- uniqueness of leaderboard rows for each task-phase scope and contest-phase scope.

### 7.2. What May Remain in Application Logic in V1

The following rules may be validated in application code first if they are too awkward to express in pure SQL, though they should still be documented explicitly:

- whether each contest defines exactly the required four logical phase definitions,
- whether each task instantiates exactly one phase for each required contest phase definition,
- whether a team-entry lineup user must already belong to the global team,
- whether one user may join multiple contest entries in the same contest under special rules,
- whether practice or virtual entries use different temporal submission windows beyond the base phase windows,
- whether a chosen submission stored in a leaderboard row is checked purely in SQL or verified before upsert in application logic.

## 8. Suggested Indexes

The following indexes are recommended for performance:

- `users(email)`
- `teams(slug)`
- `contests(slug, status, start_time, end_time)`
- `contest_phase_defs(contest_id, key, sort_order)`
- `tasks(contest_id, sort_order)`
- `phases(task_id, open_time, close_time)`
- `contest_entries(contest_id, entry_mode, status)`
- `contest_entry_members(contest_entry_id, user_id)`
- `submissions(contest_id, contest_entry_id, task_id, phase_id, submitted_at)`
- `submissions(status)`
- `evaluation_jobs(status, created_at)`
- `task_phase_leaderboard_entries(phase_id, rank)`
- `contest_phase_leaderboard_entries(contest_phase_def_id, rank)`
- `clarifications(contest_id, status)`
- `tickets(contest_entry_id, status)`

## 9. Operational Workflow Mapped to the Database

### 9.1. Team and Contest Registration

1. Users exist in `users`.
2. Global teams are defined in `teams`.
3. Team membership is defined in `team_members`.
4. A contestant creates a `contest_entry`.
5. If the entry is team-based, its lineup is stored in `contest_entry_members`.

### 9.2. Submission and Judging

1. A contestant uploads a submission, creating a row in `submissions`.
2. Uploaded artifacts are recorded in `submission_files`.
3. Validation and judging jobs are added to `evaluation_jobs`.
4. For non-final phases (`public_test`, `private_test`), the worker judges the uploaded output artifact directly according to the task submission contract.
5. For final phases (`final_public`, `final_private`), the worker runs the uploaded checkpoint/inference artifact to generate output according to the task submission contract, then judges that generated output.
6. After judging, score fields in `submissions` are updated.
7. Task-level leaderboard rows in `task_phase_leaderboard_entries` are recomputed or updated.
8. Contest-level leaderboard rows in `contest_phase_leaderboard_entries` are recomputed or updated.

### 9.3. Communication During Contest

- General notices use `announcements`.
- Rule and statement questions use `clarifications`.
- Technical issues and complaints use `tickets`.

## 10. Future Extensions

This schema is intentionally suitable for V1, but it leaves room for extension:

### 10.1. Possible V2 Additions

- `audit_logs` for full immutable change tracking,
- `user_stats_cache` for profile summaries,
- `leaderboard_snapshots` for historical ranking snapshots,
- a separate `scores` table if multi-metric public reporting becomes necessary,
- a separate `evaluators` table if the platform later supports built-in and custom judge modules as first-class data.

### 10.2. Why They Are Not in V1

They are not strictly necessary for the first functional release. The current schema already supports:

- official contests,
- virtual contests,
- practice submissions,
- team lineups,
- asynchronous judging,
- current leaderboards,
- operational communication.

## 11. Final Recommendation

The recommended production-ready database foundation for the initial version is:

- **PostgreSQL** as the primary relational database,
- **JSONB** for flexible configuration and structured payloads,
- **Redis** for queueing and caching,
- **MinIO/S3** for submission artifacts.

The schema should contain the following seventeen core tables:

1. users
2. teams
3. team_members
4. contests
5. contest_phase_defs
6. tasks
7. phases
8. contest_entries
9. contest_entry_members
10. submissions
11. submission_files
12. evaluation_jobs
13. task_phase_leaderboard_entries
14. contest_phase_leaderboard_entries
15. announcements
16. clarifications
17. tickets

This design is detailed enough for implementation, clean enough for maintenance, and flexible enough for future evolution into a stronger AI contest platform.
