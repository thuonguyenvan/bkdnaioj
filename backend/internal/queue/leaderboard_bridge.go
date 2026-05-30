package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/mank1/olpai-backend/db"
)

type ResultEnvelope struct {
	SubmissionID uuid.UUID `json:"submission_id"`
	Type         string    `json:"type"` // done|failed
}

type LeaderboardBridge struct {
	rdb  *redis.Client
	pool *pgxpool.Pool
	log  zerolog.Logger

	getSubmissionFn      func(ctx context.Context, submissionID uuid.UUID) (db.Submission, error)
	recomputeTaskPhaseFn func(ctx context.Context, sub db.Submission) error
	recomputeContestFn   func(ctx context.Context, sub db.Submission) error
}

func NewLeaderboardBridge(rdb *redis.Client, pool *pgxpool.Pool, log zerolog.Logger) *LeaderboardBridge {
	return &LeaderboardBridge{rdb: rdb, pool: pool, log: log}
}

// WithHandlers allows injecting logic for tests.
func (b *LeaderboardBridge) WithHandlers(
	getSubmission func(ctx context.Context, submissionID uuid.UUID) (db.Submission, error),
	recomputeTaskPhase func(ctx context.Context, sub db.Submission) error,
	recomputeContest func(ctx context.Context, sub db.Submission) error,
) *LeaderboardBridge {
	b.getSubmissionFn = getSubmission
	b.recomputeTaskPhaseFn = recomputeTaskPhase
	b.recomputeContestFn = recomputeContest
	return b
}

func (b *LeaderboardBridge) Run(ctx context.Context) error {
	if b.rdb == nil {
		return fmt.Errorf("redis not configured")
	}
	if b.getSubmissionFn == nil && b.pool == nil {
		return fmt.Errorf("db pool not configured")
	}

	group := "cg:leaderboard-bridge"
	consumer := hostname()

	// Idempotent group create.
	_ = b.rdb.XGroupCreateMkStream(ctx, StreamJobsResults, group, "$").Err()

	var q *db.Queries
	if b.pool != nil {
		q = db.New(b.pool)
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		res, err := b.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    group,
			Consumer: consumer,
			Streams:  []string{StreamJobsResults, ">"},
			Count:    50,
			Block:    5 * time.Second,
		}).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) {
				continue
			}
			return fmt.Errorf("xreadgroup: %w", err)
		}
		if len(res) == 0 {
			continue
		}

		for _, s := range res {
			for _, m := range s.Messages {
				payloadAny, ok := m.Values["payload"]
				if !ok {
					_ = b.rdb.XAck(ctx, StreamJobsResults, group, m.ID).Err()
					continue
				}

				var payload string
				switch v := payloadAny.(type) {
				case string:
					payload = v
				case []byte:
					payload = string(v)
				default:
					_ = b.rdb.XAck(ctx, StreamJobsResults, group, m.ID).Err()
					continue
				}

				var env ResultEnvelope
				if err := json.Unmarshal([]byte(payload), &env); err != nil {
					b.log.Warn().Err(err).Str("msg_id", m.ID).Msg("invalid results payload")
					_ = b.rdb.XAck(ctx, StreamJobsResults, group, m.ID).Err()
					continue
				}

				if env.SubmissionID == uuid.Nil {
					_ = b.rdb.XAck(ctx, StreamJobsResults, group, m.ID).Err()
					continue
				}

				var (
					sub db.Submission
					err error
				)
				if b.getSubmissionFn != nil {
					sub, err = b.getSubmissionFn(ctx, env.SubmissionID)
				} else {
					sub, err = q.GetSubmissionByID(ctx, env.SubmissionID)
				}

				if err == nil {
					recomputeTask := b.recomputeTaskPhaseFn
					if recomputeTask == nil {
						recomputeTask = b.recomputeTaskPhase
					}
					recomputeContest := b.recomputeContestFn
					if recomputeContest == nil {
						recomputeContest = b.recomputeContestPhase
					}

					if err := recomputeTask(ctx, sub); err != nil {
						b.log.Warn().Err(err).Str("submission_id", env.SubmissionID.String()).Msg("recompute task-phase failed")
					}
					if err := recomputeContest(ctx, sub); err != nil {
						b.log.Warn().Err(err).Str("submission_id", env.SubmissionID.String()).Msg("recompute contest-phase failed")
					}
				} else {
					b.log.Warn().Err(err).Str("submission_id", env.SubmissionID.String()).Msg("fetch submission for leaderboard")
				}

				_ = b.rdb.XAck(ctx, StreamJobsResults, group, m.ID).Err()
			}
		}
	}
}

