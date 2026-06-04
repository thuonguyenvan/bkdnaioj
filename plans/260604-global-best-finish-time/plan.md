---
title: "Global Best Finish Time Scheduling"
description: "Khi worker request job, so sánh finish_time với TẤT CẢ workers (kể cả đang bận), chỉ assign nếu requesting worker là lựa chọn tốt nhất"
status: pending
priority: P1
effort: 3h
branch: main
tags: [backend, scheduler, distributed-systems]
created: 2026-06-04
---

# Global Best Finish Time Scheduling

## Overview

Vấn đề hiện tại: khi một worker request job, scheduler chỉ tính
`finish_time = T(requesting_worker, job)` mà không xét các worker khác
đang bận sẽ rảnh lúc nào. Kết quả: final job có thể gán cho CPU worker đang rảnh,
trong khi GPU worker sẽ rảnh trong 5 phút và chạy nhanh hơn nhiều.

**Design doc:** Section 8-9 của `measurement_driven_capability_scheduling_detailed_v2.md`

```
available_time_i = now                        (worker rảnh)
available_time_i = min(predicted_finish_at)   (worker đang bận)

finish_time(i,j) = available_time_i + T(i,j)

Chỉ assign job j cho worker i nếu:
finish_time(i,j) ≤ global_best_finish_time(j) × (1 + THRESHOLD)
```

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | DB Migration — predicted_finish_at | Pending | 20m | [phase-01](./phase-01-db-migration.md) |
| 2 | SQL Queries | Pending | 20m | [phase-02](./phase-02-queries.md) |
| 3 | Scheduler — GlobalAvailability | Pending | 40m | [phase-03](./phase-03-scheduler.md) |
| 4 | ClaimNext — Global Check | Pending | 60m | [phase-04](./phase-04-claimnext.md) |
| 5 | Store predicted_finish_at on claim | Pending | 20m | [phase-05](./phase-05-store-finish.md) |

## Dependencies

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (tuần tự)
- Sau Phase 2: chạy `sqlc generate`
- Sau Phase 5: chạy migration trên Supabase

## Key Design Decision: Threshold

Không dùng "exactly best" mà dùng threshold 10%:
```
assign_to_requesting_worker = finish_time(requesting) ≤ global_best × 1.1
```
Lý do: T(i,j) là estimate, có sai số. 10% buffer tránh bỏ lỡ good assignment
do estimate không hoàn hảo. Nếu requesting worker tệ hơn 10% thì không assign.
