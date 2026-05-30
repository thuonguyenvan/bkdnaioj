# Phase 03: Verification

## Automated checks

Run:

```bash
go -C backend test ./...
python -m py_compile backend/workers/app/*.py
```

Run clean Docker sanity:

```bash
cd backend
docker compose down -v --remove-orphans
docker compose up -d --build
make migrate-up
docker compose exec -T db psql -U olpai -d olpai -f - < scripts/seed_lean_v1.sql
```

Seed script must be updated for evaluation sets.

## E2E success matrix

For one task, prepare:

- public evaluation set assets:
  - `judge.py`
  - `ground_truth.csv`
  - `public_inputs.csv`
- private evaluation set assets:
  - `judge.py`
  - `ground_truth.csv`
  - `private_inputs.csv`

Submit:

| Phase | File | Expected |
|---|---|---|
| public_test | `predictions.csv` | done + score |
| final_public | `submission.zip` | done + score |
| private_test | `predictions.csv` | done + score |
| final_private | `submission.zip` | done + score |

Check leaderboards are phase-specific:

```text
GET /api/v1/phases/{public_phase_id}/leaderboard
GET /api/v1/phases/{final_public_phase_id}/leaderboard
GET /api/v1/phases/{private_phase_id}/leaderboard
GET /api/v1/phases/{final_private_phase_id}/leaderboard
```

## Failure checks

- Complete evaluation set asset with wrong object key prefix -> HTTP 400.
- Complete submission with wrong object key prefix -> HTTP 400.
- Missing `judge.py` in evaluation set -> worker `failed` with clear error.
- Missing `ground_truth.csv` in evaluation set -> worker `failed` with clear error.
- Non-final phase missing `predictions.csv` -> worker `failed`.
- Final phase missing zip -> worker `failed`.

## Regression checks

- Existing submission initiate/complete API still works.
- Existing leaderboard bridge still updates both leaderboard tables.
- Worker still scales via Redis consumer group; no new queue type added.
