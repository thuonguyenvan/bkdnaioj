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

-- name: MarkSubmissionRequeued :one
UPDATE submissions
SET status='queued', updated_at=now(), error_message=NULL
WHERE id=$1
RETURNING *;

-- name: RequeueOrphanRunningSubmissions :many
WITH orphan AS (
  SELECT s.id
  FROM submissions s
  WHERE s.status = 'running'
    AND s.updated_at < $1
    AND NOT EXISTS (
      SELECT 1
      FROM volunteer_worker_claims c
      WHERE c.submission_id = s.id
    )
  ORDER BY s.updated_at ASC
  LIMIT $2
)
UPDATE submissions s
SET status='queued', updated_at=now(), error_message=NULL
FROM orphan
WHERE s.id = orphan.id
RETURNING s.*;

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

-- name: ResetOtherFinalSubmissions :exec
UPDATE submissions
SET is_final = false, updated_at = now()
WHERE contest_entry_id = $1 AND task_id = $2 AND phase_id = $3 AND id != $4;

-- name: MarkSubmissionRunning :one
UPDATE submissions
SET status = 'running', updated_at = now()
WHERE id = $1
RETURNING *;

-- name: MarkSubmissionDone :one
UPDATE submissions
SET status        = 'done',
    raw_score     = $2,
    display_score = $3,
    score_payload = $4::varchar::jsonb,
    evaluated_at  = now(),
    updated_at    = now(),
    error_message = NULL
WHERE id = $1
RETURNING *;

-- name: MarkSubmissionFailed :one
UPDATE submissions
SET status        = 'failed',
    error_message = $2,
    updated_at    = now()
WHERE id = $1
RETURNING *;

-- name: GetSubmissionForWorker :one
SELECT s.id, s.contest_id, s.contest_entry_id, s.task_id, s.phase_id,
       p.judge_key, p.contest_phase_def_id, p.evaluation_set_id, p.is_final,
       cpd.key AS phase_key,
       t.submission_schema::text AS submission_schema,
       ce.entry_mode,
       s.submitted_at,
       s.total_size_bytes
FROM submissions s
JOIN phases         p  ON p.id  = s.phase_id
JOIN contest_phase_defs cpd ON cpd.id = p.contest_phase_def_id
JOIN tasks          t  ON t.id  = s.task_id
JOIN contest_entries ce ON ce.id = s.contest_entry_id
WHERE s.id = $1;
