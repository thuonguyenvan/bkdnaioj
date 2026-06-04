---
title: "OLPAI Thesis Improvements"
description: "Cải tiến hệ thống OLPAI theo 3 nhóm: đóng góp học thuật (A), hạ tầng thực nghiệm (B), engineering optimization (C)"
status: pending
priority: P1
effort: 17.5h
branch: main
tags: [backend, distributed-systems, performance, research]
created: 2026-06-02
---

# OLPAI Thesis Improvements Plan

## Overview

Thực hiện toàn bộ cải tiến cho đồ án tốt nghiệp, gồm 6 phase theo thứ tự ưu tiên. Mục tiêu: biến OLPAI từ "website contest" thành "AI Competition Platform + Distributed Judging System".

## Phases

| # | Phase | Nhóm | Effort | Status | Link |
|---|-------|------|--------|--------|------|
| 1 | Prometheus Metrics | B - Hạ tầng | 2h | Pending | [phase-01](./phase-01-prometheus-metrics.md) |
| 2 | Judge Script Sandbox | A - Đóng góp chính | 3h | Pending | [phase-02](./phase-02-sandbox.md) |
| 3 | Capability-Aware Scheduling | A - Đóng góp chính | 4h | Pending | [phase-03](./phase-03-capability-scheduling.md) |
| 4 | Incremental Leaderboard | A - Đóng góp chính | 4h | Pending | [phase-04](./phase-04-incremental-leaderboard.md) |
| 5 | Official-First Policy Validation | B - Bonus | 1h | Pending | [phase-05](./phase-05-smart-queue.md) |
| 6 | Engineering Optimizations | C - Tối ưu | 2h | Pending | [phase-06](./phase-06-engineering-optimizations.md) |

## Dependencies

- Phase 1 (Prometheus) phải xong trước Phase 3, 4, 5 để có số liệu benchmark
- Phase 3 (Scheduling) phụ thuộc vào cấu trúc Redis Streams hiện tại (producer.go)
- Phase 4 (Leaderboard) độc lập hoàn toàn
- Phase 6 (Engineering) độc lập, không block gì

## Đóng góp đồ án (framing cho hội đồng)

1. Thiết kế kiến trúc chấm bài phân tán — Judge Worker + Redis Streams *(đã có)*
2. Thiết kế môi trường chấm an toàn — Sandbox Container *(Phase 2)*
3. Capability-Aware Scheduling cho Volunteer Worker Network *(Phase 3)*
4. Incremental Leaderboard Update — tối ưu từ O(n) xuống O(log n) *(Phase 4)*
5. Hệ thống giám sát hiệu năng — Prometheus Metrics *(Phase 1)*
