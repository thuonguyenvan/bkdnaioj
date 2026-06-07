-- Task-phase leaderboard

-- name: GetTaskPhaseLeaderboard :many
SELECT lb.*, ce.display_name, ce.entry_type, ce.entry_mode,
       s.submitted_at AS last_submitted_at,
       COALESCE(
         (SELECT array_agg(COALESCE(u.username, split_part(u.email::text, '@', 1))::text)
          FROM contest_entry_members cem
          JOIN users u ON u.id = cem.user_id
          WHERE cem.contest_entry_id = ce.id),
         ARRAY[]::text[]
       ) AS usernames,
       COALESCE(
         (SELECT array_agg(u.full_name::text)
          FROM contest_entry_members cem
          JOIN users u ON u.id = cem.user_id
          WHERE cem.contest_entry_id = ce.id),
         ARRAY[]::text[]
       ) AS full_names
FROM task_phase_leaderboard_entries lb
JOIN contest_entries ce ON ce.id = lb.contest_entry_id
LEFT JOIN submissions s ON s.id = lb.chosen_submission_id
WHERE lb.phase_id = $1
  AND (sqlc.narg('entry_mode')::entry_mode IS NULL OR ce.entry_mode = sqlc.narg('entry_mode'))
ORDER BY lb.rank ASC NULLS LAST, lb.entries_count ASC
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
SELECT lb.*, ce.display_name, ce.entry_type, ce.entry_mode,
       (SELECT MAX(s2.submitted_at)
        FROM submissions s2
        JOIN phases p2 ON p2.id = s2.phase_id
        WHERE p2.contest_phase_def_id = lb.contest_phase_def_id
          AND s2.contest_entry_id = lb.contest_entry_id
          AND s2.status = 'done'
       ) AS last_submitted_at,
       COALESCE(
         (SELECT array_agg(COALESCE(u.username, split_part(u.email::text, '@', 1))::text)
          FROM contest_entry_members cem
          JOIN users u ON u.id = cem.user_id
          WHERE cem.contest_entry_id = ce.id),
         ARRAY[]::text[]
       ) AS usernames,
       COALESCE(
         (SELECT array_agg(u.full_name::text)
          FROM contest_entry_members cem
          JOIN users u ON u.id = cem.user_id
          WHERE cem.contest_entry_id = ce.id),
         ARRAY[]::text[]
       ) AS full_names
FROM contest_phase_leaderboard_entries lb
JOIN contest_entries ce ON ce.id = lb.contest_entry_id
WHERE lb.contest_phase_def_id = $1
  AND (sqlc.narg('entry_mode')::entry_mode IS NULL OR ce.entry_mode = sqlc.narg('entry_mode'))
ORDER BY lb.rank ASC NULLS LAST, lb.entries_count ASC
LIMIT $2 OFFSET $3;

-- name: GetGlobalPhaseRanking :many
SELECT
  COALESCE(gpr.rank, 0)::int AS rank,
  gpr.display_name,
  gpr.user_email,
  gpr.total_score::text AS total_score,
  gpr.task_count,
  gpr.details,
  u.full_name
FROM global_phase_rankings gpr
LEFT JOIN users u ON u.id = gpr.user_id
WHERE gpr.phase_key = $1
ORDER BY gpr.rank ASC, gpr.display_name ASC
LIMIT $2 OFFSET $3;

