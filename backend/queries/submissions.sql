-- name: CreateSubmission :one
-- Creates submission row before file upload completes.
INSERT INTO submissions (
  contest_id, contest_entry_id, task_id, phase_id, submitted_by,
  status, file_count, total_size_bytes, manifest_hash, client_ip, user_agent
) VALUES ($1, $2, $3, $4, $5, 'uploaded', $6, $7, $8, $9, $10)
RETURNING *;

-- name: MarkSubmissionQueued :one
UPDATE submissions
SET status='queued', file_count=$2, total_size_bytes=$3, updated_at=now(), error_message=NULL
WHERE id=$1
RETURNING *;

-- name: GetSubmissionByID :one
SELECT * FROM submissions WHERE id = $1;

-- name: ListSubmissionsByEntry :many
SELECT * FROM submissions
WHERE contest_entry_id = $1
  AND (sqlc.narg('task_id')::uuid IS NULL OR task_id = sqlc.narg('task_id'))
  AND (sqlc.narg('phase_id')::uuid IS NULL OR phase_id = sqlc.narg('phase_id'))
ORDER BY submitted_at DESC
LIMIT $2 OFFSET $3;

-- name: MarkSubmissionFinal :one
UPDATE submissions SET is_final = true, updated_at = now() WHERE id = $1 RETURNING *;
