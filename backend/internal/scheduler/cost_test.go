package scheduler

import (
	"testing"

	"github.com/google/uuid"
)

func TestComputeGPUWasteDependsOnScarcity(t *testing.T) {
	gpuWorker := WorkerAvailability{
		Profile: &WorkerProfile{
			WorkerID:          uuid.New(),
			CPUOpsPerSec:      1_000_000,
			GPUFp32OpsPerSec:  100_000_000_000,
			MaxInferenceSlots: 1,
			MaxOutputSlots:    4,
		},
	}
	outputDemand := &JobDemand{CPUOps: 500_000, RAMBytes: 1, TimeoutSecs: 60}
	outputPlan := ExecutionPlan{HardConstraintsOK: true, RuntimeSeconds: 1, ExecutionPath: "cpu"}

	noScarcity := ComputeGPUScarcity([]WorkerAvailability{gpuWorker}, []*JobDemand{outputDemand})
	if noScarcity != 0 {
		t.Fatalf("expected no scarcity without final GPU demand, got %v", noScarcity)
	}
	if waste := ComputeGPUWaste(gpuWorker.Profile, outputDemand, outputPlan, noScarcity); waste != 0 {
		t.Fatalf("expected no waste without scarcity, got %v", waste)
	}

	finalDemand := &JobDemand{IsFinal: true, GPUOps: 200_000_000_000, RAMBytes: 1, TimeoutSecs: 60}
	scarcity := ComputeGPUScarcity([]WorkerAvailability{gpuWorker}, []*JobDemand{finalDemand, outputDemand})
	if scarcity <= 0 {
		t.Fatalf("expected positive scarcity with final GPU demand, got %v", scarcity)
	}
	if waste := ComputeGPUWaste(gpuWorker.Profile, outputDemand, outputPlan, scarcity); waste <= 0 {
		t.Fatalf("expected positive waste for CPU job on GPU worker, got %v", waste)
	}
}
