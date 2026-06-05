-- name: InsertJobExecutionLog :exec
INSERT INTO job_execution_logs (
    submission_id,
    worker_id,
    phase_key,
    is_final,
    predicted_runtime_seconds,
    actual_runtime_seconds
) VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListRecentJobExecutionLogs :many
SELECT
    jel.id,
    jel.submission_id,
    jel.worker_id,
    vw.display_name AS worker_name,
    jel.phase_key,
    jel.is_final,
    jel.predicted_runtime_seconds,
    jel.actual_runtime_seconds,
    jel.error_ratio,
    jel.created_at
FROM job_execution_logs jel
LEFT JOIN volunteer_workers vw ON vw.id = jel.worker_id
ORDER BY jel.created_at DESC
LIMIT $1;

-- name: GetCorrectionFactor :one
-- Returns median(error_ratio) for jobs in same group over last 7 days.
-- error_ratio = actual / predicted; ratio > 1 means T0 underestimates.
-- Falls back to 1.0 if fewer than 3 samples (not enough data).
SELECT
    CASE
        WHEN COUNT(*) >= 3
        THEN PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_ratio)
        ELSE 1.0
    END AS correction_factor,
    COUNT(*) AS sample_count
FROM job_execution_logs
WHERE phase_key = $1
  AND is_final  = $2
  AND created_at > now() - interval '7 days'
  AND error_ratio IS NOT NULL
  AND error_ratio > 0;
