# Phase 01 — Prometheus Metrics

**Nhóm:** B - Hạ tầng thực nghiệm  
**Effort:** 2h  
**Priority:** Làm đầu tiên — không có metrics thì không chứng minh được các cải tiến khác

## Overview

Thêm Prometheus metrics vào Go API để đo các chỉ số hiệu năng thực tế. Đây là nền tảng để có số liệu p50/p95/p99 latency, throughput, queue depth cho các phần còn lại.

## Files cần sửa / tạo

| Action | File | Mô tả |
|--------|------|--------|
| modify | `backend/cmd/api/main.go` | Thêm Prometheus HTTP endpoint `/metrics` |
| create | `backend/internal/metrics/metrics.go` | Định nghĩa tất cả metrics |
| modify | `backend/internal/queue/leaderboard_bridge.go` | Ghi `leaderboard_recompute_duration` |
| modify | `backend/internal/http/handlers/volunteer_workers.go` | Ghi `job_claim_duration`, `worker_active_claims` |
| modify | `backend/internal/queue/producer.go` | Ghi `queue_depth` |
| modify | `backend/go.mod` + `go.sum` | Thêm `prometheus/client_golang` |

## Metrics cần thêm

```go
// backend/internal/metrics/metrics.go

var (
    // Leaderboard recompute duration (histogram)
    LeaderboardRecomputeDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "olpai_leaderboard_recompute_duration_seconds",
            Help:    "Duration of full leaderboard recompute",
            Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
        },
        []string{"type"}, // "task_phase" | "contest_phase"
    )

    // Queue depth (gauge)
    QueueDepth = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "olpai_queue_depth",
            Help: "Number of pending jobs in Redis stream",
        },
        []string{"stream"}, // "jobs:judge" | "jobs:judge:light" | etc.
    )

    // Job claim duration (histogram) — từ enqueue đến worker claim
    JobClaimDuration = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name:    "olpai_job_claim_duration_seconds",
            Help:    "Time from job enqueue to worker claim",
            Buckets: []float64{.1, .5, 1, 2, 5, 10, 30, 60},
        },
    )

    // Worker active claims (gauge per worker)
    WorkerActiveClaims = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "olpai_worker_active_claims",
            Help: "Number of active job claims per worker",
        },
        []string{"worker_id"},
    )

    // Submissions processed total (counter)
    SubmissionsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "olpai_submissions_total",
            Help: "Total submissions processed",
        },
        []string{"status"}, // "done" | "failed"
    )

    // [Phase 03 dependency] Scheduler decision duration
    SchedulerDecisionDuration = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name:    "olpai_scheduler_decision_duration_seconds",
            Help:    "Time for cost function to select best job for a worker",
            Buckets: []float64{.001, .005, .01, .05, .1, .5},
        },
    )

    // [Phase 03 dependency] Actual job runtime (để tính EMA correction factor)
    JobActualRuntime = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "olpai_job_actual_runtime_seconds",
            Help:    "Actual wall-clock runtime per job (phase_key x is_final)",
            Buckets: []float64{5, 10, 30, 60, 120, 300, 600},
        },
        []string{"phase_key", "is_final"},
    )

    // [Phase 03 dependency] Prediction error ratio (actual/predicted)
    SchedulerPredictionErrorRatio = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "olpai_scheduler_prediction_error_ratio",
            Help:    "actual_runtime / predicted_runtime per job group",
            Buckets: []float64{0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0},
        },
        []string{"phase_key", "is_final"},
    )
)
```

## Implementation Steps

### 1. Thêm dependency
```bash
cd backend
go get github.com/prometheus/client_golang/prometheus
go get github.com/prometheus/client_golang/prometheus/promhttp
```

### 2. Tạo `backend/internal/metrics/metrics.go`
- Định nghĩa tất cả metrics như trên
- Hàm `Register()` để register với default registry

### 3. Sửa `main.go`
```go
import "github.com/prometheus/client_golang/prometheus/promhttp"

// Trong setup router:
e.GET("/metrics", echo.WrapHandler(promhttp.Handler()))

// Gọi metrics.Register() khi khởi động
```

### 4. Wrap `recomputeTaskPhase` và `recomputeContestPhase`
```go
// leaderboard_bridge.go — bao quanh Exec bằng timer:
start := time.Now()
_, err = b.pool.Exec(ctx, query, ...)
metrics.LeaderboardRecomputeDuration.WithLabelValues("task_phase").
    Observe(time.Since(start).Seconds())
```

### 5. Ghi queue depth sau mỗi enqueue
```go
// producer.go — sau XAdd:
length, _ := p.rdb.XLen(ctx, StreamJobsJudge).Result()
metrics.QueueDepth.WithLabelValues(StreamJobsJudge).Set(float64(length))
```

### 6. Ghi worker_active_claims trong NextJob
```go
// volunteer_workers.go — sau CountWorkerActiveClaims:
metrics.WorkerActiveClaims.WithLabelValues(worker.ID.String()).Set(float64(activeClaims))
```

### 7. Ghi job_claim_duration
- Thêm `EnqueuedAt` vào `JudgeEnvelope` (đã có trong struct)
- Trong `NextJob()`, khi claim thành công: `Observe(time.Since(envelope.EnqueuedAt).Seconds())`

## Thực nghiệm với metrics

Sau khi có metrics, chạy load test script để thu thập số liệu:

```bash
# Chạy API với metrics
curl http://localhost:8080/metrics | grep olpai_

# Dùng wrk hoặc script Python để inject 100 submissions
# Quan sát:
# - olpai_leaderboard_recompute_duration_seconds (trước/sau Phase 4)
# - olpai_queue_depth (trước/sau Phase 5)
# - olpai_job_claim_duration_seconds (trước/sau Phase 3)
```

## Success Criteria

- [ ] `/metrics` endpoint trả về dữ liệu Prometheus
- [ ] `olpai_leaderboard_recompute_duration_seconds` có histogram với p50/p95
- [ ] `olpai_queue_depth` cập nhật real-time
- [ ] `olpai_worker_active_claims` hiển thị per-worker
- [ ] Số liệu có thể dùng để so sánh trước/sau các phase khác
