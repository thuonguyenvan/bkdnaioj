-- name: CreatePhase :one
INSERT INTO phases (
  task_id, contest_phase_def_id, evaluation_set_id, slug, title, description,
  open_time, close_time, judge_key, submission_limit,
  leaderboard_mode, allow_official_submit, allow_virtual_submit,
  allow_practice_submit, display_scores, is_frozen, is_final, sort_order
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
RETURNING *;

-- name: GetPhaseByID :one
SELECT * FROM phases WHERE id = $1;

-- name: ListPhasesByTask :many
SELECT * FROM phases WHERE task_id = $1 ORDER BY sort_order;

-- name: UpdatePhase :one
UPDATE phases SET
  title = COALESCE(sqlc.narg('title'), title),
  description = COALESCE(sqlc.narg('description'), description),
  open_time = COALESCE(sqlc.narg('open_time'), open_time),
  close_time = COALESCE(sqlc.narg('close_time'), close_time),
  judge_key = COALESCE(sqlc.narg('judge_key'), judge_key),
  submission_limit = COALESCE(sqlc.narg('submission_limit'), submission_limit),
  display_scores = COALESCE(sqlc.narg('display_scores'), display_scores),
  is_frozen = COALESCE(sqlc.narg('is_frozen'), is_frozen),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeletePhase :exec
DELETE FROM phases WHERE id = $1;

-- name: SetPhaseFrozen :one
UPDATE phases SET is_frozen = $2, updated_at = now() WHERE id = $1 RETURNING *;
