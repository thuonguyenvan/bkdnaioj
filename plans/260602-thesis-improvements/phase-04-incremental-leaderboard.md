# Phase 04 — Incremental Leaderboard Update

**Nhóm:** A - Đóng góp chính  
**Effort:** 4h  
**Priority:** P1

## Overview

Tối ưu leaderboard từ O(n) full recompute mỗi submission → amortized O(log n) trong trường hợp không phá max_score.

## Key Insight từ code hiện tại

```go
// leaderboard_bridge.go line 161
// "For Lean V1: recompute the full phase ranking each time."
```

Câu comment này nói rõ: đây là intentional simplification, chờ optimize.

**Vấn đề:** Cả `recomputeTaskPhase()` và `recomputeContestPhase()` đều:
1. Scan toàn bộ submissions của phase (window function)
2. Tính lại `max_phase_score` từ đầu
3. UPSERT toàn bộ rows

**Phân tích 2 case:**
- `scale_scores = FALSE`: max_phase_score không liên quan → luôn có thể O(log n)
- `scale_scores = TRUE` + submission không phá max → chỉ update 1 row → O(log n)
- `scale_scores = TRUE` + submission phá max → toàn bộ normalized score thay đổi → O(n) không tránh được

## Architecture

```
Hiện tại (mỗi submission):
  submission → full recompute SQL → UPSERT all rows

Sau:
  submission → check: phá max_score không?
    ├─ Không phá max → UPDATE 1 row (entry) + rerank affected rows → O(log n)
    └─ Phá max mới → full recompute → O(n)
    
Redis ZSET làm cache rank:
  key: "leaderboard:{phase_id}"
  score: display_score (hoặc normalized nếu scale_scores)
  member: contest_entry_id
```

## Files cần sửa / tạo

| Action | File | Mô tả |
|--------|------|--------|
| modify | `backend/internal/queue/leaderboard_bridge.go` | Tách incremental vs full recompute, init ZSET từ DB khi startup |
| create | `backend/internal/leaderboard/cache.go` | Redis ZSET helper (UpdateScore, GetMaxScore) |
| modify | `backend/db/queries/leaderboards.sql` | Thêm `GetPhaseMaxScore`, `UpdateSingleLeaderboardEntry`, `GetAllEntriesForPhase` (init ZSET) |
| run    | `cd backend && sqlc generate` | Sinh lại Go code sau khi thêm queries |
| create | `demo/leaderboard_benchmark.py` | Script đo latency trước/sau |

## Implementation Steps

### 1. Thêm query lấy current max_score của phase

```sql
-- backend/db/queries/leaderboards.sql
-- name: GetPhaseMaxScore :one
SELECT COALESCE(MAX(display_score), 0) AS max_score
FROM task_phase_leaderboard_entries
WHERE phase_id = $1;
```

### 2. Thêm query update single entry

```sql
-- name: UpdateSingleLeaderboardEntry :exec
UPDATE task_phase_leaderboard_entries
SET
    score = $3,
    raw_score = $4,
    chosen_submission_id = $5,
    entries_count = $6,
    updated_at = now()
WHERE phase_id = $1 AND contest_entry_id = $2;
```

### 3. Tạo `backend/internal/leaderboard/cache.go` — Redis ZSET helper

```go
package leaderboard

import "github.com/redis/go-redis/v9"

type Cache struct { rdb *redis.Client }

func ZKey(phaseID uuid.UUID) string {
    return fmt.Sprintf("lb:%s", phaseID)
}

// UpdateScore cập nhật score cho 1 entry, trả về rank mới
func (c *Cache) UpdateScore(ctx context.Context, phaseID, entryID uuid.UUID, score float64) (int64, error) {
    key := ZKey(phaseID)
    _ = c.rdb.ZAdd(ctx, key, redis.Z{Score: score, Member: entryID.String()}).Err()
    // Rank = số entries có score cao hơn (dense_rank: 1-based)
    rank, err := c.rdb.ZRevRank(ctx, key, entryID.String()).Result()
    return rank + 1, err
}

// GetMaxScore lấy max score từ ZSET (member với score cao nhất)
func (c *Cache) GetMaxScore(ctx context.Context, phaseID uuid.UUID) (float64, error) {
    res, err := c.rdb.ZRevRangeWithScores(ctx, ZKey(phaseID), 0, 0).Result()
    if err != nil || len(res) == 0 { return 0, err }
    return res[0].Score, nil
}
```

### 4. Sửa `recomputeTaskPhase()` — tách 2 path

