-- +goose Up
-- Materialized global rankings for the public Ranking page.

CREATE TABLE global_phase_rankings (
  phase_key    contest_phase_key NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank         INTEGER,
  display_name TEXT NOT NULL,
  user_email   TEXT NOT NULL,
  total_score  NUMERIC(20,5) NOT NULL,
  task_count   INTEGER NOT NULL DEFAULT 0,
  details      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (phase_key, user_id)
);
CREATE INDEX idx_gpr_phase_rank ON global_phase_rankings(phase_key, rank);

WITH scored_submissions AS (
  SELECT
    cpd.key AS phase_key,
    u.id AS user_id,
    split_part(u.email::text, '@', 1) AS display_name,
    u.email::text AS user_email,
    ct.title AS contest_title,
    t.title AS task_title,
    COALESCE(s.raw_score, s.display_score)::numeric AS raw_score
  FROM submissions s
  JOIN phases p ON p.id = s.phase_id
  JOIN contest_phase_defs cpd ON cpd.id = p.contest_phase_def_id
  JOIN tasks t ON t.id = s.task_id
  JOIN contests ct ON ct.id = s.contest_id
  JOIN contest_entries ce ON ce.id = s.contest_entry_id
  JOIN contest_entry_members cem ON cem.contest_entry_id = ce.id
  JOIN users u ON u.id = cem.user_id
  WHERE ct.visibility = 'public'
    AND ct.status <> 'draft'
    AND ce.status <> 'disqualified'
    AND s.status = 'done'
    AND COALESCE(s.raw_score, s.display_score) IS NOT NULL
),
best_per_task AS (
  SELECT
    phase_key,
    user_id,
    display_name,
    user_email,
    contest_title,
    task_title,
    MAX(raw_score) AS score
  FROM scored_submissions
  GROUP BY phase_key, user_id, display_name, user_email, contest_title, task_title
),
agg AS (
  SELECT
    phase_key,
    user_id,
    display_name,
    user_email,
    SUM(score) AS total_score,
    COUNT(*)::int AS task_count,
    jsonb_agg(
      jsonb_build_object(
        'contest_title', contest_title,
        'task_title', task_title,
        'score', score
      )
      ORDER BY contest_title, task_title
    ) AS details
  FROM best_per_task
  GROUP BY phase_key, user_id, display_name, user_email
),
ranked AS (
  SELECT
    phase_key,
    user_id,
    dense_rank() OVER (PARTITION BY phase_key ORDER BY total_score DESC NULLS LAST)::int AS rank,
    display_name,
    user_email,
    total_score,
    task_count,
    details
  FROM agg
)
INSERT INTO global_phase_rankings (
  phase_key, user_id, rank, display_name, user_email, total_score, task_count, details
)
SELECT phase_key, user_id, rank, display_name, user_email, total_score, task_count, details
FROM ranked;

-- +goose Down
DROP TABLE IF EXISTS global_phase_rankings;
