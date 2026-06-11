package scheduler

import (
	"testing"

	"github.com/google/uuid"
)

func TestImmediateFreeSlotsHonorsTypedExclusiveCapacity(t *testing.T) {
	workers := []WorkerAvailability{
		{
			WorkerID: uuid.New(),
			Profile: &WorkerProfile{
				MaxParallelJobs:    4,
				MaxOutputSlots:     2,
				MaxInferenceSlots:  4,
				ExclusiveInference: true,
			},
			InferenceClaims: 1,
		},
	}

	if got := ImmediateFreeSlots(workers, true); got != 3 {
		t.Fatalf("inference free slots = %d, want 3", got)
	}
	if got := ImmediateFreeSlots(workers, false); got != 0 {
		t.Fatalf("output free slots = %d, want 0 while inference is active", got)
	}
}

func TestImmediateFreeSlotsUsesAllCompatibleWorkers(t *testing.T) {
	workers := []WorkerAvailability{
		{
			WorkerID: uuid.New(),
			Profile: &WorkerProfile{
				MaxParallelJobs:   4,
				MaxOutputSlots:    4,
				MaxInferenceSlots: 0,
			},
			OutputClaims: 1,
		},
		{
			WorkerID: uuid.New(),
			Profile: &WorkerProfile{
				MaxParallelJobs:   2,
				MaxOutputSlots:    2,
				MaxInferenceSlots: 0,
			},
		},
	}

	if got := ImmediateFreeSlots(workers, false); got != 5 {
		t.Fatalf("output free slots = %d, want 5", got)
	}
}
