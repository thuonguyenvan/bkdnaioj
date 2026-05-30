-- name: CreateSubmissionFile :one
INSERT INTO submission_files (
  submission_id, original_filename, storage_path, file_size, content_type, hash_sha256
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListSubmissionFilesBySubmission :many
SELECT * FROM submission_files WHERE submission_id = $1 ORDER BY created_at;

-- name: DeleteSubmissionFilesBySubmission :exec
DELETE FROM submission_files WHERE submission_id = $1;
