-- name: CountTasks :one
SELECT count(*) FROM tasks;

-- name: GetTaskSubmissionStats :many
SELECT
  s.task_id,
  count(*)::bigint AS total_submissions,
  count(*) FILTER (WHERE s.status = 'done')::bigint AS done_submissions,
  count(DISTINCT s.contest_entry_id) FILTER (WHERE s.status = 'done')::bigint AS solved_entries
FROM submissions s
JOIN tasks t ON t.id = s.task_id
JOIN contests c ON c.id = t.contest_id
WHERE c.visibility = 'public'
GROUP BY s.task_id;
