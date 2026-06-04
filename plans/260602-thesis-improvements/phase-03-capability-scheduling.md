# Phase 03 — Capability-Aware Scheduling

**Nhóm:** A - Đóng góp chính  
**Effort:** 5h (tăng từ 4h)  
**Priority:** P1  
**Reference:** `measurement_driven_capability_scheduling_detailed_v2.md`

## Tổng quan thiết kế

Thay đổi từ "worker tự pull FIFO từ stream" sang "server chọn job tốt nhất cho từng worker" dựa trên:
- Worker capability vector C_i (đo được từ benchmark)
- Job demand vector D_j (suy ra từ submission metadata)
- Runtime estimate T(i,j) = sum của 6 stages
- Cost function lexicographic

## Gap so với implementation hiện tại

| Hiện tại | Cần thay đổi |
|----------|-------------|
| Worker poll FIFO từ `jobs:judge` stream | Server-side scheduling: `POST /claim-next` |
| Benchmark cho ra ms tuyệt đối | Benchmark cho ra ops/sec, bytes/sec |
| Không có job demand vector | D_j struct với cpu_ops, ram_bytes, network_bytes |
| Không có runtime estimation | T(i,j) = T_download + T_unpack + T_setup + T_run + T_judge |
| So sánh "mismatch_rate" đơn giản | Cost function: (timeout_violation, finish_delay, stress) |

---

## Files cần sửa / tạo

| Action | File | Mô tả |
|--------|------|--------|
| modify | `volunteer-agent/app/cli.py` | Mở rộng `_benchmark()` → worker profile đầy đủ |
| modify | `volunteer-agent/app/capabilities.py` | Thêm `sandbox_passed`, `docker_startup_seconds` |
| modify | `backend/internal/http/handlers/volunteer_workers.go` | Thêm `ClaimNext` handler + refactor `dispatchJob` helper |
| modify | `backend/internal/http/router.go` | Đăng ký route `POST /worker/jobs/claim-next` |
| create | `backend/internal/scheduler/cost.go` | Cost function, T(i,j), stress, hard constraints, safeDivide |
| create | `backend/internal/scheduler/profile.go` | WorkerProfile, JobDemand, ParseWorkerProfile, EstimateJobDemand |
| modify | `backend/internal/queue/producer.go` | Thêm `PeekPendingJobs()` dùng XRANGE |
| modify | `backend/db/queries/submissions.sql` | Update `GetSubmissionForWorker` — JOIN contest_entries để lấy entry_mode |
| modify | `backend/db/queries/volunteer_workers.sql` | Thêm `ListWorkerActiveClaimCounts` (dùng cho Phase 06) |
| create | `backend/migrations/YYYYMMDDHHMMSS_add_job_execution_logs.sql` | Bảng job_execution_logs + index |
| create | `backend/db/queries/job_execution_logs.sql` | GetCorrectionFactor query |
| run    | `cd backend && sqlc generate` | Sinh lại Go code sau mọi thay đổi SQL |
| modify | `volunteer-agent/app/cli.py` | Mở rộng `_benchmark()` → ops/sec, docker_startup, sandbox_passed |
| modify | `volunteer-agent/app/capabilities.py` | Thêm available_ram_bytes, available_disk_bytes |
| modify | `volunteer-agent/app/client.py` | Thêm `claim_next()` method, switch via SCHEDULING_STRATEGY env |
| create | `demo/scheduling_benchmark.py` | So sánh 3 strategies: FIFO / Tier / Cost |

---

## Implementation Steps

### Step 1 — Mở rộng Worker Benchmark

Sửa `_benchmark()` trong [volunteer-agent/app/cli.py:207](../../volunteer-agent/app/cli.py):

