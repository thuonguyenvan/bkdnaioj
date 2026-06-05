-- name: CountUsers :one
SELECT count(*) FROM users;

-- name: CountContests :one
SELECT count(*) FROM contests;

-- name: CountSubmissions :one
SELECT count(*) FROM submissions;

-- name: CountActiveEntries :one
SELECT count(*) FROM contest_entries WHERE status IN ('approved','active');

-- name: ListUsersAdmin :many
SELECT id, email, full_name, username, role, created_at FROM users
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: UpdateUserRole :one
UPDATE users SET role = $2, updated_at = now() WHERE id = $1
RETURNING id, email, full_name, role, created_at, updated_at;
