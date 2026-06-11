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
	OutputClaims        int64
	InferenceClaims     int64
}

// ImmediateFreeSlots returns the number of jobs of one kind that the current
// worker pool can start without waiting for an active claim to finish.
func ImmediateFreeSlots(workers []WorkerAvailability, isFinal bool) int {
	total := 0
	for _, worker := range workers {
		if !CanAcceptJob(worker.Profile, worker.OutputClaims, worker.InferenceClaims, isFinal) {
			continue
		}
		active := worker.OutputClaims + worker.InferenceClaims
		sharedFree := int64(worker.Profile.MaxParallelJobs) - active
		if sharedFree <= 0 {
			continue
		}

		var typedFree int64
		if isFinal {
			typedFree = int64(worker.Profile.MaxInferenceSlots) - worker.InferenceClaims
		} else {
			typedFree = int64(worker.Profile.MaxOutputSlots) - worker.OutputClaims
		}
		if typedFree > sharedFree {
			typedFree = sharedFree
		}
		if typedFree > 0 {
			total += int(typedFree)
		}
	}
	return total
}

// GlobalBestThreshold: requesting worker's finish time must match the global best.
// Runtime uncertainty is handled by correction factors, not a fixed tolerance.
const GlobalBestThreshold = 1.0

// GlobalBestFinishTime returns the minimum estimated finish time for job demand d
// across all workers (seconds from now). Returns math.MaxFloat64 if no worker can handle d.
func GlobalBestFinishTime(workers []WorkerAvailability, d *JobDemand, now time.Time) float64 {
	best := math.MaxFloat64
	for _, w := range workers {
		if !CanAcceptJob(w.Profile, w.OutputClaims, w.InferenceClaims, d.IsFinal) {
			continue
		}
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
			OutputClaims:        int64(row.OutputClaims),
			InferenceClaims:     int64(row.InferenceClaims),
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