```python
def _benchmark() -> dict:
    import math, tempfile, os, time, subprocess
    results = {}

    # CPU: ops/sec (matrix multiply style)
    t = time.perf_counter()
    N = 500_000
    _ = sum(math.sqrt(i) for i in range(N))
    elapsed = time.perf_counter() - t
    results["cpu_ops_per_sec"] = int(N / elapsed)
    results["cpu_sqrt500k_ms"] = round(elapsed * 1000, 1)  # backward compat

    # Memory bandwidth: copy large array
    try:
        import numpy as np
        arr = np.random.rand(10_000_000)  # 80MB
        t = time.perf_counter()
        _ = arr.copy()
        results["memory_bandwidth_bytes_per_sec"] = int(arr.nbytes / (time.perf_counter() - t))
    except ImportError:
        results["memory_bandwidth_bytes_per_sec"] = 0

    # Disk throughput
    data = b"x" * (10 * 1024 * 1024)  # 10MB
    with tempfile.NamedTemporaryFile(delete=False) as f:
        fname = f.name
        t = time.perf_counter()
        f.write(data); f.flush()
        results["disk_write_bytes_per_sec"] = int(len(data) / (time.perf_counter() - t))
    t = time.perf_counter()
    with open(fname, "rb") as f: _ = f.read()
    results["disk_read_bytes_per_sec"] = int(len(data) / (time.perf_counter() - t))
    os.unlink(fname)

    # Unzip throughput
    import zipfile, io
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.bin", os.urandom(5 * 1024 * 1024))  # random = không nén được → realistic
    zip_bytes = zip_buf.getvalue()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as f:
        zfname = f.name; f.write(zip_bytes)
    t = time.perf_counter()
    with zipfile.ZipFile(zfname) as zf: zf.extractall(tempfile.mkdtemp())
    results["unzip_bytes_per_sec"] = int(len(zip_bytes) / (time.perf_counter() - t))
    os.unlink(zfname)

    # Docker startup time — chạy 2 lần, lấy lần 2 (image đã cached)
    try:
        subprocess.run(["docker", "run", "--rm", "hello-world"],
                       capture_output=True, timeout=60)  # warm up / pull
        t = time.perf_counter()
        r = subprocess.run(["docker", "run", "--rm", "hello-world"],
                           capture_output=True, timeout=30)
        results["docker_startup_seconds"] = round(time.perf_counter() - t, 2)
        results["sandbox_passed"] = r.returncode == 0
    except Exception:
        results["docker_startup_seconds"] = -1
        results["sandbox_passed"] = False

    return results
```

Cũng thêm vào `capabilities.collect()`:
```python
"available_disk_bytes": psutil.disk_usage("/").free,
"available_ram_bytes":  psutil.virtual_memory().available,
```

⚠️ **Lưu ý nesting trong capabilities JSON:**  
`cli.py:89` gọi `client.register(name, {**caps, "benchmark": bench_results})` nên JSON structure là:
```json
{
  "cpu_model": "...", "ram_gb": 16,
  "benchmark": {
    "cpu_ops_per_sec": 1000000,
    "sandbox_passed": true,
    "docker_startup_seconds": 2.1
  }
}
```
`ParseWorkerProfile` phải đọc từ `caps["benchmark"]["sandbox_passed"]`, không phải top-level.

---

### Step 2 — Định nghĩa WorkerProfile và JobDemand

