-- name: CreateVolunteerWorker :one
INSERT INTO volunteer_workers (user_id, display_name, capabilities, max_workers)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetVolunteerWorkerByID :one
SELECT * FROM volunteer_workers WHERE id = $1;

-- name: GetVolunteerWorkerByToken :one
SELECT * FROM volunteer_workers
WHERE api_token = $1 AND status = 'active'
LIMIT 1;

-- name: ListVolunteerWorkers :many
SELECT * FROM volunteer_workers
ORDER BY created_at DESC;

-- name: ApproveVolunteerWorker :one
UPDATE volunteer_workers
SET status      = 'active',
    api_token   = $2,
    approved_at = now(),
    updated_at  = now()
WHERE id = $1
RETURNING *;

-- name: RejectVolunteerWorker :one
UPDATE volunteer_workers
SET status     = 'rejected',
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeactivateVolunteerWorker :one
UPDATE volunteer_workers
SET status     = 'inactive',
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateWorkerHeartbeat :one
UPDATE volunteer_workers
SET last_seen_at = now(),
    cpu_usage    = $2,
    ram_usage    = $3,
    updated_at   = now()
WHERE api_token = $1
RETURNING *;

-- name: IncrementWorkerCompleted :one
UPDATE volunteer_workers
SET jobs_completed = jobs_completed + 1,
    last_seen_at   = now(),
    updated_at     = now()
WHERE api_token = $1
RETURNING *;

-- name: IncrementWorkerFailed :one
UPDATE volunteer_workers
SET jobs_failed = jobs_failed + 1,
    last_seen_at = now(),
    updated_at   = now()
WHERE api_token = $1
RETURNING *;

-- name: IncrementWorkerFailedByID :one
UPDATE volunteer_workers
SET jobs_failed = jobs_failed + 1,
    updated_at  = now()
WHERE id = $1
RETURNING *;

-- name: DeleteVolunteerWorker :exec
DELETE FROM volunteer_workers WHERE id = $1;
