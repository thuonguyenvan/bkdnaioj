# Phase 01 — DB Migration: predicted_finish_at

## Mục tiêu

Thêm cột `predicted_finish_at` vào `volunteer_worker_claims` để biết khi nào
một busy worker sẽ rảnh.

## Files

| Action | File | Mô tả |
|--------|------|--------|
| create | `backend/migrations/20260604200000_add_predicted_finish_at.sql` | Migration |

## SQL

```sql
-- +goose Up
ALTER TABLE volunteer_worker_claims
    ADD COLUMN predicted_finish_at TIMESTAMPTZ;

-- Index để query nhanh "workers sẽ rảnh lúc nào"
CREATE INDEX idx_vwc_predicted_finish ON volunteer_worker_claims(predicted_finish_at)
    WHERE predicted_finish_at IS NOT NULL;

-- +goose Down
ALTER TABLE volunteer_worker_claims DROP COLUMN IF EXISTS predicted_finish_at;
DROP INDEX IF EXISTS idx_vwc_predicted_finish;
```

## Lưu ý

- Nullable vì old claims chưa có giá trị này
- NULL = không biết khi nào xong → coi như rảnh sau `now + timeout`

## Success Criteria

- [ ] Migration file tạo thành công
- [ ] Chạy trên Supabase qua direct connection port 5432