```go
// backend/internal/scheduler/profile.go

type WorkerProfile struct {
    WorkerID                   uuid.UUID
    CPUOpsPerSec               float64
    MemoryBandwidthBytesPerSec float64
    DiskReadBytesPerSec        float64
    DiskWriteBytesPerSec       float64
    UnzipBytesPerSec           float64
    NetworkDownloadBytesPerSec float64 // từ heartbeat latency hoặc benchmark
    DockerStartupSeconds       float64
    SandboxPassed              bool
    AvailableRAMBytes          int64
    AvailableVRAMBytes         int64
    AvailableDiskBytes         int64
    MaxParallelJobs            int
    GPUFp32OpsPerSec           float64 // 0 nếu không có GPU
}

// Parse từ volunteer_workers.capabilities JSON
// Lưu ý: benchmark fields nằm trong caps["benchmark"], không phải top-level
func ParseWorkerProfile(workerID uuid.UUID, capsJSON []byte, maxWorkers int) (*WorkerProfile, error) {
    var caps map[string]any
    if err := json.Unmarshal(capsJSON, &caps); err != nil { return nil, err }
    bench, _ := caps["benchmark"].(map[string]any)
    // Helper để đọc float từ nested map
    getF := func(m map[string]any, k string) float64 {
        v, _ := m[k].(float64); return v
    }
    return &WorkerProfile{
        WorkerID:             workerID,
        CPUOpsPerSec:         getF(bench, "cpu_ops_per_sec"),
        DiskReadBytesPerSec:  getF(bench, "disk_read_bytes_per_sec"),
        DiskWriteBytesPerSec: getF(bench, "disk_write_bytes_per_sec"),
        UnzipBytesPerSec:     getF(bench, "unzip_bytes_per_sec"),
        DockerStartupSeconds: getF(bench, "docker_startup_seconds"),
        SandboxPassed:        bench["sandbox_passed"] == true,
        AvailableRAMBytes:    int64(getF(caps, "available_ram_bytes")),
        AvailableDiskBytes:   int64(getF(caps, "available_disk_bytes")),
        MaxParallelJobs:      maxWorkers,
    }, nil
}

type JobDemand struct {
    SubmissionID  uuid.UUID
    CPUOps        float64
    RAMBytes      int64
    UnzipBytes    int64  // = artifact compressed size nếu is_final
    NetworkBytes  int64  // = artifact size (download từ S3)
    IsFinal       bool
    TimeoutSecs   int
    CreatedAt     time.Time
    EntryMode     string // official | virtual | practice
}

// EstimateJobDemand — V1 heuristic dựa trên submission metadata
// artifactSizeBytes lấy từ GetSubmissionForWorker (cần thêm vào query nếu chưa có)
// Hoặc đơn giản hơn: hardcode theo is_final
func EstimateJobDemand(sub db.GetSubmissionForWorkerRow) *JobDemand {
    d := &JobDemand{
        SubmissionID: sub.ID,
        IsFinal:      sub.IsFinal,
        TimeoutSecs:  600, // workerJobTimeoutMinutes * 60
        CreatedAt:    sub.SubmittedAt.Time,
        EntryMode:    string(sub.EntryMode), // cần join contest_entries trong GetSubmissionForWorker query
    }
    if sub.IsFinal {
        // Final: có unzip + inference → nặng hơn
        d.UnzipBytes    = 50 * 1024 * 1024  // assume 50MB artifact
        d.NetworkBytes  = 50 * 1024 * 1024
        d.CPUOps        = 5_000_000         // nhiều ops hơn
        d.RAMBytes      = 512 * 1024 * 1024 // 512MB
    } else {
        // Output-only: chỉ download + judge
        d.NetworkBytes  = 5 * 1024 * 1024   // 5MB prediction file
        d.CPUOps        = 500_000
        d.RAMBytes      = 256 * 1024 * 1024
    }
    return d
    // Sau khi có job_execution_logs: thay heuristic bằng median actual values per phase
}
```

---

### Step 3 — Runtime Estimation T(i,j)