-- name: RecomputeGlobalPhaseRanking :exec
-- Uses the same score shown in task standings. Each user appears once per task
-- with their BEST standings score across all entries/modes (individual + team,
-- official/virtual/practice), preventing score accumulation for users who joined
-- multiple entries.
-- Uses UPSERT to avoid DELETE-CTE optimization bug in PostgreSQL 12+.
WITH entry_candidates AS (
  SELECT
    cpd.key          AS phase_key,
    s.contest_id,
    s.task_id,
    s.phase_id,
    s.contest_entry_id,
    s.id             AS submission_id,
    ct.title         AS contest_title,
    t.title          AS task_title,
    ct.scale_scores,
    p.leaderboard_mode,
    t.higher_is_better,
    s.display_score,
    EXTRACT(EPOCH FROM (s.submitted_at - ct.start_time)) / 60.0 AS penalty_minutes,
    row_number() OVER (
      PARTITION BY s.phase_id, s.contest_entry_id
      ORDER BY
        s.is_final DESC,
        CASE WHEN p.leaderboard_mode = 'latest' THEN s.submitted_at END DESC NULLS LAST,
        CASE WHEN p.leaderboard_mode = 'best' AND t.higher_is_better THEN s.display_score END DESC NULLS LAST,
        CASE WHEN p.leaderboard_mode = 'best' AND NOT t.higher_is_better THEN s.display_score END ASC NULLS LAST,
        s.submitted_at DESC
    ) AS rn
  FROM submissions s
  JOIN phases             p   ON p.id   = s.phase_id
  JOIN contest_phase_defs cpd ON cpd.id = p.contest_phase_def_id
  JOIN tasks              t   ON t.id   = s.task_id
  JOIN contests           ct  ON ct.id  = s.contest_id
  JOIN contest_entries    ce  ON ce.id  = s.contest_entry_id
  WHERE cpd.key::text  = sqlc.arg('phase_key')
    AND ct.visibility  = 'public'
    AND ct.status     <> 'draft'
    AND ce.status     <> 'disqualified'
    AND s.status       = 'done'
    AND s.display_score IS NOT NULL
),
entry_chosen AS (
  SELECT * FROM entry_candidates WHERE rn = 1
),
entry_scored AS (
  SELECT
    c.*,
    MAX(c.display_score) OVER (PARTITION BY c.phase_id) AS max_phase_score,
    CASE
      WHEN c.scale_scores = TRUE THEN
        CASE
          WHEN COALESCE(MAX(c.display_score) OVER (PARTITION BY c.phase_id), 0) > 0
          THEN (c.display_score / MAX(c.display_score) OVER (PARTITION BY c.phase_id)) * 100
          ELSE 0
        END
      ELSE c.display_score
    END AS score
  FROM entry_chosen c
),
scored_members AS (
  SELECT
    es.phase_key,
    u.id AS user_id,
    COALESCE(u.username, split_part(u.email::text, '@', 1)) AS display_name,
    u.email::text AS user_email,
    es.contest_id,
    es.contest_title,
    es.task_id,
    es.task_title,
    es.score,
    es.penalty_minutes
  FROM entry_scored es
  JOIN contest_entry_members cem ON cem.contest_entry_id = es.contest_entry_id
  JOIN users u ON u.id = cem.user_id
),
-- Pick best score per (user, task); if same score take earliest (lowest penalty)
best_per_task AS (
  SELECT DISTINCT ON (user_id, contest_id, task_id)
    phase_key, user_id, display_name, user_email, contest_title, task_title, score, penalty_minutes
  FROM scored_members
  ORDER BY user_id, contest_id, task_id, score DESC, penalty_minutes ASC
),
agg AS (
  SELECT
    phase_key, user_id, display_name, user_email,
    SUM(score)::numeric          AS total_score,
    SUM(penalty_minutes)::numeric AS total_penalty,
    COUNT(*)::int                AS task_count,
    jsonb_agg(
      jsonb_build_object('contest_title', contest_title, 'task_title', task_title, 'score', score)
      ORDER BY contest_title, task_title
    ) AS details
  FROM best_per_task
  GROUP BY phase_key, user_id, display_name, user_email
),
ranked AS (
  SELECT *,
    -- Tiebreaker: same score → who achieved it first (lower total_penalty wins)
    dense_rank() OVER (ORDER BY total_score DESC NULLS LAST, total_penalty ASC NULLS LAST)::int AS rank
  FROM agg
)
INSERT INTO global_phase_rankings (phase_key, user_id, rank, display_name, user_email, total_score, task_count, details)
SELECT phase_key, user_id, rank, display_name, user_email, total_score, task_count, details
FROM ranked
ON CONFLICT (phase_key, user_id) DO UPDATE SET
  rank         = EXCLUDED.rank,
  display_name = EXCLUDED.display_name,
  total_score  = EXCLUDED.total_score,
  task_count   = EXCLUDED.task_count,
  details      = EXCLUDED.details;

