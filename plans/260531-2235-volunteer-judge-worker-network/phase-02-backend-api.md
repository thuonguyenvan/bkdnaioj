# Phase 02 — Backend API (Go)

**Status:** Pending | **Effort:** 8h | **Depends on:** Phase 01

## Overview

Thêm các HTTP endpoints phục vụ volunteer worker agent và admin. Gồm 2 nhóm:
- **Worker API** (`/api/v1/worker/...`): dùng static token, agent gọi để register/heartbeat/poll-job/submit-result
- **Admin API** (`/api/v1/admin/workers/...`): dùng JWT admin, để duyệt/từ chối/xem danh sách worker

## Endpoint Design

### Worker API (auth: `X-Worker-Token: <token>`)

```
POST /api/v1/worker/register         — đăng ký lần đầu (không cần auth, trả pending worker)
POST /api/v1/worker/heartbeat        — báo sống + resource stats
GET  /api/v1/worker/jobs/next        — poll: lấy 1 job từ Redis stream
POST /api/v1/worker/jobs/:id/result  — nộp kết quả (score hoặc error)
```

### Admin API (auth: JWT + role=admin)

```
GET    /api/v1/admin/workers          — list tất cả workers + trạng thái
GET    /api/v1/admin/workers/:id      — xem chi tiết 1 worker
POST   /api/v1/admin/workers/:id/approve  — duyệt + tạo api_token
POST   /api/v1/admin/workers/:id/reject   — từ chối
DELETE /api/v1/admin/workers/:id      — xóa worker
```

## Key Design Decisions

**Timeout handling:** Background goroutine trong API server, chạy mỗi 60 giây:
- Tìm worker có `job_claimed_at < now() - WORKER_JOB_TIMEOUT` (default 10 phút)
- Release claim trong DB
- Re-enqueue submission về `jobs:judge` stream

**API token generation:** `crypto/rand` 32 bytes → hex encode → 64 char string

**Artifact delivery:** `GET /api/v1/worker/jobs/next` trả về job kèm presigned URLs cho từng artifact. Worker download trực tiếp từ MinIO, không qua API.

**Stale heartbeat detection:** Không cần background job riêng — admin UI hiển thị `last_seen_at`, nếu > 2 phút là "offline".

## Files to Create/Modify

### Create

- `backend/internal/http/handlers/volunteer_workers.go` — handler struct + all methods
- `backend/internal/http/dto/volunteer_workers.go` — request/response DTOs
- `backend/internal/http/middleware/worker_auth.go` — token auth middleware

### Modify

- `backend/internal/http/router.go` — đăng ký 2 nhóm route mới
- `backend/internal/http/deps.go` (hoặc Deps struct) — thêm `Producer` và `Storage` nếu chưa có

## Implementation Detail

### 1. Worker Auth Middleware

**File:** `backend/internal/http/middleware/worker_auth.go`

```go
const CtxWorkerID = "worker_id"

func WorkerAuth(q db.Querier) echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            token := c.Request().Header.Get("X-Worker-Token")
            if token == "" {
                return ErrUnauthorized("missing worker token")
            }
            worker, err := q.GetVolunteerWorkerByToken(c.Request().Context(), &token)
            if err != nil {
                return ErrUnauthorized("invalid worker token")
            }
            c.Set(CtxWorkerID, worker.ID)
            c.Set("worker_token", token)
            return next(c)
        }
    }
}

func GetWorkerToken(c echo.Context) string {
    return c.Get("worker_token").(string)
}
```

### 2. Handler: POST /api/v1/worker/register

```go
// Request
type RegisterWorkerRequest struct {
    DisplayName  string          `json:"display_name" validate:"required,max=120"`
    Capabilities json.RawMessage `json:"capabilities" validate:"required"`
}

// Response: WorkerResponse (id, display_name, status="pending")
func (h *VolunteerWorkerHandler) Register(c echo.Context) error {
    var req dto.RegisterWorkerRequest
    // bind, validate
    worker, err := h.q.CreateVolunteerWorker(ctx, db.CreateVolunteerWorkerParams{
        UserID:       nil,  // optional
        DisplayName:  req.DisplayName,
        Capabilities: req.Capabilities,
    })
    // return 201 với worker info
}
```

### 3. Handler: POST /api/v1/worker/heartbeat

```go
// Request
type HeartbeatRequest struct {
    CPUUsage int `json:"cpu_usage" validate:"min=0,max=100"`
    RAMUsage int `json:"ram_usage" validate:"min=0,max=100"`
}

func (h *VolunteerWorkerHandler) Heartbeat(c echo.Context) error {
    token := mw.GetWorkerToken(c)
    var req dto.HeartbeatRequest
    // bind, validate
    _, err := h.q.UpdateWorkerHeartbeat(ctx, db.UpdateWorkerHeartbeatParams{
        ApiToken: &token,
        CpuUsage: int16(req.CPUUsage),
        RamUsage: int16(req.RAMUsage),
    })
    return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
```

### 4. Handler: GET /api/v1/worker/jobs/next

