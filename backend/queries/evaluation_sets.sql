-- name: CreateEvaluationSet :one
INSERT INTO task_evaluation_sets (task_id, key, title, description)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetEvaluationSetByID :one
SELECT * FROM task_evaluation_sets WHERE id = $1;

-- name: GetEvaluationSetByTaskAndKey :one
SELECT * FROM task_evaluation_sets WHERE task_id = $1 AND key = $2;

-- name: ListEvaluationSetsByTask :many
SELECT * FROM task_evaluation_sets WHERE task_id = $1 ORDER BY key;