-- name: DeleteStaleGlobalRankings :exec
-- Remove users from global ranking who no longer have any leaderboard entries.
DELETE FROM global_phase_rankings gpr
WHERE gpr.phase_key::text = sqlc.arg('phase_key')
  AND NOT EXISTS (
    SELECT 1 FROM submissions s
    JOIN phases p ON p.id = s.phase_id
    JOIN contest_phase_defs cpd ON cpd.id = p.contest_phase_def_id
    JOIN contests ct ON ct.id = s.contest_id
    JOIN contest_entries ce ON ce.id = s.contest_entry_id
    JOIN contest_entry_members cem ON cem.contest_entry_id = s.contest_entry_id
    WHERE cpd.key::text = sqlc.arg('phase_key')
      AND ct.visibility = 'public'
      AND ct.status <> 'draft'
      AND ce.status <> 'disqualified'
      AND s.status = 'done'
      AND COALESCE(s.raw_score, s.display_score) IS NOT NULL
      AND cem.user_id = gpr.user_id
  );

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

-- name: RecomputeTaskPhaseLeaderboard :exec
-- penalty_minutes = minutes from contest start to the FIRST submission achieving the best score (ICPC-style).
WITH candidate AS (
  SELECT
    s.contest_id,
    s.task_id,
    s.phase_id,
    s.contest_entry_id,
    s.id AS submission_id,
    s.display_score,
    s.submitted_at,
    row_number() OVER (
      PARTITION BY s.contest_entry_id
      ORDER BY
        CASE WHEN sqlc.arg('leaderboard_mode')::leaderboard_mode = 'latest' THEN s.submitted_at END DESC NULLS LAST,
        CASE WHEN sqlc.arg('leaderboard_mode')::leaderboard_mode = 'best' AND sqlc.arg('higher_is_better')::boolean THEN s.display_score END DESC NULLS LAST,
        CASE WHEN sqlc.arg('leaderboard_mode')::leaderboard_mode = 'best' AND NOT sqlc.arg('higher_is_better')::boolean THEN s.display_score END ASC NULLS LAST,
        s.display_score DESC NULLS LAST,
        s.submitted_at ASC  -- earliest submission achieving the best score
    ) AS rn,
    count(*) OVER (PARTITION BY s.contest_entry_id) AS entries_count
  FROM submissions s
  WHERE s.phase_id = sqlc.arg('phase_id')::uuid
    AND s.status = 'done'
    AND s.display_score IS NOT NULL
),
chosen AS (
  SELECT * FROM candidate WHERE rn = 1
),
chosen_with_max AS (
  SELECT c.*,
         MAX(c.display_score) OVER() as max_phase_score
  FROM chosen c
),
ranked AS (
  SELECT
    c.*,
    GREATEST(0, EXTRACT(EPOCH FROM (c.submitted_at - ct.start_time)) / 60)::numeric AS penalty_minutes,
    dense_rank() OVER (
      ORDER BY
        CASE WHEN sqlc.arg('leaderboard_mode')::leaderboard_mode = 'best' AND sqlc.arg('higher_is_better')::boolean THEN c.display_score END DESC NULLS LAST,
        CASE WHEN sqlc.arg('leaderboard_mode')::leaderboard_mode = 'best' AND NOT sqlc.arg('higher_is_better')::boolean THEN c.display_score END ASC NULLS LAST,
        c.display_score DESC NULLS LAST,
        GREATEST(0, EXTRACT(EPOCH FROM (c.submitted_at - ct.start_time)) / 60) ASC NULLS LAST,
        c.entries_count ASC
    )::int AS rank
  FROM chosen_with_max c
  JOIN contests ct ON ct.id = c.contest_id
)
INSERT INTO task_phase_leaderboard_entries (
  contest_id, task_id, phase_id, contest_entry_id,
  rank, score, raw_score, score_breakdown, chosen_submission_id, entries_count,
  penalty_minutes, is_frozen, is_disqualified
)
SELECT
  r.contest_id,
  r.task_id,
  r.phase_id,
  r.contest_entry_id,
  r.rank,
  CASE
    WHEN ct.scale_scores = TRUE THEN
      CASE
        WHEN COALESCE(r.max_phase_score, 0) > 0 THEN (r.display_score / r.max_phase_score) * 100
        ELSE 0
      END
    ELSE r.display_score
  END AS score,
  r.display_score AS raw_score,
  NULL::jsonb,
  r.submission_id,
  r.entries_count,
  r.penalty_minutes,
  p.is_frozen,
  (ce.status = 'disqualified')
