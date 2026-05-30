# Plan: Evaluation Sets for Four-Phase Task Model

## Goal

Fix backend/domain model so each task has four phases but only two organizer evaluation datasets:

```text
Task
├── public evaluation set
│   ├── used by public_test
│   └── used by final_public
└── private evaluation set
    ├── used by private_test
    └── used by final_private
```

This replaces the current duplicated `phase_assets` model where assets are uploaded per phase.

## Brutal assessment

The current backend works technically, but the model is wrong for the clarified competition design. It forces duplicate uploads:

- public assets must be uploaded once for `public_test` and again for `final_public`.
- private assets must be uploaded once for `private_test` and again for `final_private`.

That is not just UI inconvenience; it makes source of truth unclear and can let public and final-public accidentally use different ground truth.

## Recommended approach

Add task-scoped evaluation sets and move organizer assets from `phase_id` to `evaluation_set_id`.

Do **not** add `evaluation_jobs`. Keep Lean V1:

- One submission belongs to one phase.
- One Redis judge job processes one submission.
- Worker loads phase -> evaluation set -> assets.
- Leaderboard remains phase-based.

## Data model

### New enum or check constraint

Use a simple key with two values:

```text
public
private
```

Recommended DB type:

```sql
CREATE TYPE evaluation_set_key AS ENUM ('public', 'private');
```

### New table: `task_evaluation_sets`

```sql
CREATE TABLE task_evaluation_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  key         evaluation_set_key NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, key),
  UNIQUE (id, task_id)
);
```

Each task should have exactly two rows in normal product flow:

- `(task_id, 'public')`
- `(task_id, 'private')`

Enforce exact two rows in app/service logic for V1, not DB triggers.

### Replace `phase_assets` with `evaluation_set_assets`

```sql
CREATE TABLE evaluation_set_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_set_id  UUID NOT NULL REFERENCES task_evaluation_sets(id) ON DELETE CASCADE,
  asset_key          VARCHAR(255) NOT NULL,
  original_filename  VARCHAR(500) NOT NULL,
  storage_path       VARCHAR(1000) NOT NULL,
  file_size          BIGINT NOT NULL DEFAULT 0,
  content_type       VARCHAR(255),
  hash_sha256        VARCHAR(128),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_set_id, asset_key),
  CONSTRAINT chk_eval_asset_size CHECK (file_size >= 0)
);
```

### Add to `phases`

```sql
ALTER TABLE phases
ADD COLUMN evaluation_set_id UUID;

ALTER TABLE phases
ADD CONSTRAINT fk_phases_evaluation_set_task
FOREIGN KEY (evaluation_set_id, task_id)
REFERENCES task_evaluation_sets(id, task_id);
```

After backfill, make it not null:

```sql
ALTER TABLE phases ALTER COLUMN evaluation_set_id SET NOT NULL;
```

## Phase mapping

Map existing `contest_phase_key` to evaluation set:

| `contest_phase_key` | `evaluation_set_key` | `is_final` |
|---|---|---|
| `public_test` | `public` | false |
| `final_public` | `public` | true |
| `private_test` | `private` | false |
| `final_private` | `private` | true |

Do not rename enum values unless product/API explicitly requires it. Current DB has `final_public` / `final_private`; UI can display `final_public_test` / `final_private_test` labels.

## API design

### Evaluation set endpoints

Add minimal endpoints:

```text
GET  /api/v1/tasks/:task_id/evaluation-sets
POST /api/v1/tasks/:task_id/evaluation-sets
GET  /api/v1/evaluation-sets/:id
```

For V1, `POST` can be admin-only and only allow `key` = `public` or `private`.

Request:

```json
{
  "key": "public",
  "title": "Public Evaluation Set",
  "description": "Optional"
}
```

Response:

```json
{
  "id": "...",
  "task_id": "...",
  "key": "public",
  "title": "Public Evaluation Set",
  "description": null,
  "created_at": "..."
}
```

### Asset endpoints

Replace phase-scoped asset endpoints with evaluation-set-scoped endpoints:

```text
POST /api/v1/evaluation-sets/:id/assets:initiate
POST /api/v1/evaluation-sets/:id/assets/complete
GET  /api/v1/evaluation-sets/:id/assets
```

Object keys:

```text
evaluation-sets/{evaluation_set_id}/{asset_key}/{filename}
```

Expected asset keys remain simple:

