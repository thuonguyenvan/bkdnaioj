-- name: InsertExperimentEvent :exec
INSERT INTO experiment_events (
    event_type,
    submission_id,
    worker_id,
    attempt_id,
    phase_key,
    is_final,
    strategy,
    payload
) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    COALESCE($8::varchar::jsonb, '{}'::jsonb)
);

-- name: InsertSchedulerDecisionLog :exec
INSERT INTO scheduler_decision_logs (
    worker_id,
    selected_submission_id,
    strategy,
    candidates_considered,
    compatible_candidates,
    rejected_candidates,
    selected_predicted_runtime_seconds,
    selected_corrected_runtime_seconds,
    selected_cost,
    reject_summary,
    reason
) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    COALESCE($9::varchar::jsonb, '{}'::jsonb),
    COALESCE($10::varchar::jsonb, '{}'::jsonb),
    $11
);

-- name: ListExperimentEventsBySubmission :many
SELECT *
FROM experiment_events
WHERE submission_id = $1
ORDER BY created_at ASC;

-- name: ListExperimentEventsWindow :many
SELECT *
FROM experiment_events
WHERE created_at >= $1
  AND created_at <= $2
ORDER BY created_at ASC;

-- name: ListSchedulerDecisionLogsWindow :many
SELECT *
FROM scheduler_decision_logs
WHERE created_at >= $1
  AND created_at <= $2
ORDER BY created_at ASC;
