-- name: CreateContestEntry :one
INSERT INTO contest_entries (
  contest_id, entry_type, entry_mode, user_id, team_id,
  display_name, status, registered_by, start_at, end_at
) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
RETURNING *;

-- name: GetContestEntryByID :one
SELECT * FROM contest_entries WHERE id = $1;

-- name: ListContestEntries :many
SELECT * FROM contest_entries
WHERE contest_id = $1
  AND (sqlc.narg('entry_mode')::entry_mode IS NULL OR entry_mode = sqlc.narg('entry_mode'))
  AND (sqlc.narg('status')::entry_status IS NULL OR status = sqlc.narg('status'))
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateContestEntryStatus :one
UPDATE contest_entries SET status = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: ApproveContestEntry :one
UPDATE contest_entries SET
  status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DisqualifyContestEntry :one
UPDATE contest_entries SET status = 'disqualified', updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteContestEntry :exec
DELETE FROM contest_entries WHERE id = $1;

-- name: AddEntryMember :exec
INSERT INTO contest_entry_members (contest_entry_id, user_id, role)
VALUES ($1, $2, $3)
ON CONFLICT (contest_entry_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- name: RemoveEntryMember :exec
DELETE FROM contest_entry_members WHERE contest_entry_id = $1 AND user_id = $2;

-- name: ListEntryMembers :many
SELECT cem.*, u.email, u.full_name
FROM contest_entry_members cem
JOIN users u ON u.id = cem.user_id
WHERE cem.contest_entry_id = $1
ORDER BY cem.joined_at;
