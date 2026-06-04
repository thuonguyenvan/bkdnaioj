package scheduler

import (
	"math"
	"time"
)

// ExecutionPlan is the result of estimating T(i,j) for a worker-job pair.
type ExecutionPlan struct {
	RuntimeSeconds    float64
	HardConstraintsOK bool
	FailReason        string
	ExecutionPath     string // "cpu" (GPU path reserved for future)
}

// safeDivide returns 0 when divisor is 0 (capability not yet benchmarked).
func safeDivide(a, b float64) float64 {
	if b <= 0 {
		return 0
	}
	return a / b
}

// EstimateRuntime computes T(i,j) = T_download + T_unpack + T_setup + T_run.
//
// Stage breakdown (Section 7 of design doc):
//   - T_download: network_bytes / download_speed
//   - T_unpack:   max(unzip_time, disk_write_time)  — Section 7.2
//   - T_setup:    docker_startup (only for final jobs, bare subprocess for output-only)
//   - T_run:      cpu_ops / effective_cpu_per_slot
//
// Multi-worker: when MaxParallelJobs > 1, CPU and disk are shared across slots.
// We use effective_capacity = total_capacity / MaxParallelJobs (conservative: assume all slots full).
// RAM constraint uses per-slot quota: AvailableRAMBytes / MaxParallelJobs.
func EstimateRuntime(w *WorkerProfile, d *JobDemand) ExecutionPlan {
	// Hard constraints
	if !w.SandboxPassed {
		return ExecutionPlan{HardConstraintsOK: false, FailReason: "no_sandbox"}
	}
	if w.CPUOpsPerSec <= 0 {
		return ExecutionPlan{HardConstraintsOK: false, FailReason: "no_benchmark"}
	}

	// Scale capacity by parallel slots (conservative: assume all slots will be occupied)
	slots := math.Max(1, float64(w.MaxParallelJobs))
	effectiveCPU   := w.CPUOpsPerSec / slots
	effectiveDiskW := w.DiskWriteBytesPerSec / slots
	effectiveUnzip := w.UnzipBytesPerSec / slots
	// Download is typically network-bound (separate NIC), less contended — keep full speed
	effectiveDownload := w.NetworkDownloadBytesPerSec
	// RAM: each slot gets an equal share of available RAM
	ramPerSlot := w.AvailableRAMBytes / int64(slots)

	if d.RAMBytes > ramPerSlot {
		return ExecutionPlan{HardConstraintsOK: false, FailReason: "insufficient_ram"}
	}

	tDownload := safeDivide(float64(d.NetworkBytes), effectiveDownload)

	// T_unpack = max(cpu_decompress_time, disk_write_time) — Section 7.2
	var tUnpack float64
	if d.UnzipBytes > 0 {
		tUnpackCPU  := safeDivide(float64(d.UnzipBytes), effectiveUnzip)
		tUnpackDisk := safeDivide(float64(d.UnzipBytes), effectiveDiskW)
		tUnpack = math.Max(tUnpackCPU, tUnpackDisk)
	}

	// Docker only used for final jobs (runner.py run_final)
	tSetup := 0.0
	if d.IsFinal {
		tSetup = w.DockerStartupSeconds
	}

	tRun := safeDivide(d.CPUOps, effectiveCPU)

	total := tDownload + tUnpack + tSetup + tRun
	return ExecutionPlan{HardConstraintsOK: true, RuntimeSeconds: total, ExecutionPath: "cpu"}
}

// Cost is the lexicographic tuple used to rank worker-job pairs.
//
// Full design (Section 15): (timeout_violation, finish_delay, stress, waste, created_at)
// V1 omits `waste` — requires global scarcity view across all workers (future work).
type Cost struct {
	TimeoutViolation int     // 0 or 1
	FinishDelay      float64 // estimated seconds until job completes
	Stress           float64 // max resource utilization ratio
	CreatedAt        time.Time
}

// LessThan implements lexicographic comparison.
func (a Cost) LessThan(b Cost) bool {
	if a.TimeoutViolation != b.TimeoutViolation {
		return a.TimeoutViolation < b.TimeoutViolation
	}
	if math.Abs(a.FinishDelay-b.FinishDelay) > 0.1 {
		return a.FinishDelay < b.FinishDelay
	}
	if math.Abs(a.Stress-b.Stress) > 0.01 {
		return a.Stress < b.Stress
	}
	return a.CreatedAt.Before(b.CreatedAt)
}

// ComputeStress returns max(time_stress, ram_stress).
//
// time_stress   = T(i,j) / timeout   (Section 11.1)
// ram_stress    = ram_demand / available_ram  (Section 11.2)
func ComputeStress(w *WorkerProfile, d *JobDemand, plan ExecutionPlan) float64 {
	timeoutStress := safeDivide(plan.RuntimeSeconds, float64(d.TimeoutSecs))
	ramStress := safeDivide(float64(d.RAMBytes), float64(w.AvailableRAMBytes))
	return math.Max(timeoutStress, ramStress)
}
