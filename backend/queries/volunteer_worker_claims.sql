-- name: CreateWorkerClaim :one
INSERT INTO volunteer_worker_claims (worker_id, submission_id)
VALUES ($1, $2)
RETURNING *;

-- name: DeleteWorkerClaim :exec
DELETE FROM volunteer_worker_claims
WHERE worker_id = $1 AND submission_id = $2;

-- name: CountWorkerActiveClaims :one
SELECT COUNT(*) FROM volunteer_worker_claims WHERE worker_id = $1;

-- name: GetWorkerClaimBySubmission :one
SELECT * FROM volunteer_worker_claims WHERE submission_id = $1;

-- name: ListStaleWorkerClaims2 :many
SELECT c.*, w.id AS wid
FROM volunteer_worker_claims c
JOIN volunteer_workers w ON w.id = c.worker_id
WHERE c.claimed_at < $1;
