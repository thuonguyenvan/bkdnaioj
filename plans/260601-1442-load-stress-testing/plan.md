---
title: "Load & Stress Testing Plan"
description: "k6 scripts kiểm tra hệ thống với 2 bài Sudoku và DỊCH THUẬT HOA–VIỆT"
status: pending
priority: P1
effort: 6h
branch: feature/volunteer-judge-worker-network
tags: [testing, infra, backend]
created: 2026-06-01
---

# Load & Stress Testing Plan

## Mục tiêu

Tìm ra giới hạn thực tế của hệ thống trước khi deploy production:
- Bao nhiêu user submit đồng thời mà hệ thống vẫn OK?
- Bottleneck ở đâu: API, DB, Redis queue, hay judge worker?
- Leaderboard/read endpoints chịu tải đến bao nhiêu?

## Submission Files dùng để test

| Task | File | Size | Thời gian judge |
|------|------|------|----------------|
| ZHVI (non-final) | `contestant/non_final_public/submission.csv` | 14 KB | <1s |
| Sudoku (non-final) | `contestant/non_final_public_submission.zip` | 12.4 MB | 2–5s |

**Strategy:** ZHVI dùng để test throughput cao (file nhỏ, judge nhanh). Sudoku dùng để test queue backlog & worker capacity (file lớn, judge chậm).

## Công cụ

**k6** (Grafana) — chạy local, script JavaScript, CI-friendly.

```bash
brew install k6   # macOS
# hoặc
brew install k6
```

## Phases

| # | Phase | Effort | Link |
|---|-------|--------|------|
| 1 | Setup & Baseline | 1h | [phase-01](./phase-01-setup-baseline.md) |
| 2 | Load Test Scenarios (k6 scripts) | 3h | [phase-02](./phase-02-load-test-scripts.md) |
| 3 | Stress Test & Breaking Point | 1h | [phase-03](./phase-03-stress-test.md) |
| 4 | Analysis & Recommendations | 1h | [phase-04](./phase-04-analysis.md) |

## Môi trường test

- **Target:** staging hoặc production URL của Vercel + backend
- **Không test trên local** vì không phản ánh thực tế
- Cần có sẵn: 1 contest, 2 tasks (ZHVI + Sudoku), phases đã setup, ít nhất 1 judge worker

## Bottlenecks dự kiến

1. **Supabase free tier:** ~60 DB connections → dễ hit limit khi >20 concurrent users
2. **Judge worker:** 1 worker = xử lý tuần tự → queue backlog khi nhiều submissions
3. **MinIO presigned URL:** Upload lớn (Sudoku 12MB) → bandwidth bottleneck
4. **Redis Streams:** Ít khả năng là bottleneck ở scale V1