Đây là endpoint quan trọng nhất.

```go
func (h *VolunteerWorkerHandler) NextJob(c echo.Context) error {
    token := mw.GetWorkerToken(c)

    // 1. Check worker không đang có job khác
    worker, _ := h.q.GetVolunteerWorkerByToken(ctx, &token)
    if worker.CurrentJobID != nil {
        return c.JSON(http.StatusOK, map[string]any{"job": nil, "reason": "already_busy"})
    }

    // 2. Đọc 1 message từ Redis stream (non-blocking, timeout=0)
    envelope, msgID, err := h.streams.ReadOneNonBlocking(ctx, stream, group, consumerName)
    if err != nil || envelope == nil {
        return c.JSON(http.StatusOK, map[string]any{"job": nil})  // no job available
    }

    // 3. Load submission info từ DB
    sub, _ := h.q.GetSubmissionForWorker(ctx, envelope.SubmissionID)

    // 4. Generate presigned URLs cho artifacts
    artifacts, _ := h.buildArtifactURLs(ctx, sub)

    // 5. Claim job trong DB
    h.q.ClaimJob(ctx, db.ClaimJobParams{ApiToken: &token, CurrentJobID: &sub.ID})

    // 6. ACK message từ stream (worker đã nhận)
    h.streams.Ack(ctx, stream, group, msgID)

    // 7. Return job
    return c.JSON(http.StatusOK, dto.JobResponse{
        SubmissionID: sub.ID,
        TaskID:       sub.TaskID,
        PhaseID:      sub.PhaseID,
        IsFinal:      sub.IsFinal,
        JudgeKey:     sub.JudgeKey,
        Context:      buildContextJSON(sub),
        Artifacts:    artifacts,   // [{asset_key, url, expires_in}]
        TimeoutSecs:  600,
    })
}
```

**`buildArtifactURLs`** — tạo presigned GET URLs:
```go
func (h *VolunteerWorkerHandler) buildArtifactURLs(ctx context.Context, sub SubmissionForWorker) ([]dto.ArtifactURL, error) {
    urls := []dto.ArtifactURL{}
    // submission files
    files, _ := h.q.ListSubmissionFiles(ctx, sub.ID)
    for _, f := range files {
        url, _ := h.s3.PresignGet(ctx, f.StoragePath, 30*time.Minute)
        urls = append(urls, dto.ArtifactURL{Type: "submission", Key: f.OriginalFilename, URL: url})
    }
    // evaluation set assets
    assets, _ := h.q.ListEvaluationSetAssets(ctx, sub.EvaluationSetID)
    for _, a := range assets {
        url, _ := h.s3.PresignGet(ctx, a.StoragePath, 30*time.Minute)
        urls = append(urls, dto.ArtifactURL{Type: "asset", Key: a.AssetKey, OriginalFilename: a.OriginalFilename, URL: url})
    }
    // task assets
    taskAssets, _ := h.q.ListTaskAssets(ctx, sub.TaskID)
    for _, a := range taskAssets {
        url, _ := h.s3.PresignGet(ctx, a.StoragePath, 30*time.Minute)
        urls = append(urls, dto.ArtifactURL{Type: "task_asset", Key: a.AssetKey, URL: url})
    }
    return urls, nil
}
```

### 5. Handler: POST /api/v1/worker/jobs/:id/result

```go
type JobResultRequest struct {
    Status       string          `json:"status" validate:"required,oneof=done failed"`
    RawScore     *float64        `json:"raw_score"`
    DisplayScore *float64        `json:"display_score"`
    Payload      json.RawMessage `json:"payload"`
    ErrorMessage *string         `json:"error_message"`
}

func (h *VolunteerWorkerHandler) SubmitResult(c echo.Context) error {
    token := mw.GetWorkerToken(c)
    subID, _ := uuid.Parse(c.Param("id"))
    var req dto.JobResultRequest
    // bind, validate

    if req.Status == "done" {
        h.q.MarkSubmissionDone(ctx, ...)
        h.q.CompleteJob(ctx, db.CompleteJobParams{ApiToken: &token})
        h.streams.EmitResult(ctx, streamResults, subID, "done")
    } else {
        h.q.MarkSubmissionFailed(ctx, subID, *req.ErrorMessage)
        h.q.FailJob(ctx, db.FailJobParams{ApiToken: &token})
        h.streams.EmitResult(ctx, streamResults, subID, "failed")
    }
    return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
```

### 6. Admin Handlers

```go
// GET /api/v1/admin/workers — list all + status
func (h *VolunteerWorkerHandler) AdminList(c echo.Context) error {
    workers, _ := h.q.ListVolunteerWorkers(ctx)
    // return array với online status: last_seen_at > now()-2min → online
}

// POST /api/v1/admin/workers/:id/approve
func (h *VolunteerWorkerHandler) Approve(c echo.Context) error {
    id, _ := uuid.Parse(c.Param("id"))
    token := generateWorkerToken()  // crypto/rand 32 bytes → hex
    worker, _ := h.q.ApproveVolunteerWorker(ctx, db.ApproveVolunteerWorkerParams{
        ID: id, ApiToken: &token,
    })
    // Return token trong response — chỉ hiện 1 lần!
    return c.JSON(http.StatusOK, dto.ApproveResponse{Worker: workerResp, Token: token})
}
```