FROM ranked r
JOIN phases p ON p.id = r.phase_id
JOIN contest_entries ce ON ce.id = r.contest_entry_id
JOIN contests ct ON ct.id = r.contest_id
ON CONFLICT (phase_id, contest_entry_id) DO UPDATE SET
  rank = EXCLUDED.rank,
  score = EXCLUDED.score,
  raw_score = EXCLUDED.raw_score,
  score_breakdown = EXCLUDED.score_breakdown,
  chosen_submission_id = EXCLUDED.chosen_submission_id,
  entries_count = EXCLUDED.entries_count,
  penalty_minutes = EXCLUDED.penalty_minutes,
  is_frozen = EXCLUDED.is_frozen,
  updated_at = now();

-- name: RecomputeContestPhaseLeaderboard :exec
WITH phases_in_def AS (
  SELECT p.id AS phase_id, p.task_id, p.leaderboard_mode, t.higher_is_better, t.contest_id
  FROM phases p
  JOIN tasks t ON t.id = p.task_id
  WHERE p.contest_phase_def_id = sqlc.arg('contest_phase_def_id')::uuid
    AND t.contest_id = sqlc.arg('contest_id')::uuid
),
per_phase_choice AS (
  SELECT
    s.contest_id,
    s.task_id,
    s.phase_id,
    s.contest_entry_id,
    s.id AS submission_id,
    s.display_score,
    s.submitted_at,
    row_number() OVER (
      PARTITION BY s.phase_id, s.contest_entry_id
      ORDER BY
        CASE WHEN pid.leaderboard_mode = 'latest' THEN s.submitted_at END DESC NULLS LAST,
        CASE WHEN pid.leaderboard_mode = 'best' AND pid.higher_is_better THEN s.display_score END DESC NULLS LAST,
        CASE WHEN pid.leaderboard_mode = 'best' AND NOT pid.higher_is_better THEN s.display_score END ASC NULLS LAST,
        s.display_score DESC NULLS LAST,
        s.submitted_at ASC  -- earliest achieving best score
    ) AS rn
  FROM submissions s
  JOIN phases_in_def pid ON pid.phase_id = s.phase_id
  WHERE s.status = 'done'
    AND s.display_score IS NOT NULL
),
chosen AS (
  SELECT * FROM per_phase_choice WHERE rn = 1
),
chosen_with_max AS (
  SELECT c.*,
         MAX(c.display_score) OVER(PARTITION BY c.phase_id) as max_phase_score
  FROM chosen c
),
agg AS (
  SELECT
    c.contest_id,
    sqlc.arg('contest_phase_def_id')::uuid AS contest_phase_def_id,
    c.contest_entry_id,
    SUM(
      CASE
        WHEN ct.scale_scores = TRUE THEN
          CASE
            WHEN COALESCE(c.max_phase_score, 0) > 0 THEN (c.display_score / c.max_phase_score) * 100
            ELSE 0
          END
        ELSE c.display_score
      END
    ) AS total_score,
    SUM(c.display_score) AS raw_score,
    jsonb_object_agg(
      c.task_id::text,
      CASE
        WHEN ct.scale_scores = TRUE THEN
          CASE
            WHEN COALESCE(c.max_phase_score, 0) > 0 THEN (c.display_score / c.max_phase_score) * 100
            ELSE 0
          END
        ELSE c.display_score
      END
    ) AS score_breakdown,
    -- Sum penalty minutes across tasks (ICPC-style)
    SUM(GREATEST(0, EXTRACT(EPOCH FROM (c.submitted_at - ct.start_time)) / 60))::numeric AS penalty_minutes,
    COUNT(*)::int AS entries_count
  FROM chosen_with_max c
  JOIN contests ct ON ct.id = c.contest_id
  GROUP BY c.contest_id, c.contest_entry_id, ct.scale_scores
),
ranked AS (
  SELECT
    a.*,
    dense_rank() OVER (
      ORDER BY a.total_score DESC NULLS LAST,
      a.penalty_minutes ASC NULLS LAST,
      a.entries_count ASC
    )::int AS rank
  FROM agg a
)
INSERT INTO contest_phase_leaderboard_entries (
  contest_id, contest_phase_def_id, contest_entry_id,
  rank, score, raw_score, score_breakdown, entries_count,
  penalty_minutes, is_frozen, is_disqualified
)
SELECT
  r.contest_id,
  r.contest_phase_def_id,
  r.contest_entry_id,
  r.rank,
  r.total_score,
  r.raw_score,
  r.score_breakdown,
  r.entries_count,
  r.penalty_minutes,
  false,
  (ce.status = 'disqualified')
