# Phase 04 — ClaimNext: Global Check

## Files

| Action | File | Mô tả |
|--------|------|--------|
| modify | `backend/internal/http/handlers/volunteer_workers.go` | Thêm global check vào ClaimNext |

## Thay đổi trong ClaimNext

Hiện tại flow:
```
1. Parse requesting worker profile
2. Peek 100 pending jobs
3. For each job: estimate T(requesting_worker, job)
4. Pick best job (lowest cost for requesting worker)
5. Dequeue and dispatch
```

Flow mới:
```
1. Parse requesting worker profile
2. Query ALL active workers + their availability    ← MỚI
3. Peek 100 pending jobs
4. For each job:
   a. estimate T(requesting_worker, job)
   b. compute GlobalBestFinishTime(all_workers, job) ← MỚI
   c. check IsGloballyBestWorker(...)               ← MỚI
   d. nếu không phải best → skip job này
5. Pick best job từ filtered list
6. Nếu không có job nào → return nil (worker idle)  ← MỚI BEHAVIOR
7. Dequeue and dispatch
```

## Code thay đổi

```go
// Thêm vào đầu ClaimNext, sau khi parse profile:

// Query all active workers for global best finish time check
now := time.Now()
workerRows, err := h.q.GetAllActiveWorkersWithEarliestAvailable(ctx)
if err != nil {
    workerRows = nil // fallback: skip global check if query fails
}
// Build max_workers map (needed by BuildWorkerAvailability)
maxWorkersMap := map[uuid.UUID]int{worker.ID: int(worker.MaxWorkers)}
for _, row := range workerRows {
    maxWorkersMap[row.ID] = int(row.MaxWorkers)
}
allWorkers := scheduler.BuildWorkerAvailability(workerRows, maxWorkersMap)
requestingAvailableAt := now // requesting worker has free slot (capacity check passed)
```

Trong vòng lặp candidates, sau khi có demand và plan:

```go
// Global best finish time check (Section 8-9 design doc)
// Only assign if requesting worker is globally optimal (within 10% threshold)
if len(allWorkers) > 0 {
    if !scheduler.IsGloballyBestWorker(
        profile, requestingAvailableAt,
        allWorkers, demand, now,
    ) {
        // Another worker can finish this job sooner — skip
        continue
    }
}
```

## Behavior mới

| Scenario | Kết quả |
|----------|---------|
| CPU worker request final job, GPU worker sẽ rảnh trong 5p và nhanh hơn | CPU worker skip → GPU worker nhận khi rảnh |
| CPU worker request final job, không có GPU worker | CPU worker nhận (no better option) |
| GPU worker request output-only job, CPU worker trống | Tùy opportunity cost (đã implement trước) |
| Query allWorkers fail | Fallback: assign như cũ (không block) |

## Performance

- `GetAllActiveWorkersWithEarliestAvailable`: 1 query / request
- `IsGloballyBestWorker`: O(N_workers × N_jobs_candidates) per request
  - N_workers < 100, N_candidates = 100 → ~10,000 ops, < 1ms

## Success Criteria

- [ ] Final job không gán cho CPU worker khi GPU worker bận nhưng sẽ nhanh hơn
- [ ] Fallback hoạt động khi query fail
- [ ] Worker không bị idle vô hạn (luôn có fallback)
