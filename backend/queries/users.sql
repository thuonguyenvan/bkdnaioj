-- name: CreateUser :one
INSERT INTO users (email, password_hash, full_name, role, student_id, avatar_url, username)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: UpdateUserProfile :one
UPDATE users
SET full_name  = COALESCE($2, full_name),
    student_id = COALESCE($3, student_id),
    avatar_url = COALESCE($4, avatar_url),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: TouchUserLastVisit :exec
UPDATE users SET last_visit = now() WHERE id = $1;
