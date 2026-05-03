-- name: CreatePhaseDef :one
INSERT INTO contest_phase_defs (contest_id, key, title, sort_order)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListPhaseDefsByContest :many
SELECT * FROM contest_phase_defs
WHERE contest_id = $1
ORDER BY sort_order;

-- name: UpdatePhaseDef :one
UPDATE contest_phase_defs SET
  title = COALESCE(sqlc.narg('title'), title),
  sort_order = COALESCE(sqlc.narg('sort_order'), sort_order)
WHERE id = $1
RETURNING *;

-- name: DeletePhaseDef :exec
DELETE FROM contest_phase_defs WHERE id = $1;