FROM ranked r
JOIN contest_entries ce ON ce.id = r.contest_entry_id
ON CONFLICT (contest_phase_def_id, contest_entry_id) DO UPDATE SET
  rank = EXCLUDED.rank,
  score = EXCLUDED.score,
  raw_score = EXCLUDED.raw_score,
  score_breakdown = EXCLUDED.score_breakdown,
  entries_count = EXCLUDED.entries_count,
  penalty_minutes = EXCLUDED.penalty_minutes,
  is_frozen = EXCLUDED.is_frozen,
  updated_at = now();

-- ── Incremental leaderboard queries (Phase 04) ──────────────────────────────

-- name: GetPhaseMaxScore :one
-- Returns current max display_score among all entries in phase.
-- Used to decide whether incremental or full recompute is needed.
SELECT COALESCE(MAX(raw_score), 0)::float8 AS max_score
FROM task_phase_leaderboard_entries
WHERE phase_id = $1;

-- name: UpdateSingleLeaderboardEntry :exec
-- Updates rank/score for one entry (incremental O(log n) path).
-- penalty_minutes is intentionally NOT updated here — only full recompute sets it correctly.
UPDATE task_phase_leaderboard_entries
SET
    rank                 = $3,
    score                = $4,
    raw_score            = $5,
    chosen_submission_id = $6,
    entries_count        = $7,
    updated_at = now()
WHERE phase_id = $1 AND contest_entry_id = $2;

-- name: GetAllLeaderboardEntriesForPhase :many
-- Used to seed Redis ZSET on startup from existing DB state.
SELECT contest_entry_id, score
FROM task_phase_leaderboard_entries
WHERE phase_id = $1
ORDER BY rank ASC;

-- name: GetBestSubmissionForEntry :one
-- Returns the chosen submission_id and its display_score for an entry in a phase.
SELECT s.id, s.display_score
FROM submissions s
WHERE s.phase_id = $1
  AND s.contest_entry_id = $2
  AND s.status = 'done'
  AND s.display_score IS NOT NULL
ORDER BY s.is_final DESC, s.display_score DESC, s.submitted_at DESC
LIMIT 1;
