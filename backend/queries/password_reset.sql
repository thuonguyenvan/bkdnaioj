-- name: CreatePasswordResetToken :one
INSERT INTO password_reset_tokens (user_id, token, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetValidPasswordResetToken :one
SELECT prt.*, u.id AS uid, u.email
FROM password_reset_tokens prt
JOIN users u ON u.id = prt.user_id
WHERE prt.token = $1
  AND prt.used_at IS NULL
  AND prt.expires_at > now()
LIMIT 1;

-- name: MarkPasswordResetTokenUsed :exec
UPDATE password_reset_tokens
SET used_at = now()
WHERE token = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1 LIMIT 1;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1;

-- name: UpdateUserUsername :one
UPDATE users SET username = $2, updated_at = now() WHERE id = $1 RETURNING *;