```go
// backend/internal/scheduler/cost.go

type ExecutionPlan struct {
    RuntimeSeconds     float64
    HardConstraintsOK  bool
    FailReason         string
    ExecutionPath      string // "cpu" | "gpu"
}

// safeDivide: trả về 0 nếu b=0 (capability chưa đo được)
// Khi b=0, T_stage=0 → underestimate. Worker có CPUOpsPerSec=0 sẽ bị lọc qua hard constraint riêng.
func safeDivide(a, b float64) float64 {
    if b <= 0 { return 0 }
    return a / b
}

func EstimateRuntime(w *WorkerProfile, d *JobDemand) ExecutionPlan {
    // Hard constraints
    if !w.SandboxPassed {
        return ExecutionPlan{HardConstraintsOK: false, FailReason: "no_sandbox"}
    }
    if d.RAMBytes > w.AvailableRAMBytes {
        return ExecutionPlan{HardConstraintsOK: false, FailReason: "insufficient_ram"}
    }
    if w.CPUOpsPerSec <= 0 {
        // Worker chưa benchmark → không assign job
        return ExecutionPlan{HardConstraintsOK: false, FailReason: "no_benchmark"}
    }

    // T(i,j) = sum của các stages (Section 7 trong design doc)
    tDownload := safeDivide(float64(d.NetworkBytes), w.NetworkDownloadBytesPerSec)

    // T_unpack = max(unzip_time, disk_write_time) — Section 7.2
    // Bottleneck bởi cả CPU decompress lẫn disk write speed
    tUnpackCPU  := safeDivide(float64(d.UnzipBytes), w.UnzipBytesPerSec)
    tUnpackDisk := safeDivide(float64(d.UnzipBytes), w.DiskWriteBytesPerSec) // same bytes written
    tUnpack     := math.Max(tUnpackCPU, tUnpackDisk)
    if d.UnzipBytes == 0 { tUnpack = 0 } // output-only: no unzip

    // Docker chỉ dùng cho final jobs (runner.py run_final), output-only dùng bare subprocess
    tSetup := 0.0
    if d.IsFinal {
        tSetup = w.DockerStartupSeconds
    }
    tRun := safeDivide(d.CPUOps, w.CPUOpsPerSec)
    // tJudge bỏ qua V1 (nhẹ, thường < 5s)

    total := tDownload + tUnpack + tSetup + tRun
    return ExecutionPlan{HardConstraintsOK: true, RuntimeSeconds: total, ExecutionPath: "cpu"}
}

// Stress = max resource utilization ratio
func ComputeStress(w *WorkerProfile, d *JobDemand, plan ExecutionPlan) float64 {
    timeoutStress := plan.RuntimeSeconds / float64(d.TimeoutSecs)
    ramStress := safeDivide(float64(d.RAMBytes), float64(w.AvailableRAMBytes))
    return max(timeoutStress, ramStress)
}

// Cost tuple (lexicographic order) — Section 15 của design doc
// Full: (timeout_violation, finish_delay, stress, waste, created_at)
// V1 bỏ `waste` vì cần global worker view (compute scarcity across all workers)
// V1 cost = (timeout_violation, finish_delay, stress, created_at) — 4 thành phần
type Cost struct {
    TimeoutViolation int     // 0 or 1 — ưu tiên số 1
    FinishDelay      float64 // seconds — ưu tiên số 2
    Stress           float64 // max(time_stress, capacity_stress) — ưu tiên số 3
    // Waste omitted in V1: requires scarcity = queued_demand/available_capacity across all workers
    CreatedAt        time.Time // FIFO tiebreaker — ưu tiên cuối
}

func (a Cost) LessThan(b Cost) bool {
    if a.TimeoutViolation != b.TimeoutViolation { return a.TimeoutViolation < b.TimeoutViolation }
    if math.Abs(a.FinishDelay-b.FinishDelay) > 0.1 { return a.FinishDelay < b.FinishDelay }
    if math.Abs(a.Stress-b.Stress) > 0.01 { return a.Stress < b.Stress }
    return a.CreatedAt.Before(b.CreatedAt)
}
```

---

### Step 4 — Endpoint `/worker/claim-next` (server-side scheduling)

