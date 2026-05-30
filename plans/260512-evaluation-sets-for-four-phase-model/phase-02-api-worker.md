# Phase 02: API and Worker Changes

## Objective

Move organizer asset upload/read path from phase-scoped to evaluation-set-scoped while preserving submission and leaderboard flow.

## API changes

### Add handler

Create or extend handler for evaluation sets:

```text
backend/internal/http/handlers/evaluation_sets.go
```

Methods:

- `Create`
- `Get`
- `ListByTask`
- `InitiateAssets`
- `CompleteAssets`
- `ListAssets`

### Routes

Admin/jury routes:

```text
GET  /api/v1/tasks/:task_id/evaluation-sets
POST /api/v1/tasks/:task_id/evaluation-sets
GET  /api/v1/evaluation-sets/:id
POST /api/v1/evaluation-sets/:id/assets:initiate
POST /api/v1/evaluation-sets/:id/assets/complete
GET  /api/v1/evaluation-sets/:id/assets
```

### DTOs

Add:

- `CreateEvaluationSetRequest`
- `EvaluationSetResponse`
- `InitiateEvaluationSetAssetsRequest`
- `CompleteEvaluationSetAssetsRequest`
- `EvaluationSetAssetResponse`

Keep the asset request shape almost identical to phase assets.

### Phase handler

Update `CreatePhaseRequest` and `PhaseResponse`:

```go
EvaluationSetID uuid.UUID `json:"evaluation_set_id" validate:"required"`
```

Validate:

- evaluation set exists.
- evaluation set belongs to the same task.
- phase def key matches evaluation set key.
- `is_final` matches phase def key.

### Deprecate old endpoints

Remove or disable:

```text
POST /api/v1/phases/:id/assets:initiate
POST /api/v1/phases/:id/assets/complete
```

Recommended during active development: remove routes and tests now to avoid supporting wrong API.

## Worker changes

### DB class

Update `Submission` dataclass:

```python
@dataclass(frozen=True)
class Submission:
    id: str
    contest_id: str
    contest_entry_id: str
    task_id: str
    phase_id: str
    phase_key: str
    evaluation_set_id: str
    evaluation_set_key: str
    is_final: bool
```

Update `get_submission` query:

```sql
SELECT s.id, s.contest_id, s.contest_entry_id, s.task_id, s.phase_id,
       cpd.key AS phase_key,
       tes.id AS evaluation_set_id,
       tes.key AS evaluation_set_key,
       p.is_final
FROM submissions s
JOIN phases p ON p.id = s.phase_id
JOIN contest_phase_defs cpd ON cpd.id = p.contest_phase_def_id
JOIN task_evaluation_sets tes ON tes.id = p.evaluation_set_id
WHERE s.id = %s
```

Replace:

```python
list_phase_assets(conn, phase_id)
```

with:

```python
list_evaluation_set_assets(conn, evaluation_set_id)
```

### Worker judge

Current worker execution stays mostly the same:

```python
if sub.is_final:
    expect zip
else:
    expect predictions.csv
```

Only the asset source changes from `phase_assets` to `evaluation_set_assets`.

## Smoke script updates

Update scripts to:

1. Create/fetch public/private evaluation sets.
2. Upload public assets once.
3. Upload private assets once.
4. Create four phases pointing to the two sets.
5. Submit and verify four cases:
   - public prediction
   - final public zip
   - private prediction
   - final private zip

## Acceptance

- Organizer no longer uploads duplicate assets for final-public/final-private.
- Worker still handles public/final mode correctly.
- All previous success and failure tests still pass with evaluation-set assets.
