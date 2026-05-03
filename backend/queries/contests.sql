-- name: CreateContest :one
INSERT INTO contests (
  slug, title, description, banner_url, status, entry_policy,
  registration_start, registration_end, start_time, end_time,
  visibility, rules_json, created_by, max_team_size, require_approval
) VALUES (
  $1, $2, $3, $4, 'draft', $5,
  $6, $7, $8, $9,
  $10, $11, $12, $13, $14
)
RETURNING *;

-- name: GetContestByID :one
SELECT * FROM contests WHERE id = $1;

-- name: GetContestBySlug :one
SELECT * FROM contests WHERE slug = $1;

-- name: ListContests :many
SELECT * FROM contests
WHERE (sqlc.narg('status')::contest_status IS NULL OR status = sqlc.narg('status'))
ORDER BY start_time DESC
LIMIT $1 OFFSET $2;

-- name: UpdateContest :one
UPDATE contests SET
  title = COALESCE(sqlc.narg('title'), title),
  description = COALESCE(sqlc.narg('description'), description),
  banner_url = COALESCE(sqlc.narg('banner_url'), banner_url),
  entry_policy = COALESCE(sqlc.narg('entry_policy')::contest_entry_policy, entry_policy),
  registration_start = COALESCE(sqlc.narg('registration_start'), registration_start),
  registration_end = COALESCE(sqlc.narg('registration_end'), registration_end),
  start_time = COALESCE(sqlc.narg('start_time'), start_time),
  end_time = COALESCE(sqlc.narg('end_time'), end_time),
  visibility = COALESCE(sqlc.narg('visibility')::contest_visibility, visibility),
  rules_json = COALESCE(sqlc.narg('rules_json'), rules_json),
  max_team_size = COALESCE(sqlc.narg('max_team_size'), max_team_size),
  require_approval = COALESCE(sqlc.narg('require_approval'), require_approval),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateContestStatus :one
UPDATE contests SET status = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: DeleteContest :exec
DELETE FROM contests WHERE id = $1;