### 7. Timeout Background Goroutine

**Trong `main.go` của API server**, start goroutine khi server start:

```go
go func() {
    ticker := time.NewTicker(60 * time.Second)
    jobTimeout := 10 * time.Minute
    for range ticker.C {
        staleWorkers, _ := db.ListStaleClaims(ctx, pgtype.Timestamptz{
            Time: time.Now().Add(-jobTimeout), Valid: true,
        })
        for _, w := range staleWorkers {
            if w.CurrentJobID != nil {
                // Re-enqueue submission
                producer.EnqueueJudge(ctx, *w.CurrentJobID, nil)
                // Release claim
                db.ForceReleaseJob(ctx, w.ID)
                log.Warn().Str("worker", w.ID.String()).Str("job", w.CurrentJobID.String()).Msg("timeout: job reclaimed")
            }
        }
    }
}()
```

### 8. Router Registration

**Modify:** `backend/internal/http/router.go`

```go
// Worker API group (static token auth)
workerAPI := api.Group("/worker", mw.WorkerAuth(q))
registerWorkerRoutes(workerAPI, q, store, producer)

// Admin worker management
adminAPI := api.Group("/admin/workers", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
registerAdminWorkerRoutes(adminAPI, q)

// Public: register không cần auth
api.POST("/worker/register", workerHandler.Register)
```

### 9. Storage: Add PresignGet

Hiện tại `storage.S3` có `PresignPut`. Thêm `PresignGet`:

**Modify:** `backend/internal/storage/s3.go`

```go
func (s *S3) PresignGet(ctx context.Context, objectKey string, expires time.Duration) (string, error) {
    // dùng minio SDK PresignedGetObject
}
```

## DTO Shapes

```go
// dto/volunteer_workers.go

type RegisterWorkerRequest struct { DisplayName string; Capabilities json.RawMessage }
type HeartbeatRequest struct { CPUUsage int; RAMUsage int }
type JobResultRequest struct { Status string; RawScore *float64; DisplayScore *float64; Payload json.RawMessage; ErrorMessage *string }

type WorkerResponse struct {
    ID          uuid.UUID  `json:"id"`
    DisplayName string     `json:"display_name"`
    Status      string     `json:"status"`
    Capabilities json.RawMessage `json:"capabilities"`
    LastSeenAt  *time.Time `json:"last_seen_at"`
    Online      bool       `json:"online"`  // computed: last_seen_at > now()-2min
    CurrentJobID *uuid.UUID `json:"current_job_id"`
    JobsCompleted int      `json:"jobs_completed"`
    JobsFailed    int      `json:"jobs_failed"`
    ApprovedAt  *time.Time `json:"approved_at"`
}

type ArtifactURL struct {
    Type             string `json:"type"`     // "submission" | "asset" | "task_asset"
    Key              string `json:"key"`      // asset_key
    OriginalFilename string `json:"original_filename"`
    URL              string `json:"url"`      // presigned GET URL
}

type JobResponse struct {
    SubmissionID uuid.UUID       `json:"submission_id"`
    TaskID       uuid.UUID       `json:"task_id"`
    PhaseID      uuid.UUID       `json:"phase_id"`
    IsFinal      bool            `json:"is_final"`
    JudgeKey     string          `json:"judge_key"`
    Context      json.RawMessage `json:"context"`
    Artifacts    []ArtifactURL   `json:"artifacts"`
    TimeoutSecs  int             `json:"timeout_secs"`
}

type ApproveResponse struct {
    Worker WorkerResponse `json:"worker"`
    Token  string         `json:"token"`  // chỉ hiện 1 lần
}
```

## Todo

- [ ] `middleware/worker_auth.go`
- [ ] `dto/volunteer_workers.go`
- [ ] `handlers/volunteer_workers.go` — Register, Heartbeat, NextJob, SubmitResult
- [ ] `handlers/volunteer_workers.go` — AdminList, AdminGet, Approve, Reject
- [ ] `storage/s3.go` — thêm `PresignGet`
- [ ] `router.go` — đăng ký routes
- [ ] Timeout goroutine trong `cmd/api/main.go`
- [ ] `go build ./...` pass

## Success Criteria

- `POST /worker/register` → 201 với status=pending
- Admin approve → trả token
- Worker dùng token → `GET /worker/jobs/next` trả job hoặc `{"job": null}`
- Worker submit result → submission status update trong DB
- Stale job (> 10 min) → tự động re-enqueue

## Security

- Token không hash trong DB (trusted env), nếu cần hash sau thêm bcrypt
- Register endpoint không cần auth nhưng display_name + capabilities bắt buộc
- Admin token chỉ hiện 1 lần khi approve → admin phải gửi cho volunteer trực tiếp
- Worker chỉ submit result cho `current_job_id` đang claim — validate trong SubmitResult
