-- name: CreateTeam :one
INSERT INTO teams (slug, name, owner_id) VALUES ($1, $2, $3) RETURNING *;

-- name: GetTeamByID :one
SELECT * FROM teams WHERE id = $1;

-- name: GetTeamBySlug :one
SELECT * FROM teams WHERE slug = $1;

-- name: UpdateTeam :one
UPDATE teams SET name = $2, updated_at = now() WHERE id = $1 AND owner_id = $3 RETURNING *;

-- name: DeleteTeam :exec
DELETE FROM teams WHERE id = $1 AND owner_id = $2;

-- name: ListTeamsByUser :many
SELECT t.*
FROM teams t
JOIN team_members tm ON tm.team_id = t.id
WHERE tm.user_id = $1 AND tm.status = 'accepted'
ORDER BY t.created_at DESC;

-- name: ListPendingInvitations :many
SELECT t.*, tm.role
FROM teams t
JOIN team_members tm ON tm.team_id = t.id
WHERE tm.user_id = $1 AND tm.status = 'pending'
ORDER BY tm.joined_at DESC;

-- name: AddTeamMember :exec
INSERT INTO team_members (team_id, user_id, role, status) VALUES ($1, $2, $3, 'accepted')
ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'accepted';

-- name: InviteTeamMember :exec
INSERT INTO team_members (team_id, user_id, role, status) VALUES ($1, $2, $3, 'pending')
ON CONFLICT (team_id, user_id) DO NOTHING;

-- name: AcceptTeamInvitation :exec
UPDATE team_members SET status = 'accepted' WHERE team_id = $1 AND user_id = $2 AND status = 'pending';

-- name: DeclineTeamInvitation :exec
DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'pending';

-- name: RemoveTeamMember :exec
DELETE FROM team_members WHERE team_id = $1 AND user_id = $2;

-- name: ListTeamMembers :many
SELECT tm.team_id, tm.user_id, tm.role, tm.status, tm.joined_at,
       u.email, u.full_name, u.username
FROM team_members tm
JOIN users u ON u.id = tm.user_id
WHERE tm.team_id = $1
ORDER BY tm.joined_at;
