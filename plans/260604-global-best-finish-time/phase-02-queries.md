# Phase 02 — SQL Queries

## Files

| Action | File | Mô tả |
|--------|------|--------|
| modify | `backend/queries/volunteer_workers.sql` | Thêm queries |
| run    | `sqlc generate` | Sinh Go code |

## Queries cần thêm

### 1. GetAllActiveWorkersWithEarliestAvailable
Trả về tất cả active workers kèm thời điểm rảnh sớm nhất.

```sql
-- name: GetAllActiveWorkersWithEarliestAvailable :many
-- Returns all active workers and when they will next be free.
-- predicted_finish_at = NULL means worker is free now (no active claims),
-- or their claim has no predicted finish (treat as available after timeout).
SELECT
    w.id,
    w.capabilities,
    w.max_workers,
    -- Earliest time this worker could take a new slot
    -- If worker has free slots (active_claims < max_workers) → available now
    -- Otherwise → min(predicted_finish_at) of current claims
    CASE
        WHEN COUNT(c.id) < w.max_workers THEN now()
        ELSE MIN(COALESCE(c.predicted_finish_at, now() + interval '20 minutes'))
    END AS earliest_available_at
FROM volunteer_workers w
LEFT JOIN volunteer_worker_claims c ON c.worker_id = w.id
WHERE w.status = 'active'
GROUP BY w.id, w.capabilities, w.max_workers;
```

### 2. Update CreateWorkerClaim — thêm predicted_finish_at

```sql
-- name: CreateWorkerClaim :one
INSERT INTO volunteer_worker_claims (worker_id, submission_id, predicted_finish_at)
VALUES ($1, $2, $3)
RETURNING *;
```

(Sửa từ query hiện tại không có predicted_finish_at)

## Sau khi thêm queries

```bash
cd backend && sqlc generate
```

Cần update mock.go nếu có method mới.

## Success Criteria

- [ ] `GetAllActiveWorkersWithEarliestAvailable` query hoạt động
- [ ] `CreateWorkerClaim` nhận thêm `predicted_finish_at`
- [ ] sqlc generate thành công
- [ ] mock.go updated
