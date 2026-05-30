# Research Note: Four-Phase / Two-Evaluation-Set Model

## Correct domain model

A contest has many tasks. Each task has four concrete judging phases:

| Phase | Evaluation set | Contestant upload | Worker mode |
|---|---|---|---|
| `public_test` | public | `predictions.csv` | judge submitted predictions |
| `final_public` / `final_public_test` | public | `submission.zip` with `infer.py` + model | run inference, then judge |
| `private_test` | private | `predictions.csv` | judge submitted predictions |
| `final_private` / `final_private_test` | private | `submission.zip` with `infer.py` + model | run inference, then judge |

The two public phases share the same organizer assets. The two private phases share the same organizer assets.

## Backend implication

Organizer assets are not phase-owned. They are evaluation-set-owned.

A task should have two evaluation sets:

- `public`
- `private`

Each phase points at one evaluation set:

- `public_test` -> public set
- `final_public` -> public set
- `private_test` -> private set
- `final_private` -> private set

Worker still receives a submission, loads the phase, follows `phase.evaluation_set_id`, downloads assets for that set, and chooses execution mode from `phase.is_final`.

## Recommended naming

Keep existing DB enum values `final_public` and `final_private` for now unless the product contract strictly requires `_test` suffix. Renaming enum values is churn and does not change behavior. UI can display `final_public_test` as a label if desired.
