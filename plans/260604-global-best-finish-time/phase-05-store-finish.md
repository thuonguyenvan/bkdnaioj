# Phase 05 — Store predicted_finish_at on Claim

## Files

| Action | File | Mô tả |
|--------|------|--------|
| modify | `backend/internal/http/handlers/volunteer_workers.go` | `dispatchJob` — truyền predicted_finish_at |
| run    | Goose migration trên Supabase | Apply phase-01 migration |

## Thay đổi dispatchJob

`dispatchJob` hiện tại:
```go
if _, err := h.q.CreateWorkerClaim(ctx, db.CreateWorkerClaimParams{
    WorkerID:     worker.ID,
    SubmissionID: sub.ID,
}); err != nil { ... }
```

Cần thêm `PredictedFinishAt`:
```go
// Compute predicted finish time for this claim
var predictedFinishAt pgtype.Timestamptz
if predictedRuntime > 0 {
    predictedFinishAt = pgtype.Timestamptz{
        Time:  time.Now().Add(time.Duration(predictedRuntime * float64(time.Second))),
        Valid: true,
    }
}

if _, err := h.q.CreateWorkerClaim(ctx, db.CreateWorkerClaimParams{
    WorkerID:          worker.ID,
    SubmissionID:      sub.ID,
    PredictedFinishAt: predictedFinishAt,
}); err != nil { ... }
```

`predictedRuntime` cần được truyền từ caller (ClaimNext đã tính plan.RuntimeSeconds).

## Truyền runtime từ ClaimNext xuống dispatchJob

Signature `dispatchJob` cần update:
```go
func (h *VolunteerWorkerHandler) dispatchJob(
    c echo.Context, ctx context.Context,
    worker db.VolunteerWorker,
    envelope *queue.JudgeEnvelope,
    msgID string,
    predictedRuntime float64,  // ← thêm param
) error
```

ClaimNext gọi:
```go
return h.dispatchJob(c, ctx, worker, envelope, msgID, correctedRuntime)
```

NextJob (FIFO) gọi với 0 (unknown):
```go
return h.dispatchJob(c, ctx, worker, envelope, msgID, 0)
```

## Deploy

```bash
# Sau khi commit code:
cd backend
DB_URL=$(grep DATABASE_URL ../.env | cut -d= -f2-)
DIRECT=$(echo "$DB_URL" | sed 's/:6543\//:5432\//')
goose -dir migrations postgres "$DIRECT" up

# Server rebuild
ssh root@152.42.237.93 "cd /app/olpai && git pull && docker compose -f docker-compose.prod.yml up -d --build api"
```

## Success Criteria

- [ ] `volunteer_worker_claims.predicted_finish_at` được set khi ClaimNext assigns job
- [ ] `GetAllActiveWorkersWithEarliestAvailable` trả về đúng availability time
- [ ] Migration applied trên Supabase
