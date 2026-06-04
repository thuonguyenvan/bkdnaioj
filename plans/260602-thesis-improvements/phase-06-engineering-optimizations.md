# Phase 06 — Engineering Optimizations

**Nhóm:** C - Engineering (ghi vào mục "Tối ưu hiệu năng hệ thống" trong báo cáo)  
**Effort:** 2h  
**Priority:** P3 — làm sau, không block gì

## Overview

3 optimization nhỏ nhưng rõ ràng: fix N+1 query, fix capacity check, fix timeout watcher. Không phải contribution lớn nhưng là engineering tốt và có số liệu đo được.

---

## 6.1 — Fix N+1 Query trong AdminList

**File:** [backend/internal/http/handlers/volunteer_workers.go:259-274](../../backend/internal/http/handlers/volunteer_workers.go)

**Vấn đề:**
```go
// Hiện tại: 1 query list workers + N queries count claims
for i, w := range workers {
    if n, err := h.q.CountWorkerActiveClaims(ctx, w.ID); err == nil {
        r.ActiveJobs = n
    }
}
// 100 workers = 101 queries
```

**Fix:** Thêm SQL query aggregate 1 lần:

```sql
-- backend/db/queries/volunteer_workers.sql
-- name: ListWorkerActiveClaimCounts :many
SELECT worker_id, COUNT(*)::int AS active_claims
FROM volunteer_worker_claims
GROUP BY worker_id;
```

```go
// volunteer_workers.go — AdminList()
workers, _ := h.q.ListVolunteerWorkers(ctx)
claimCounts, _ := h.q.ListWorkerActiveClaimCounts(ctx)

// Build map worker_id → active_claims
countMap := make(map[uuid.UUID]int64, len(claimCounts))
for _, c := range claimCounts {
    countMap[c.WorkerID] = int64(c.ActiveClaims)
}

resp := make([]dto.WorkerResponse, len(workers))
for i, w := range workers {
    r := dto.VolunteerWorkerToResponse(w)
    r.ActiveJobs = countMap[w.ID]  // O(1) lookup, không query nữa
    resp[i] = r
}
// Tổng: 2 queries thay vì 1+N
```

---

## 6.2 — Fix Capacity Check O(n) → Bounded

**File:** [backend/internal/http/handlers/volunteer_workers.go:101-113](../../backend/internal/http/handlers/volunteer_workers.go)

**Vấn đề:**
```go
// Mỗi worker poll NextJob đều COUNT(*) toàn bảng
activeClaims, err := h.q.CountWorkerActiveClaims(ctx, worker.ID)
```

**Fix:** Bounded LIMIT query — chỉ cần biết "có >= max_workers không?", không cần số chính xác:

```sql
-- name: WorkerIsAtCapacity :one
SELECT COUNT(*) >= $2 AS at_capacity
FROM volunteer_worker_claims
WHERE worker_id = $1
LIMIT $2;  -- DB dừng scan ngay khi đủ count
```

```go
// volunteer_workers.go — NextJob()
atCapacity, err := h.q.WorkerIsAtCapacity(ctx, db.WorkerIsAtCapacityParams{
    WorkerID:   worker.ID,
    MaxWorkers: worker.MaxWorkers,
})
if atCapacity {
    return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "at_capacity"})
}
```

**Lợi ích:** Với worker có 2 active claims và max=2, query dừng scan sau 2 rows thay vì đếm hết bảng.

---

## 6.3 — Fix Timeout Watcher — Batch Delete

**File:** [backend/cmd/api/main.go:124-156](../../backend/cmd/api/main.go)

**Vấn đề:**
```go
// Hiện tại: loop delete từng claim
for _, claim := range stale {
    producer.EnqueueJudge(ctx, claim.SubmissionID, nil) // 1 Redis call/claim
    q.DeleteWorkerClaim(ctx, ...)                       // 1 DB call/claim
    q.IncrementWorkerFailedByID(ctx, claim.WorkerID)    // 1 DB call/claim
}
// 10 stale claims = 30 calls
```

**Fix 1:** Batch enqueue (Redis pipeline):
```go
pipe := producer.rdb.Pipeline()
for _, claim := range stale {
    // Thêm XAdd vào pipeline thay vì gọi riêng lẻ
    env := queue.JudgeEnvelope{SubmissionID: claim.SubmissionID}
    payload, _ := json.Marshal(env)
    pipe.XAdd(ctx, &redis.XAddArgs{Stream: queue.StreamJobsJudge, Values: map[string]any{"payload": string(payload)}})
}
_, _ = pipe.Exec(ctx)
```

**Fix 2:** Batch delete với single SQL:
```sql
-- name: DeleteStaleWorkerClaims :many
DELETE FROM volunteer_worker_claims
WHERE claimed_at < $1
RETURNING worker_id, submission_id;
-- Không cần loop, 1 query xóa tất cả + RETURNING để re-enqueue
```

```go
// Sửa runWorkerTimeoutWatcher():
stale, _ := q.DeleteStaleWorkerClaims(ctx, cutoff) // batch delete
// Re-enqueue qua pipeline
pipe := rdb.Pipeline()
for _, claim := range stale {
    // XAdd vào pipeline
}
_, _ = pipe.Exec(ctx)
```

---

## Số liệu đo được (cho báo cáo)

Benchmark đơn giản bằng `go test -bench`:

```go
// backend/internal/http/handlers/volunteer_workers_test.go

func BenchmarkAdminList_NplusOne(b *testing.B) {
    // 50 workers, measure time/op
}

func BenchmarkAdminList_Batch(b *testing.B) {
    // 50 workers, 1 aggregate query
}
```

Kết quả kỳ vọng với 50 workers:
- N+1: ~50ms (50 round-trips)
- Batch: ~2ms (2 round-trips)

---

## Success Criteria

- [ ] AdminList dùng 2 queries thay vì 1+N
- [ ] `WorkerIsAtCapacity` dùng bounded LIMIT
- [ ] Timeout watcher dùng batch delete + Redis pipeline
- [ ] Benchmark có số liệu trước/sau cho báo cáo
