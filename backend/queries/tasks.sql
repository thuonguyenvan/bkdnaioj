-- name: CreateTask :one
INSERT INTO tasks (
  contest_id, slug, title, description, problem_statement_url,
  submission_schema, score_label, higher_is_better, sort_order
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetTaskByID :one
SELECT * FROM tasks WHERE id = $1;

-- name: ListTasksByContest :many
SELECT * FROM tasks WHERE contest_id = $1 ORDER BY sort_order;

-- name: UpdateTask :one
UPDATE tasks SET
  title = COALESCE(sqlc.narg('title'), title),
  description = COALESCE(sqlc.narg('description'), description),
  problem_statement_url = COALESCE(sqlc.narg('problem_statement_url'), problem_statement_url),
  submission_schema = COALESCE(sqlc.narg('submission_schema'), submission_schema),
  score_label = COALESCE(sqlc.narg('score_label'), score_label),
  higher_is_better = COALESCE(sqlc.narg('higher_is_better'), higher_is_better),
  sort_order = COALESCE(sqlc.narg('sort_order'), sort_order),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteTask :exec
DELETE FROM tasks WHERE id = $1;
