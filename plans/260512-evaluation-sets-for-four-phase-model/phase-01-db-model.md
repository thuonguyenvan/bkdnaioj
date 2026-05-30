# Phase 01: DB Model and sqlc

## Objective

Introduce `task_evaluation_sets` and `evaluation_set_assets`, then connect `phases` to an evaluation set.

## Steps

1. Add migration.

Recommended new migration:

```text
backend/migrations/20260512xxxxxx_evaluation_sets.sql
```

2. Create enum:

```sql
CREATE TYPE evaluation_set_key AS ENUM ('public', 'private');
```

3. Create `task_evaluation_sets`.

4. Create `evaluation_set_assets`.

5. Add `phases.evaluation_set_id`.

6. Backfill:

```sql
-- create missing public/private evaluation sets per task
INSERT INTO task_evaluation_sets (task_id, key, title)
SELECT id, 'public', 'Public Evaluation Set' FROM tasks
ON CONFLICT (task_id, key) DO NOTHING;

INSERT INTO task_evaluation_sets (task_id, key, title)
SELECT id, 'private', 'Private Evaluation Set' FROM tasks
ON CONFLICT (task_id, key) DO NOTHING;
```

7. Map phases:

```sql
UPDATE phases p
SET evaluation_set_id = tes.id
FROM contest_phase_defs cpd, task_evaluation_sets tes
WHERE p.contest_phase_def_id = cpd.id
  AND tes.task_id = p.task_id
  AND tes.key = CASE
    WHEN cpd.key IN ('public_test', 'final_public') THEN 'public'::evaluation_set_key
    WHEN cpd.key IN ('private_test', 'final_private') THEN 'private'::evaluation_set_key
  END;
```

8. Migrate existing `phase_assets` data if present:

```sql
INSERT INTO evaluation_set_assets (
  evaluation_set_id, asset_key, original_filename, storage_path, file_size, content_type, hash_sha256
)
SELECT DISTINCT ON (p.evaluation_set_id, pa.asset_key)
  p.evaluation_set_id, pa.asset_key, pa.original_filename, pa.storage_path,
  pa.file_size, pa.content_type, pa.hash_sha256
FROM phase_assets pa
JOIN phases p ON p.id = pa.phase_id
WHERE p.evaluation_set_id IS NOT NULL
ORDER BY p.evaluation_set_id, pa.asset_key, pa.updated_at DESC;
```

9. Enforce not null:

```sql
ALTER TABLE phases ALTER COLUMN evaluation_set_id SET NOT NULL;
```

10. Drop `phase_assets` after migration/backfill.

11. Add sqlc query files:

```text
backend/queries/evaluation_sets.sql
backend/queries/evaluation_set_assets.sql
```

Queries needed:

- `CreateEvaluationSet`
- `GetEvaluationSetByID`
- `GetEvaluationSetByTaskAndKey`
- `ListEvaluationSetsByTask`
- `UpsertEvaluationSetAsset`
- `ListEvaluationSetAssets`

12. Update `CreatePhase` query params to include `evaluation_set_id`.

13. Run:

```bash
go -C backend run github.com/sqlc-dev/sqlc/cmd/sqlc generate
```

or existing repo command if configured.

## Acceptance

- Generated DB models include `TaskEvaluationSet` and `EvaluationSetAsset`.
- `Phase` includes `EvaluationSetID`.
- `phase_assets` no longer used by generated queries.
