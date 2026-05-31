---
title: "Volunteer Judge Worker Network V1"
description: "Mạng lưới volunteer worker cho phép máy tính đáng tin cậy tham gia chấm bài qua HTTP API"
status: pending
priority: P1
effort: 24h
branch: feature/volunteer-judge-worker-network
tags: [backend, feature, infra, worker]
created: 2026-05-31
---

# Volunteer Judge Worker Network V1

## Overview

Mở rộng hệ thống chấm bài bằng cách cho phép các máy tính đáng tin cậy (giảng viên, phòng lab, CLB AI) tham gia làm judge worker. Volunteer agent cài trên máy đó, kết nối với API server qua HTTP, poll job, chạy judge, trả kết quả. API server đóng vai proxy giữa volunteer và Redis stream — volunteer không cần truy cập trực tiếp Redis/DB/MinIO.

## Architecture

```
Volunteer Agent (Python)
    │
    ├── POST /api/v1/worker/register       — đăng ký lần đầu + hardware info
    ├── POST /api/v1/worker/heartbeat      — báo sống + resource stats mỗi 30s
    ├── GET  /api/v1/worker/jobs/next      — poll lấy job (API đọc Redis stream)
    └── POST /api/v1/worker/jobs/:id/result — nộp kết quả chấm
                │
                ▼
         API Server (Go)
                │
          ┌─────┴─────┐
          ▼           ▼
     Redis Stream  PostgreSQL
     (jobs:judge)  (submissions)
                │
                ▼
           MinIO (presigned URLs cho artifact)
```

**Key design decisions:**
- Volunteer KHÔNG cần Redis/DB/MinIO credentials — tất cả qua API
- Artifact download qua presigned MinIO URL (API tạo, volunteer download trực tiếp)
- Auth bằng static worker token (UUID64) — độc lập với user JWT
- Timeout: nếu worker claim job nhưng không trả kết quả sau N phút → API reclaim
- Agent code kế thừa từ `backend/workers/` — reuse PhaseRunner, storage logic

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Database Schema | Pending | 2h | [phase-01](./phase-01-database-schema.md) |
| 2 | Backend API (Go) | Pending | 8h | [phase-02-backend-api.md](./phase-02-backend-api.md) |
| 3 | Volunteer Agent (Python) | Pending | 8h | [phase-03-volunteer-agent.md](./phase-03-volunteer-agent.md) |
| 4 | Admin UI (Frontend) | Pending | 4h | [phase-04-admin-ui.md](./phase-04-admin-ui.md) |
| 5 | Integration & Deployment | Pending | 2h | [phase-05-integration.md](./phase-05-integration.md) |

## Dependencies

- Redis Streams đang chạy (`jobs:judge`, `jobs:results`)
- MinIO accessible và có presigned URL support
- Existing `JWTManager`, middleware patterns
- `backend/workers/` code reusable cho agent

## Out of Scope (V1)

- Anti-cheat / zero-trust execution
- Resource-aware scheduling
- Trust score / reputation system
- Cryptographic verification
- Multi-tenant isolation