func (b *LeaderboardBridge) recomputeTaskPhase(ctx context.Context, sub db.Submission) error {
	// For Lean V1: recompute the full phase ranking each time.
	q := db.New(b.pool)
	phase, err := q.GetPhaseByID(ctx, sub.PhaseID)
	if err != nil {
		return fmt.Errorf("get phase: %w", err)
	}
	task, err := q.GetTaskByID(ctx, sub.TaskID)
	if err != nil {
		return fmt.Errorf("get task: %w", err)
	}

	_, err = b.pool.Exec(ctx, `
WITH candidate AS (
  SELECT
    s.contest_id,
    s.task_id,
    s.phase_id,
    s.contest_entry_id,
    s.id AS submission_id,
    s.display_score,
    row_number() OVER (
      PARTITION BY s.contest_entry_id
      ORDER BY
        CASE WHEN $2::leaderboard_mode = 'latest' THEN s.submitted_at END DESC NULLS LAST,
        CASE WHEN $2::leaderboard_mode = 'best' AND $3 THEN s.display_score END DESC NULLS LAST,
        CASE WHEN $2::leaderboard_mode = 'best' AND NOT $3 THEN s.display_score END ASC NULLS LAST,
        s.submitted_at DESC
    ) AS rn,
    count(*) OVER (PARTITION BY s.contest_entry_id) AS entries_count
  FROM submissions s
  WHERE s.phase_id = $1
    AND s.status = 'done'
    AND s.display_score IS NOT NULL
),
chosen AS (
  SELECT * FROM candidate WHERE rn = 1
),
ranked AS (
  SELECT
    c.*,
    dense_rank() OVER (
      ORDER BY
        CASE WHEN $2::leaderboard_mode = 'best' AND $3 THEN c.display_score END DESC NULLS LAST,
        CASE WHEN $2::leaderboard_mode = 'best' AND NOT $3 THEN c.display_score END ASC NULLS LAST,
        c.display_score DESC NULLS LAST
    )::int AS rank
  FROM chosen c
)
INSERT INTO task_phase_leaderboard_entries (
  contest_id, task_id, phase_id, contest_entry_id,
  rank, score, score_breakdown, chosen_submission_id, entries_count,
  is_frozen, is_disqualified
)
SELECT
  r.contest_id,
  r.task_id,
  r.phase_id,
  r.contest_entry_id,
  r.rank,
  r.display_score,
  NULL::jsonb,
  r.submission_id,
  r.entries_count,
  p.is_frozen,
  (ce.status = 'disqualified')
FROM ranked r
JOIN phases p ON p.id = r.phase_id
JOIN contest_entries ce ON ce.id = r.contest_entry_id
ON CONFLICT (phase_id, contest_entry_id) DO UPDATE SET
  rank = EXCLUDED.rank,
  score = EXCLUDED.score,
  score_breakdown = EXCLUDED.score_breakdown,
  chosen_submission_id = EXCLUDED.chosen_submission_id,
  entries_count = EXCLUDED.entries_count,
  is_frozen = EXCLUDED.is_frozen,
  updated_at = now();
`,
		sub.PhaseID,
		phase.LeaderboardMode,
		task.HigherIsBetter,
	)
	if err != nil {
		return fmt.Errorf("recompute task-phase board: %w", err)
	}
	return nil
}

func (b *LeaderboardBridge) recomputeContestPhase(ctx context.Context, sub db.Submission) error {
	q := db.New(b.pool)
	phase, err := q.GetPhaseByID(ctx, sub.PhaseID)
	if err != nil {
		return fmt.Errorf("get phase: %w", err)
	}

	_, err = b.pool.Exec(ctx, `
WITH phases_in_def AS (
  SELECT p.id AS phase_id, p.task_id, p.leaderboard_mode, t.higher_is_better, t.contest_id
  FROM phases p
  JOIN tasks t ON t.id = p.task_id
  WHERE p.contest_phase_def_id = $1
    AND t.contest_id = $2
),
per_phase_choice AS (
  SELECT
    s.contest_id,
    s.phase_id,
    s.contest_entry_id,
    s.id AS submission_id,
    s.display_score,
    row_number() OVER (
      PARTITION BY s.phase_id, s.contest_entry_id
      ORDER BY
        CASE WHEN pid.leaderboard_mode = 'latest' THEN s.submitted_at END DESC NULLS LAST,
        CASE WHEN pid.leaderboard_mode = 'best' AND pid.higher_is_better THEN s.display_score END DESC NULLS LAST,
        CASE WHEN pid.leaderboard_mode = 'best' AND NOT pid.higher_is_better THEN s.display_score END ASC NULLS LAST,
        s.submitted_at DESC
    ) AS rn
  FROM submissions s
  JOIN phases_in_def pid ON pid.phase_id = s.phase_id
  WHERE s.status = 'done'
    AND s.display_score IS NOT NULL
),
chosen AS (
  SELECT * FROM per_phase_choice WHERE rn = 1
),
agg AS (
  SELECT
    c.contest_id,
    $1::uuid AS contest_phase_def_id,
    c.contest_entry_id,
    SUM(c.display_score) AS total_score,
    COUNT(*)::int AS entries_count
  FROM chosen c
  GROUP BY c.contest_id, c.contest_entry_id
),
ranked AS (
  SELECT
    a.*,
    dense_rank() OVER (ORDER BY a.total_score DESC NULLS LAST)::int AS rank
  FROM agg a
)
INSERT INTO contest_phase_leaderboard_entries (
  contest_id, contest_phase_def_id, contest_entry_id,
  rank, score, score_breakdown, entries_count,
  is_frozen, is_disqualified
)
SELECT
  r.contest_id,
  r.contest_phase_def_id,
  r.contest_entry_id,
  r.rank,
  r.total_score,
  NULL::jsonb,
  r.entries_count,
  false,
  (ce.status = 'disqualified')
FROM ranked r
JOIN contest_entries ce ON ce.id = r.contest_entry_id
ON CONFLICT (contest_phase_def_id, contest_entry_id) DO UPDATE SET
  rank = EXCLUDED.rank,
  score = EXCLUDED.score,
  score_breakdown = EXCLUDED.score_breakdown,
  entries_count = EXCLUDED.entries_count,
  is_frozen = EXCLUDED.is_frozen,
  updated_at = now();
`,
		phase.ContestPhaseDefID,
		sub.ContestID,
	)
	if err != nil {
		return fmt.Errorf("recompute contest-phase board: %w", err)
	}
	return nil
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "go-api"
	}
	return h
}