```text
judge.py
ground_truth.csv
inputs.csv / dataset.zip / public_inputs.csv / private_inputs.csv
```

Worker should still accept `ground_truth.csv` and fallback names if needed, but UI should standardize on `ground_truth.csv`.

### Phase create/update

Extend `CreatePhaseRequest`:

```json
{
  "contest_phase_def_id": "...",
  "evaluation_set_id": "...",
  "slug": "public-test",
  "title": "Public Test",
  "is_final": false
}
```

Validation rules:

- `evaluation_set_id` must belong to the same task.
- If phase def key is `public_test` or `final_public`, evaluation set key must be `public`.
- If phase def key is `private_test` or `final_private`, evaluation set key must be `private`.
- `is_final` should match phase def:
  - final keys -> true
  - non-final keys -> false

Recommendation: derive `is_final` server-side from phase def key later. For this plan, keep existing `is_final` but validate consistency.

## Worker changes

Current worker flow:

```python
sub = get_submission(...)
phase_assets = list_phase_assets(conn, sub.phase_id)
```

New worker flow:

```python
sub = get_submission(...)
evaluation_assets = list_evaluation_set_assets(conn, sub.evaluation_set_id)
```

Update `Submission` dataclass to include:

```python
evaluation_set_id: str
evaluation_set_key: str
phase_key: str
is_final: bool
```

`get_submission` should join:

```sql
submissions s
JOIN phases p ON p.id = s.phase_id
JOIN contest_phase_defs cpd ON cpd.id = p.contest_phase_def_id
JOIN task_evaluation_sets tes ON tes.id = p.evaluation_set_id
```

Worker execution decision remains:

```python
if sub.is_final:
    expect submission.zip
    run inference using evaluation set input files
else:
    expect predictions.csv
    run judge directly
```

## Migration strategy

Because this work is not committed yet, the cleanest implementation is to edit the newly added artifact migration before merge:

- Replace `phase_assets` migration with:
  - `evaluation_set_key` enum
  - `task_evaluation_sets`
  - `evaluation_set_assets`
  - `phases.evaluation_set_id`

If preserving already-applied local dev DB matters, add a new migration instead:

1. Create `task_evaluation_sets`.
2. Create `evaluation_set_assets`.
3. Add nullable `phases.evaluation_set_id`.
4. Backfill public/private evaluation sets per task.
5. Map phases by `contest_phase_defs.key`.
6. Copy existing `phase_assets` into `evaluation_set_assets`.
7. Set `phases.evaluation_set_id NOT NULL`.
8. Drop `phase_assets`.

Recommended for this repo right now: **new migration**, because the local sanity tests have already applied `phase_assets` and it is safer to keep migration history monotonic.

## UI contract after backend change

Organizer UI:

1. Select task.
2. Manage two evaluation sets:
   - Public
   - Private
3. Upload assets once per evaluation set.
4. Create/manage four phases that reference those evaluation sets.

Contestant UI:

1. Select task + open phase.
2. If phase is non-final: upload `predictions.csv`.
3. If phase is final: upload `submission.zip`.
4. Poll `GET /submissions/:id`.
5. Poll `GET /phases/:id/leaderboard`.

## Out of scope

Do not implement these in this phase:

- `evaluation_jobs` table.
- Submit once and fan out to multiple phases.
- WebSocket updates.
- Retry/DLQ/sweeper.
- Full sandbox hardening.
- Per-asset semantic schema beyond basic `asset_key`.

## Risks

- Existing demo/smoke scripts must be updated from phase asset endpoints to evaluation set asset endpoints.
- Tests that construct `db.Phase` must include `EvaluationSetID` after sqlc regeneration.
- Worker failure messages should stay clear: missing `judge.py`, missing `ground_truth.csv`, missing `predictions.csv`, missing final zip.
- If the product insists on API names `final_public_test` and `final_private_test`, enum rename needs a separate compatibility decision.

## Acceptance criteria

- Each task can have exactly two evaluation sets: public/private.
- Four phases for a task can reference those two sets:
  - public_test -> public
  - final_public -> public
  - private_test -> private
  - final_private -> private
- Organizer uploads public assets once and both public phases use them.
- Organizer uploads private assets once and both private phases use them.
- Public prediction submission still works.
- Final public zip submission uses public assets and works.
- Private prediction submission uses private assets and works.
- Final private zip submission uses private assets and works.
- Leaderboards remain phase-specific.
- Existing backend tests pass.
- Docker compose E2E sanity passes.