```go
// volunteer_workers.go — thêm endpoint mới
// POST /api/v1/worker/jobs/claim-next

func (h *VolunteerWorkerHandler) ClaimNext(c echo.Context) error {
    token := mw.GetWorkerToken(c)
    ctx := c.Request().Context()

    worker, _ := h.q.GetVolunteerWorkerByToken(ctx, &token)
    
    // Parse worker profile từ capabilities JSON
    profile, err := scheduler.ParseWorkerProfile(worker.ID, worker.Capabilities, worker.MaxWorkers)
    if err != nil || !profile.SandboxPassed {
        return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "sandbox_not_passed"})
    }

    // Capacity check — giữ nguyên như NextJob()
    activeClaims, err := h.q.CountWorkerActiveClaims(ctx, worker.ID)
    if err != nil { return mw.ErrInternal("count claims failed") }
    if activeClaims >= int64(worker.MaxWorkers) {
        return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "at_capacity"})
    }

    // Official-first policy (document Section 2)
    officialActive := isOfficialContestActive(ctx, h.q)

    // Peek 100 pending jobs qua XRANGE (không consume)
    candidates, err := h.producer.PeekPendingJobs(ctx, 100)
    if err != nil || len(candidates) == 0 {
        return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
    }

    var bestMsgID string
    var bestCost *scheduler.Cost

    for _, msg := range candidates {
        var env queue.JudgeEnvelope
        // parse từ msg.Values["payload"]

        sub, err := h.q.GetSubmissionForWorker(ctx, env.SubmissionID)
        if err != nil { continue }

        // Filter 1: Official-first (Section 2)
        if officialActive && sub.EntryMode != "official" { continue }

        // NOTE: Không filter theo phase.close_time ở đây.
        // Job trong stream đã được enqueue hợp lệ trước khi phase đóng → phải chấm.
        // Phase overlap filter (Section 16) chỉ áp dụng khi cần ưu tiên
        // giữa nhiều phase cùng mở, không phải để reject job đã enqueue.

        demand := scheduler.EstimateJobDemand(sub)  // không cần ArtifactSizeHint riêng
        plan := scheduler.EstimateRuntime(profile, demand)
        if !plan.HardConstraintsOK { continue }

        timeoutViolation := 0
        if plan.RuntimeSeconds > float64(demand.TimeoutSecs) { timeoutViolation = 1 }

        cost := &scheduler.Cost{
            TimeoutViolation: timeoutViolation,
            FinishDelay:      plan.RuntimeSeconds,
            Stress:           scheduler.ComputeStress(profile, demand, plan),
            CreatedAt:        env.EnqueuedAt,
        }
        if bestCost == nil || cost.LessThan(*bestCost) {
            bestCost = cost
            bestMsgID = msg.ID
        }
    }

    if bestMsgID == "" {
        return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
    }

    // Race condition handling: XREADGROUP với COUNT=1, nếu không lấy được đúng msg đã chọn
    // → V1 accept best-effort: dequeue job tiếp theo (không nhất thiết phải là bestJob)
    // Lý do: trong context thesis, số workers nhỏ, race condition xảy ra hiếm
    envelope, msgID, err := h.producer.DequeueOne(ctx)
    if err != nil || envelope == nil {
        return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
    }

    // dispatchJob = phần còn lại của NextJob() từ line 120-169 (refactor thành helper)
    return h.dispatchJob(c, ctx, worker, envelope, msgID)
}

// dispatchJob: refactor từ NextJob() lines 120-169
// Dùng chung cho cả /jobs/next (FIFO) và /claim-next (Capability-Aware)
func (h *VolunteerWorkerHandler) dispatchJob(c echo.Context, ctx context.Context,
    worker db.VolunteerWorker, envelope *queue.JudgeEnvelope, msgID string) error {
    
    sub, err := h.q.GetSubmissionForWorker(ctx, envelope.SubmissionID)
    if err != nil {
        _ = h.producer.Ack(ctx, msgID)
        _ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
        return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
    }
    // ... build artifacts, create claim, return response (giữ nguyên từ NextJob)
}
```

**Lưu ý về `PeekPendingJobs`:** Redis Streams không hỗ trợ peek native. Giải pháp:
- Dùng `XRANGE jobs:judge - + COUNT 100` để read không consume
- Sau khi chọn job, dùng `XREADGROUP` để consume đúng message ID đó

---

### Step 5 — EMA Correction Factor (Two-Layer Estimator)

```go
// Sau khi job hoàn thành, ghi actual runtime vào DB
// backend/db/queries: thêm bảng job_execution_logs

CREATE TABLE job_execution_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   uuid NOT NULL,
    worker_id       uuid NOT NULL,
    phase_key       text NOT NULL,
    is_final        boolean NOT NULL,
    predicted_runtime_seconds float4,
    actual_runtime_seconds    float4,
    error_ratio     float4 GENERATED ALWAYS AS (actual_runtime_seconds / NULLIF(predicted_runtime_seconds, 0)) STORED,
    created_at      timestamptz DEFAULT now()
);

-- Query correction factor per group
-- name: GetCorrectionFactor :one
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_ratio) AS median_error_ratio
FROM job_execution_logs
WHERE phase_key = $1 AND is_final = $2
  AND created_at > now() - interval '7 days';
```

Áp dụng vào runtime estimate:
```go
func (s *Scheduler) EstimateRuntimeCorrected(w *WorkerProfile, d *JobDemand, phaseKey string) float64 {
    t0 := EstimateRuntime(w, d).RuntimeSeconds
    factor, err := s.q.GetCorrectionFactor(ctx, phaseKey, d.IsFinal)
    if err != nil || factor <= 0 { return t0 }  // fallback to T0
    return t0 * factor
}
```

---

### Step 6 — Giữ `/jobs/next` làm fallback, switch via agent config

Không xóa endpoint cũ. Worker agent dùng env var để switch:
```bash
SCHEDULING_STRATEGY=fifo   # → GET /api/v1/worker/jobs/next (FIFO, hiện tại)
SCHEDULING_STRATEGY=cost   # → POST /api/v1/worker/jobs/claim-next (Capability-Aware)
```