```go
func (b *LeaderboardBridge) recomputeTaskPhase(ctx context.Context, sub db.Submission) error {
    q := db.New(b.pool)
    
    // Lấy submission mới nhất của entry này
    newSub, _ := q.GetBestSubmissionForEntry(ctx, sub.ContestEntryID, sub.PhaseID)
    
    // Lấy max score hiện tại từ cache
    currentMax, _ := b.cache.GetMaxScore(ctx, sub.PhaseID)
    
    newScore := newSub.DisplayScore
    
    // Case: score mới phá max → phải full recompute (scale_scores thay đổi)
    if newScore > currentMax {
        return b.fullRecomputeTaskPhase(ctx, sub) // giữ nguyên SQL hiện tại
    }
    
    // Case: không phá max → incremental update
    return b.incrementalUpdateTaskPhase(ctx, sub, newSub, currentMax)
}

func (b *LeaderboardBridge) incrementalUpdateTaskPhase(ctx context.Context, sub db.Submission, newSub BestSub, maxScore float64) error {
    q := db.New(b.pool)
    phase, _ := q.GetPhaseByID(ctx, sub.PhaseID)
    contest, _ := q.GetContestByID(ctx, sub.ContestID)

    // Tính normalized score nếu scale_scores
    score := newSub.DisplayScore
    if contest.ScaleScores && maxScore > 0 {
        score = (newSub.DisplayScore / maxScore) * 100
    }

    // Cập nhật Redis ZSET → lấy rank mới O(log n)
    newRank, _ := b.cache.UpdateScore(ctx, sub.PhaseID, sub.ContestEntryID, score)

    // UPDATE 1 row trong DB
    _ = q.UpdateSingleLeaderboardEntry(ctx, db.UpdateSingleLeaderboardEntryParams{
        PhaseID:             sub.PhaseID,
        ContestEntryID:      sub.ContestEntryID,
        Score:               score,
        RawScore:            newSub.DisplayScore,
        ChosenSubmissionID:  newSub.ID,
        Rank:                int32(newRank),
        EntriesCount:        newSub.EntriesCount,
    })
    return nil
}
```

### 5. Ghi metrics cho từng path

```go
// leaderboard_bridge.go
start := time.Now()
if isFullRecompute {
    err = b.fullRecomputeTaskPhase(ctx, sub)
    metrics.LeaderboardRecomputeDuration.WithLabelValues("task_phase_full").Observe(...)
} else {
    err = b.incrementalUpdateTaskPhase(ctx, sub, ...)
    metrics.LeaderboardRecomputeDuration.WithLabelValues("task_phase_incremental").Observe(...)
}
```

### 6. Tạo `demo/leaderboard_benchmark.py`

```python
"""
Benchmark leaderboard update latency

Setup:
- Seed N teams với submissions ngẫu nhiên
- Inject 1000 submissions, đo latency update per submission
- So sánh: full recompute vs incremental

Quy mô test: 50 / 200 / 500 teams
Metric: p50, p95 latency (từ Prometheus hoặc DB updated_at)
"""

for n_teams in [50, 200, 500]:
    seed_teams(n_teams)
    
    # Strategy A: full recompute (disable incremental)
    latencies_full = run_submissions(count=1000, strategy="full")
    
    # Strategy B: incremental
    latencies_incremental = run_submissions(count=1000, strategy="incremental")
    
    print(f"n={n_teams}: full p50={p50(latencies_full):.1f}ms, p95={p95(latencies_full):.1f}ms")
    print(f"n={n_teams}: incr p50={p50(latencies_incremental):.1f}ms, p95={p95(latencies_incremental):.1f}ms")
    
    # Đo % submissions kích hoạt full recompute (phá max)
    max_break_rate = count_max_breaks(1000) / 1000 * 100
    print(f"Max-break rate: {max_break_rate:.1f}%")
```

## Experiment Design (cho báo cáo)

**Câu hỏi nghiên cứu:** Incremental update giảm latency bao nhiêu? Bao nhiêu % submissions thực sự kích hoạt O(n) path?

**Bảng kỳ vọng:**

| N teams | Full p50 | Full p95 | Incr p50 | Incr p95 | Max-break rate |
|---------|----------|----------|----------|----------|----------------|
| 50 | ~5ms | ~15ms | ~1ms | ~3ms | ~10% |
| 200 | ~20ms | ~50ms | ~2ms | ~5ms | ~5% |
| 500 | ~60ms | ~150ms | ~3ms | ~8ms | ~2% |

→ Max-break rate giảm dần khi contest tiến triển (ai đó đã set max cao, ít ai phá hơn). Incremental hiệu quả nhất ở cuối contest.

## Risk

- `scale_scores = TRUE` + max thay đổi → full recompute phải xử lý đúng. Test case này cẩn thận.
- Redis ZSET bị mất data khi restart → cần init ZSET từ DB khi startup
- Contest mode `latest` vs `best` ảnh hưởng cách chọn submission → cần handle đúng trong incremental path

## Success Criteria

- [ ] Incremental path hoạt động đúng (rank không sai so với full recompute)
- [ ] Full recompute vẫn được trigger khi max_score bị phá
- [ ] Metrics phân biệt rõ `task_phase_full` vs `task_phase_incremental`
- [ ] Benchmark có số liệu p50/p95 cho 3 quy mô (50/200/500)
- [ ] Unit test so sánh output của incremental vs full recompute
