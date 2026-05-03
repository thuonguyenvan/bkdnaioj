-- Task-phase leaderboard

-- name: GetTaskPhaseLeaderboard :many
SELECT lb.*, ce.display_name, ce.entry_type, ce.entry_mode
FROM task_phase_leaderboard_entries lb
JOIN contest_entries ce ON ce.id = lb.contest_entry_id
WHERE lb.phase_id = $1
  AND (sqlc.narg('entry_mode')::entry_mode IS NULL OR ce.entry_mode = sqlc.narg('entry_mode'))
ORDER BY lb.rank ASC NULLS LAST
LIMIT $2 OFFSET $3;

-- name: UpsertTaskPhaseLeaderboard :one
INSERT INTO task_phase_leaderboard_entries (
  contest_id, task_id, phase_id, contest_entry_id,
  rank, score, score_breakdown, chosen_submission_id, entries_count,
  is_frozen, is_disqualified
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (phase_id, contest_entry_id) DO UPDATE SET
  rank = EXCLUDED.rank, score = EXCLUDED.score,
  score_breakdown = EXCLUDED.score_breakdown,
  chosen_submission_id = EXCLUDED.chosen_submission_id,
  entries_count = EXCLUDED.entries_count,
  is_frozen = EXCLUDED.is_frozen,
  updated_at = now()
RETURNING *;

-- Contest-phase leaderboard

-- name: GetContestPhaseLeaderboard :many
SELECT lb.*, ce.display_name, ce.entry_type, ce.entry_mode
FROM contest_phase_leaderboard_entries lb
JOIN contest_entries ce ON ce.id = lb.contest_entry_id
WHERE lb.contest_phase_def_id = $1
  AND (sqlc.narg('entry_mode')::entry_mode IS NULL OR ce.entry_mode = sqlc.narg('entry_mode'))
ORDER BY lb.rank ASC NULLS LAST
LIMIT $2 OFFSET $3;

-- name: UpsertContestPhaseLeaderboard :one
INSERT INTO contest_phase_leaderboard_entries (
  contest_id, contest_phase_def_id, contest_entry_id,
  rank, score, score_breakdown, entries_count,
  is_frozen, is_disqualified
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (contest_phase_def_id, contest_entry_id) DO UPDATE SET
  rank = EXCLUDED.rank, score = EXCLUDED.score,
  score_breakdown = EXCLUDED.score_breakdown,
  entries_count = EXCLUDED.entries_count,
  is_frozen = EXCLUDED.is_frozen,
  updated_at = now()
RETURNING *;
