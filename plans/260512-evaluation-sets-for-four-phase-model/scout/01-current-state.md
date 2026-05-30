# Scout Report: Current Phase/Artifact State

## Current model

- `contest_phase_key` enum currently has four values: `public_test`, `private_test`, `final_public`, `final_private` in `backend/migrations/20260415000002_contests_tasks_phases.sql`.
- `phases` belongs to one `task_id` and one `contest_phase_def_id`; `UNIQUE (task_id, contest_phase_def_id)` means each task can have one concrete phase per contest-wide phase key.
- `phases.is_final` currently drives worker mode:
  - `false`: expect contestant `predictions.csv`.
  - `true`: expect contestant final zip and run inference.
- New artifact implementation currently stores organizer assets in `phase_assets` by `phase_id`.
- API asset endpoints are currently phase-scoped:
  - `POST /api/v1/phases/:id/assets:initiate`
  - `POST /api/v1/phases/:id/assets/complete`
- Worker currently loads phase assets with `list_phase_assets(conn, sub.phase_id)`.

## Mismatch with clarified domain model

User clarified each task has four phases but only two evaluation datasets:

- Public evaluation set is shared by:
  - `public_test`
  - `final_public_test` / current DB `final_public`
- Private evaluation set is shared by:
  - `private_test`
  - `final_private_test` / current DB `final_private`

The current `phase_assets` model forces duplicate uploads/metadata for public vs final-public and private vs final-private.

## Constraint to preserve

Lean V1 still should keep:

- No `evaluation_jobs` table.
- One submission belongs to one phase.
- One judge job processes one submission.
- Worker derives context from DB using `submission_id`.
- UI polling is enough.
