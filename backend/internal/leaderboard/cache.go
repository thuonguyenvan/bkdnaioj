package leaderboard

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Cache wraps a Redis client to maintain per-phase rank sorted sets.
// Key format: "lb:{phase_id}"
// Score = display_score (or normalized score when scale_scores=TRUE)
// Member = contest_entry_id (string)
type Cache struct {
	rdb *redis.Client
}

// New creates a leaderboard Cache backed by rdb.
func New(rdb *redis.Client) *Cache {
	return &Cache{rdb: rdb}
}

func zkey(phaseID uuid.UUID) string {
	return fmt.Sprintf("lb:%s", phaseID)
}

// UpdateScore sets the score for entryID in phaseID's sorted set.
// Returns the new 1-based rank (highest score = rank 1).
func (c *Cache) UpdateScore(ctx context.Context, phaseID, entryID uuid.UUID, score float64) (int64, error) {
	key := zkey(phaseID)
	if err := c.rdb.ZAdd(ctx, key, redis.Z{Score: score, Member: entryID.String()}).Err(); err != nil {
		return 0, err
	}
	// ZRevRank returns 0-based rank (highest score = 0) → +1 for 1-based
	rank, err := c.rdb.ZRevRank(ctx, key, entryID.String()).Result()
	if err != nil {
		return 0, err
	}
	return rank + 1, nil
}

// GetMaxScore returns the highest score in the phase's sorted set.
// Returns 0 if the set is empty.
func (c *Cache) GetMaxScore(ctx context.Context, phaseID uuid.UUID) (float64, error) {
	res, err := c.rdb.ZRevRangeWithScores(ctx, zkey(phaseID), 0, 0).Result()
	if err != nil || len(res) == 0 {
		return 0, err
	}
	return res[0].Score, nil
}

// SeedPhase populates the sorted set from a slice of (entryID, score) pairs.
// Called on API startup to restore ZSET from DB state.
func (c *Cache) SeedPhase(ctx context.Context, phaseID uuid.UUID, entries []SeedEntry) error {
	if len(entries) == 0 {
		return nil
	}
	zs := make([]redis.Z, len(entries))
	for i, e := range entries {
		zs[i] = redis.Z{Score: e.Score, Member: e.EntryID.String()}
	}
	return c.rdb.ZAdd(ctx, zkey(phaseID), zs...).Err()
}

// SeedEntry is used to bulk-load an existing leaderboard into Redis.
type SeedEntry struct {
	EntryID uuid.UUID
	Score   float64
}
