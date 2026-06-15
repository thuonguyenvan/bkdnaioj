-- Announcements

-- name: CreateAnnouncement :one
INSERT INTO announcements (contest_id, task_id, title, content, is_pinned, is_public, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListAnnouncementsByContest :many
SELECT * FROM announcements WHERE contest_id = $1 ORDER BY is_pinned DESC, created_at DESC;

-- name: ListSystemAnnouncements :many
SELECT * FROM announcements WHERE contest_id IS NULL ORDER BY is_pinned DESC, created_at DESC;

-- name: UpdateAnnouncement :one
UPDATE announcements SET
  title = COALESCE(sqlc.narg('title'), title),
  content = COALESCE(sqlc.narg('content'), content),
  is_pinned = COALESCE(sqlc.narg('is_pinned'), is_pinned),
  is_public = COALESCE(sqlc.narg('is_public'), is_public),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteAnnouncement :exec
DELETE FROM announcements WHERE id = $1;

-- Clarifications

-- name: CreateClarification :one
INSERT INTO clarifications (contest_id, task_id, phase_id, contest_entry_id, question, asked_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListClarificationsByContest :many
SELECT * FROM clarifications
WHERE contest_id = $1
  AND (sqlc.narg('status')::clarification_status IS NULL OR status = sqlc.narg('status'))
  AND (
    sqlc.arg('include_all')::boolean
    OR asked_by = sqlc.arg('viewer_id')::uuid
    OR is_public = true
  )
ORDER BY created_at DESC;

-- name: GetClarificationByID :one
SELECT * FROM clarifications WHERE id = $1;

-- name: AnswerClarification :one
UPDATE clarifications SET
  answer = $2,
  is_public = $3,
  status = 'answered',
  answered_by = $4,
  answered_at = now(),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateClarificationStatus :one
UPDATE clarifications SET
  is_public = COALESCE(sqlc.narg('is_public'), is_public),
  status = COALESCE(sqlc.narg('status')::clarification_status, status),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- Tickets

-- name: CreateTicket :one
INSERT INTO tickets (submission_id, contest_entry_id, category, subject, description, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListTicketsByUser :many
SELECT * FROM tickets WHERE created_by = $1 ORDER BY created_at DESC;

-- name: ListTicketsAll :many
SELECT * FROM tickets
WHERE (sqlc.narg('status')::ticket_status IS NULL OR status = sqlc.narg('status'))
ORDER BY priority DESC, created_at DESC
LIMIT $1 OFFSET $2;

-- name: UpdateTicket :one
UPDATE tickets SET
  status = COALESCE(sqlc.narg('status')::ticket_status, status),
  priority = COALESCE(sqlc.narg('priority')::ticket_priority, priority),
  assigned_to = COALESCE(sqlc.narg('assigned_to'), assigned_to),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ResolveTicket :one
UPDATE tickets SET status = 'resolved', resolved_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;
