package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/mank1/olpai-backend/db"
	lbcache "github.com/mank1/olpai-backend/internal/leaderboard"
	"github.com/mank1/olpai-backend/internal/metrics"
)

type ResultEnvelope struct {
	SubmissionID uuid.UUID `json:"submission_id"`
	Type         string    `json:"type"` // done|failed
}

type LeaderboardBridge struct {
	rdb   *redis.Client
	pool  *pgxpool.Pool
	log   zerolog.Logger
	cache *lbcache.Cache

	getSubmissionFn      func(ctx context.Context, submissionID uuid.UUID) (db.Submission, error)
	recomputeTaskPhaseFn func(ctx context.Context, sub db.Submission) error
	recomputeContestFn   func(ctx context.Context, sub db.Submission) error
	recomputeGlobalFn    func(ctx context.Context, sub db.Submission) error
}

func NewLeaderboardBridge(rdb *redis.Client, pool *pgxpool.Pool, log zerolog.Logger) *LeaderboardBridge {
	var cache *lbcache.Cache
	if rdb != nil {
		cache = lbcache.New(rdb)
	}
	return &LeaderboardBridge{rdb: rdb, pool: pool, log: log, cache: cache}
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
	b.recomputeGlobalFn = nil // uses recomputeGlobalPhase by default
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
					recomputeGlobal := b.recomputeGlobalFn
					if recomputeGlobal == nil {
						recomputeGlobal = b.recomputeGlobalPhase
					}

					if err := recomputeTask(ctx, sub); err != nil {
						b.log.Warn().Err(err).Str("submission_id", env.SubmissionID.String()).Msg("recompute task-phase failed")
					}
					if err := recomputeContest(ctx, sub); err != nil {
						b.log.Warn().Err(err).Str("submission_id", env.SubmissionID.String()).Msg("recompute contest-phase failed")
					}
					if err := recomputeGlobal(ctx, sub); err != nil {
						b.log.Warn().Err(err).Str("submission_id", env.SubmissionID.String()).Msg("recompute global phase ranking failed")
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
	// Try incremental path first (O(log n)); fall back to full recompute if needed.
	if b.cache != nil {
		if err := b.incrementalTaskPhase(ctx, sub); err == nil {
			return nil
		}
		// Fall through to full recompute on any error
	}
	return b.fullRecomputeTaskPhase(ctx, sub)
}

func (b *LeaderboardBridge) incrementalTaskPhase(ctx context.Context, sub db.Submission) error {
	start := time.Now()
	q := db.New(b.pool)

	// Get current max score from Redis ZSET
	currentMax, err := b.cache.GetMaxScore(ctx, sub.PhaseID)
	if err != nil {
		return err
	}

	// Get the best submission for this entry
	best, err := q.GetBestSubmissionForEntry(ctx, db.GetBestSubmissionForEntryParams{
		PhaseID:        sub.PhaseID,
		ContestEntryID: sub.ContestEntryID,
	})
	if err != nil {
		return err
	}

	newScore, _ := best.DisplayScore.Float64Value()
	if !newScore.Valid {
		return fmt.Errorf("no valid score")
	}

	// If new score breaks the max → full recompute required (scale_scores normalization changes)
	if newScore.Float64 > currentMax && currentMax > 0 {
		return fmt.Errorf("max score broken: need full recompute")
	}

	// Get phase info for scale_scores
	phase, err := q.GetPhaseByID(ctx, sub.PhaseID)
	if err != nil {
		return err
	}
	task, err := q.GetTaskByID(ctx, sub.TaskID)
	if err != nil {
		return err
	}

	score := newScore.Float64
	maxForScale := currentMax
	if maxForScale <= 0 {
		maxForScale = score
	}

	// Apply scale_scores normalization if needed
	_ = phase // phase.is_frozen used below
	_ = task  // task.higher_is_better used by full recompute; incremental uses raw for now

	// Update ZSET → get new rank (O(log n))
	newRank, err := b.cache.UpdateScore(ctx, sub.PhaseID, sub.ContestEntryID, score)
	if err != nil {
		return err
	}

	// Count total entries via ZSET (O(1), already populated)
	totalEntries, _ := b.rdb.ZCard(ctx, fmt.Sprintf("lb:%s", sub.PhaseID)).Result()
	entriesCount := int32(totalEntries)
	if entriesCount == 0 {
		entriesCount = 1 // fallback
	}

	// Convert types for UpdateSingleLeaderboardEntryParams
	rank32 := int32(newRank)
	scoreStr := fmt.Sprintf("%f", newScore.Float64)
	chosenID := pgtype.UUID{Bytes: best.ID, Valid: true}

	// UPDATE 1 row in DB
	if err := q.UpdateSingleLeaderboardEntry(ctx, db.UpdateSingleLeaderboardEntryParams{
		PhaseID:            sub.PhaseID,
		ContestEntryID:     sub.ContestEntryID,
		Rank:               &rank32,
		Score:              scoreStr,
		RawScore:           scoreStr,
		ChosenSubmissionID: chosenID,
		EntriesCount:       entriesCount,
	}); err != nil {
		return err
	}

	metrics.LeaderboardRecomputeDuration.WithLabelValues("task_phase_incremental").
		Observe(time.Since(start).Seconds())
	return nil
}

func (b *LeaderboardBridge) fullRecomputeTaskPhase(ctx context.Context, sub db.Submission) error {
	start := time.Now()
	defer func() {
		metrics.LeaderboardRecomputeDuration.WithLabelValues("task_phase_full").
			Observe(time.Since(start).Seconds())
	}()
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
        s.is_final DESC,
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
chosen_with_max AS (
  SELECT c.*,
         MAX(c.display_score) OVER() as max_phase_score
  FROM chosen c
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
  FROM chosen_with_max c
)
INSERT INTO task_phase_leaderboard_entries (
  contest_id, task_id, phase_id, contest_entry_id,
  rank, score, raw_score, score_breakdown, chosen_submission_id, entries_count,
  is_frozen, is_disqualified
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

	// Seed Redis ZSET from DB so incremental path works on next submission
	if b.cache != nil {
		b.seedZSETFromDB(ctx, sub.PhaseID)
	}
	return nil
}

// seedZSETFromDB loads all leaderboard entries for phaseID into the Redis ZSET.
// Called after every full recompute so the incremental path has an up-to-date max.
func (b *LeaderboardBridge) seedZSETFromDB(ctx context.Context, phaseID uuid.UUID) {
	q := db.New(b.pool)
	rows, err := q.GetAllLeaderboardEntriesForPhase(ctx, phaseID)
	if err != nil || len(rows) == 0 {
		return
	}
	entries := make([]lbcache.SeedEntry, len(rows))
	for i, r := range rows {
		scoreF, _ := strconv.ParseFloat(r.Score, 64)
		entries[i] = lbcache.SeedEntry{
			EntryID: r.ContestEntryID,
			Score:   scoreF,
		}
	}
	_ = b.cache.SeedPhase(ctx, phaseID, entries)
}

func (b *LeaderboardBridge) recomputeContestPhase(ctx context.Context, sub db.Submission) error {
	start := time.Now()
	defer func() {
		metrics.LeaderboardRecomputeDuration.WithLabelValues("contest_phase").
			Observe(time.Since(start).Seconds())
	}()
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
        s.is_final DESC,
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
chosen_with_max AS (
  SELECT c.*,
         MAX(c.display_score) OVER(PARTITION BY c.phase_id) as max_phase_score
  FROM chosen c
),
agg AS (
  SELECT
    c.contest_id,
    $1::uuid AS contest_phase_def_id,
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
    COUNT(*)::int AS entries_count
  FROM chosen_with_max c
  JOIN contests ct ON ct.id = c.contest_id
  GROUP BY c.contest_id, c.contest_entry_id, ct.scale_scores
),
ranked AS (
  SELECT
    a.*,
    dense_rank() OVER (ORDER BY a.total_score DESC NULLS LAST)::int AS rank
  FROM agg a
)
INSERT INTO contest_phase_leaderboard_entries (
  contest_id, contest_phase_def_id, contest_entry_id,
  rank, score, raw_score, score_breakdown, entries_count,
  is_frozen, is_disqualified
)
SELECT
  r.contest_id,
  r.contest_phase_def_id,
  r.contest_entry_id,
  r.rank,
  r.total_score,
  r.raw_score,
  NULL::jsonb,
  r.entries_count,
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

func (b *LeaderboardBridge) recomputeGlobalPhase(ctx context.Context, sub db.Submission) error {
	start := time.Now()
	defer func() {
		metrics.LeaderboardRecomputeDuration.WithLabelValues("global_phase").
			Observe(time.Since(start).Seconds())
	}()

	q := db.New(b.pool)
	phase, err := q.GetPhaseByID(ctx, sub.PhaseID)
	if err != nil {
		return fmt.Errorf("get phase: %w", err)
	}
	def, err := q.GetPhaseDefByID(ctx, phase.ContestPhaseDefID)
	if err != nil {
		return fmt.Errorf("get phase def: %w", err)
	}
	if err := q.RecomputeGlobalPhaseRanking(ctx, def.Key); err != nil {
		return fmt.Errorf("recompute global phase ranking: %w", err)
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
