# Phase 03 — Scheduler: GlobalAvailability

## Files

| Action | File | Mô tả |
|--------|------|--------|
| create | `backend/internal/scheduler/availability.go` | Global best finish time logic |

## Implementation

```go
package scheduler

import (
    "context"
    "math"
    "time"

    "github.com/google/uuid"
    "github.com/mank1/olpai-backend/db"
)

// WorkerAvailability holds a worker's profile and when it will next be free.
type WorkerAvailability struct {
    WorkerID           uuid.UUID
    Profile            *WorkerProfile
    EarliestAvailableAt time.Time // now if free slot exists, else predicted_finish_at
}

// GlobalBestFinishTime computes min(finish_time) across all workers for job demand d.
// Returns math.MaxFloat64 if no worker can handle the job.
func GlobalBestFinishTime(
    workers []WorkerAvailability,
    d *JobDemand,
    now time.Time,
) float64 {
    best := math.MaxFloat64
    for _, w := range workers {
        plan := EstimateRuntime(w.Profile, d)
        if !plan.HardConstraintsOK {
            continue
        }
        // available_time_i = seconds until worker has a free slot
        waitSeconds := w.EarliestAvailableAt.Sub(now).Seconds()
        if waitSeconds < 0 {
            waitSeconds = 0
        }
        finishTime := waitSeconds + plan.RuntimeSeconds
        if finishTime < best {
            best = finishTime
        }
    }
    return best
}

// IsGloballyBestWorker returns true if the requesting worker's finish time
// is within THRESHOLD of the globally best finish time.
// THRESHOLD = 10% — accounts for estimation errors.
const GlobalBestThreshold = 1.10

func IsGloballyBestWorker(
    requestingProfile *WorkerProfile,
    requestingAvailableAt time.Time,
    allWorkers []WorkerAvailability,
    d *JobDemand,
    now time.Time,
) bool {
    plan := EstimateRuntime(requestingProfile, d)
    if !plan.HardConstraintsOK {
        return false
    }
    waitSeconds := requestingAvailableAt.Sub(now).Seconds()
    if waitSeconds < 0 {
        waitSeconds = 0
    }
    requestingFinish := waitSeconds + plan.RuntimeSeconds

    globalBest := GlobalBestFinishTime(allWorkers, d, now)
    if globalBest == math.MaxFloat64 {
        // No other worker can handle this job → requesting worker is best by default
        return true
    }

    return requestingFinish <= globalBest*GlobalBestThreshold
}

// BuildWorkerAvailability converts DB rows to WorkerAvailability slice.
func BuildWorkerAvailability(
    rows []db.GetAllActiveWorkersWithEarliestAvailableRow,
    maxWorkersMap map[uuid.UUID]int,
) []WorkerAvailability {
    result := make([]WorkerAvailability, 0, len(rows))
    for _, row := range rows {
        maxWorkers := maxWorkersMap[row.ID]
        if maxWorkers == 0 {
            maxWorkers = 1
        }
        profile, err := ParseWorkerProfile(row.ID, row.Capabilities, maxWorkers)
        if err != nil {
            continue
        }
        result = append(result, WorkerAvailability{
            WorkerID:            row.ID,
            Profile:             profile,
            EarliestAvailableAt: row.EarliestAvailableAt.Time,
        })
    }
    return result
}
```

## Key Points

- `GlobalBestThreshold = 1.10` — 10% buffer cho estimation error
- Nếu không worker nào handle được job → requesting worker là best by default (fallback)
- `EarliestAvailableAt` từ SQL query: `now()` nếu có free slot, `min(predicted_finish_at)` nếu bận hết

## Success Criteria

- [ ] `availability.go` compile được
- [ ] `IsGloballyBestWorker` trả về false khi CPU worker request final job nhưng GPU worker sẽ rảnh sớm hơn
- [ ] `IsGloballyBestWorker` trả về true khi không có worker nào khác phù hợp
