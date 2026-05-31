# Phase 01 — Database Schema

**Status:** Pending | **Effort:** 2h

## Overview

Tạo bảng `volunteer_workers` để lưu thông tin đăng ký, capabilities, token, trạng thái worker. Thêm sqlc queries tương ứng.

## Key Insights

- Dùng `api_token` (VARCHAR 64 unique) thay JWT để auth volunteer — tách biệt với user session
- `capabilities` là JSONB: linh hoạt với CPU/GPU/RAM khác nhau theo máy
- `current_job_id` track job đang chạy → dùng cho timeout detection
- Không cần foreign key `current_job_id → submissions.id` để tránh circular dependency (job có thể bị xóa)
- `last_seen_at` quan trọng hơn `last_heartbeat_at` — cập nhật khi cả heartbeat lẫn job activity

## Schema

### Migration file

**Create:** `backend/migrations/20260531224000_volunteer_workers.sql`

```sql
-- +goose Up

CREATE TYPE volunteer_worker_status AS ENUM (
    'pending',    -- đã đăng ký, chờ admin duyệt
    'active',     -- đang hoạt động
    'rejected',   -- bị từ chối
    'inactive'    -- tự deactivate hoặc admin disable
);

CREATE TABLE volunteer_workers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    display_name     VARCHAR(120)  NOT NULL,
    status           volunteer_worker_status NOT NULL DEFAULT 'pending',

    -- Auth: static token dùng cho worker API
    api_token        VARCHAR(64)   UNIQUE,   -- NULL khi pending, set khi approve

    -- Hardware capabilities (tự báo cáo)
    capabilities     JSONB         NOT NULL DEFAULT '{}',
    -- Expected format:
    -- {
    --   "os": "linux",
    --   "cpu_cores": 8, "cpu_model": "AMD Ryzen 7",
    --   "ram_gb": 32,
    --   "gpu": [{"model": "RTX 4090", "vram_gb": 24}],
    --   "docker_available": true,
    --   "python_version": "3.11.4",
    --   "disk_free_gb": 100
    -- }

    -- Runtime stats (cập nhật qua heartbeat)
    last_seen_at     TIMESTAMPTZ,
    cpu_usage        SMALLINT,     -- 0-100 %
    ram_usage        SMALLINT,     -- 0-100 %

    -- Job tracking
    current_job_id   UUID,                   -- submission_id đang xử lý (nullable)
    job_claimed_at   TIMESTAMPTZ,            -- khi nào claim job (dùng cho timeout)
    jobs_completed   INTEGER NOT NULL DEFAULT 0,
    jobs_failed      INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_volunteer_workers_status     ON volunteer_workers(status);
CREATE INDEX idx_volunteer_workers_api_token  ON volunteer_workers(api_token) WHERE api_token IS NOT NULL;
CREATE INDEX idx_volunteer_workers_current_job ON volunteer_workers(current_job_id) WHERE current_job_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS volunteer_workers;
DROP TYPE IF EXISTS volunteer_worker_status;
```

## sqlc Queries

**Create:** `backend/queries/volunteer_workers.sql`

```sql
-- name: CreateVolunteerWorker :one
INSERT INTO volunteer_workers (user_id, display_name, capabilities)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetVolunteerWorkerByID :one
SELECT * FROM volunteer_workers WHERE id = $1;

-- name: GetVolunteerWorkerByToken :one
SELECT * FROM volunteer_workers
WHERE api_token = $1 AND status = 'active'
LIMIT 1;

-- name: ListVolunteerWorkers :many
SELECT * FROM volunteer_workers
ORDER BY created_at DESC;

-- name: ApproveVolunteerWorker :one
UPDATE volunteer_workers
SET status = 'active',
    api_token = $2,
    approved_at = now(),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: RejectVolunteerWorker :one
UPDATE volunteer_workers
SET status = 'rejected',
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateWorkerHeartbeat :one
UPDATE volunteer_workers
SET last_seen_at = now(),
    cpu_usage = $2,
    ram_usage = $3,
    updated_at = now()
WHERE api_token = $1
RETURNING *;

-- name: ClaimJob :one
UPDATE volunteer_workers
SET current_job_id = $2,
    job_claimed_at = now(),
    updated_at = now()
WHERE api_token = $1
RETURNING *;

-- name: CompleteJob :one
UPDATE volunteer_workers
SET current_job_id = NULL,
    job_claimed_at = NULL,
    jobs_completed = jobs_completed + 1,
    last_seen_at = now(),
    updated_at = now()
WHERE api_token = $1
RETURNING *;

-- name: FailJob :one
UPDATE volunteer_workers
SET current_job_id = NULL,
    job_claimed_at = NULL,
    jobs_failed = jobs_failed + 1,
    last_seen_at = now(),
    updated_at = now()
WHERE api_token = $1
RETURNING *;

-- name: ListStaleClaims :many
-- Tìm workers claim job quá lâu (dùng để timeout/reclaim)
SELECT * FROM volunteer_workers
WHERE current_job_id IS NOT NULL
  AND job_claimed_at < $1;

-- name: ForceReleaseJob :one
UPDATE volunteer_workers
SET current_job_id = NULL,
    job_claimed_at = NULL,
    jobs_failed = jobs_failed + 1,
    updated_at = now()
WHERE id = $1
RETURNING *;
```

## Implementation Steps

1. Tạo file migration `backend/migrations/20260531224000_volunteer_workers.sql`
2. Tạo file queries `backend/queries/volunteer_workers.sql`
3. Chạy `sqlc generate` trong `backend/`
4. Verify generated code trong `backend/db/volunteer_workers.sql.go`
5. Check `backend/db/querier.go` đã có các method mới

## Todo

- [ ] Tạo migration file
- [ ] Tạo queries file
- [ ] Run `sqlc generate`
- [ ] Verify generated code compiles (`go build ./...`)

## Success Criteria

- `sqlc generate` không lỗi
- `go build ./...` pass
- Migration apply được trên DB test
