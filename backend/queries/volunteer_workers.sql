-- name: CreateVolunteerWorker :one
INSERT INTO volunteer_workers (user_id, display_name, capabilities, max_workers)
VALUES ($1, $2, $3::text::jsonb, $4)
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

-- ── Engineering optimizations (Phase 06) ────────────────────────────────────

-- name: ListWorkerActiveClaimCounts :many
-- Single aggregation to replace N+1 CountWorkerActiveClaims in AdminList.
SELECT worker_id, COUNT(*)::int AS active_claims
FROM volunteer_worker_claims
GROUP BY worker_id;

-- name: WorkerIsAtCapacity :one
-- Bounded check: stops scanning after max_workers rows found.
-- Returns true when worker already has max_workers active claims.
SELECT COUNT(*) >= $2 AS at_capacity
FROM (
    SELECT 1 FROM volunteer_worker_claims WHERE worker_id = $1 LIMIT $2
) sub;

-- name: DeleteStaleWorkerClaims :many
-- Batch delete stale claims in one query; RETURNING for re-enqueue loop.
DELETE FROM volunteer_worker_claims
USING submissions s
WHERE volunteer_worker_claims.submission_id = s.id
  AND (
    volunteer_worker_claims.lease_expires_at < now()
    OR (s.is_final = false AND volunteer_worker_claims.claimed_at < $1)
    OR (s.is_final = true  AND volunteer_worker_claims.claimed_at < $2)
  )
RETURNING volunteer_worker_claims.worker_id, volunteer_worker_claims.submission_id, volunteer_worker_claims.attempt_id;

-- ── Global Best Finish Time Scheduling ──────────────────────────────────────

-- name: GetAllActiveWorkersWithEarliestAvailable :many
-- Returns all active workers and when they will next have a free slot.
-- earliest_available_at = now() if worker has free capacity, else min(predicted_finish_at).
SELECT
    w.id,
    w.capabilities,
    w.max_workers,
    CASE
        WHEN COUNT(c.id) < w.max_workers THEN now()
        ELSE MIN(COALESCE(c.predicted_finish_at, now() + interval '20 minutes'))
    END AS earliest_available_at
FROM volunteer_workers w
LEFT JOIN volunteer_worker_claims c ON c.worker_id = w.id
WHERE w.status = 'active'
GROUP BY w.id, w.capabilities, w.max_workers;

-- name: CreateWorkerClaimWithFinish :one
-- Creates a claim with lease + predicted finish time for scheduling.
INSERT INTO volunteer_worker_claims (
    worker_id, submission_id, predicted_finish_at, lease_expires_at, last_heartbeat_at
)
VALUES ($1, $2, $3, $4, now())
RETURNING *;

-- name: RenewWorkerClaimLease :one
UPDATE volunteer_worker_claims
SET lease_expires_at = $3,
    last_heartbeat_at = now()
WHERE submission_id = $1
  AND attempt_id = $2
RETURNING *;