Benchmark script tắt/bật env var để so sánh từng strategy:
```python
# demo/scheduling_benchmark.py
for strategy in ["fifo", "tier", "cost"]:
    os.environ["SCHEDULING_STRATEGY"] = strategy
    restart_workers()  # Docker Compose restart
    results[strategy] = run_experiment(n_jobs=100, n_rounds=3)
```

Strategy Tier (baseline đơn giản): implement riêng 3 stream light/medium/heavy chỉ để làm **comparison baseline** trong benchmark — không đưa vào production.

---

## Experiment Design (cho báo cáo)

**So sánh 3 strategies:**

| Strategy | Mô tả |
|----------|-------|
| A — FIFO | Hiện tại: worker poll FIFO |
| B — Tier | 3 stream light/medium/heavy (đơn giản) |
| C — Cost | Server-side cost function T(i,j) + stress |

**Setup (Docker Compose local):**
```yaml
worker-light:  deploy: replicas: 2, cpus: '1', mem_limit: 512m
worker-medium: deploy: replicas: 2, cpus: '2', mem_limit: 1g
worker-heavy:  deploy: replicas: 1, cpus: '4', mem_limit: 2g
```

**Workload:** 100 jobs × 3 rounds:
- 60% output-only (nhẹ, ~10s)
- 30% final medium (inference mock ~30s)
- 10% final heavy (inference mock ~90s)

**Metrics:**
- `mismatch_rate`: heavy job vào light worker (OOM risk)
- `avg_wait_time`: p50/p95 từ Prometheus
- `timeout_rate`: jobs bị timeout
- `predicted_vs_actual`: MAE của T(i,j) estimate — tính từ `job_execution_logs`:
  ```sql
  SELECT AVG(ABS(actual_runtime_seconds - predicted_runtime_seconds)) AS mae_seconds,
         AVG(error_ratio) AS mean_error_ratio
  FROM job_execution_logs WHERE is_final = $1;
  ```

**Bảng kỳ vọng:**

| Strategy | Mismatch | p50 Wait | Timeout | MAE T(i,j) |
|----------|----------|----------|---------|------------|
| FIFO | ~30% | — | ~10% | N/A |
| Tier | 0% | +15% | ~2% | N/A |
| Cost | 0% | +5% | ~0% | ~20% |

→ Cost function loại mismatch hoàn toàn, ít tăng wait time hơn Tier, và có thêm metric MAE để đánh giá quality của T(i,j).

---

## Lean V1 Scope — Những gì bỏ qua

| Feature | Lý do bỏ qua |
|---------|-------------|
| GPU scheduling | Không có GPU thực để test |
| Network benchmark (download từ MinIO) | Phức tạp setup, MinIO cần chạy |
| Dry-run profiling | Cần 2-stage submission flow, scope lớn |
| Resource scarcity (waste function) | Cần global worker view phức tạp |
| Phase overlap handling | Hệ thống thường chỉ 1 phase active |

**Giữ cho V1:** T0 estimator + correction_factor từ history + cost (timeout, finish_delay, stress, created_at).

---

## Risk

- **PeekPendingJobs với Redis Streams:** XRANGE không consume, nhưng sau đó cần consume đúng message ID → race condition nếu 2 workers cùng peek. Fix: dùng Lua script atomic hoặc optimistic lock với XREADGROUP + verify.
- **Benchmark network_download_bytes_per_sec:** Phụ thuộc MinIO phải chạy khi setup. Có thể skip và dùng `0` nếu không đo được, T_download sẽ bị bỏ qua.
- **Worker capabilities không update real-time:** `available_ram_bytes` trong profile là tại thời điểm benchmark, không phải real-time. Dùng heartbeat `cpu_usage`/`ram_usage` để adjust.

## Success Criteria

- [ ] `_benchmark()` trả về `cpu_ops_per_sec`, `disk_read/write_bytes_per_sec`, `unzip_bytes_per_sec`, `docker_startup_seconds`, `sandbox_passed`
- [ ] `POST /worker/claim-next` hoạt động với cost function
- [ ] Mismatch rate = 0% cho Cost strategy
- [ ] Benchmark có bảng so sánh 3 strategies (mismatch, p50/p95 wait, timeout rate)
- [ ] `job_execution_logs` ghi actual runtime → correction_factor tính được
- [ ] MAE của T(i,j) estimate được báo cáo
