package scheduler

import (
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
)

// WorkerAvailability holds a worker's profile and when it will next have a free slot.
type WorkerAvailability struct {
	WorkerID            uuid.UUID
	Profile             *WorkerProfile
	EarliestAvailableAt time.Time // now if free slot, else predicted_finish_at of last claim
}

// GlobalBestThreshold: requesting worker's finish time must match the global best.
// Runtime uncertainty is handled by correction factors, not a fixed tolerance.
const GlobalBestThreshold = 1.0

// GlobalBestFinishTime returns the minimum estimated finish time for job demand d
// across all workers (seconds from now). Returns math.MaxFloat64 if no worker can handle d.
func GlobalBestFinishTime(workers []WorkerAvailability, d *JobDemand, now time.Time) float64 {
	best := math.MaxFloat64
	for _, w := range workers {
		plan := EstimateRuntime(w.Profile, d)
		if !plan.HardConstraintsOK {
			continue
		}
		waitSecs := w.EarliestAvailableAt.Sub(now).Seconds()
		if waitSecs < 0 {
			waitSecs = 0
		}
		finish := waitSecs + plan.RuntimeSeconds
		if finish < best {
			best = finish
		}
	}
	return best
}

// IsGloballyBestWorker returns true if assigning job d to the requesting worker
// is at least as good as waiting for any other worker (within GlobalBestThreshold).
//
// Returns true (assign) when:
//   - No other worker can handle the job (fallback).
//   - Requesting worker's finish_time ≤ global_best.
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
	waitSecs := requestingAvailableAt.Sub(now).Seconds()
	if waitSecs < 0 {
		waitSecs = 0
	}
	requestingFinish := waitSecs + plan.RuntimeSeconds

	globalBest := GlobalBestFinishTime(allWorkers, d, now)
	if globalBest == math.MaxFloat64 {
		// No other worker feasible — requesting worker is best by default
		return true
	}

	return requestingFinish <= globalBest*GlobalBestThreshold
}

// BuildWorkerAvailability converts DB rows to WorkerAvailability slice.
// EarliestAvailableAt comes as interface{} from sqlc CASE expression — needs type assertion.
func BuildWorkerAvailability(rows []db.GetAllActiveWorkersWithEarliestAvailableRow) []WorkerAvailability {
	result := make([]WorkerAvailability, 0, len(rows))
	for _, row := range rows {
		profile, err := ParseWorkerProfile(row.ID, row.Capabilities, int(row.MaxWorkers))
		if err != nil {
			continue
		}
		availAt := parseAvailableAt(row.EarliestAvailableAt)
		result = append(result, WorkerAvailability{
			WorkerID:            row.ID,
			Profile:             profile,
			EarliestAvailableAt: availAt,
		})
	}
	return result
}

// parseAvailableAt handles the interface{} from sqlc CASE expression.
// PostgreSQL TIMESTAMPTZ is returned as time.Time by pgx.
func parseAvailableAt(v interface{}) time.Time {
	if v == nil {
		return time.Now()
	}
	switch t := v.(type) {
	case time.Time:
		return t
	default:
		return time.Now()
	}
}
