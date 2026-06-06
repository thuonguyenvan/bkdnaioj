package scheduler

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// WorkerProfile holds benchmark-measured capabilities of a volunteer worker.
// Fields are parsed from the capabilities JSON stored in volunteer_workers.capabilities.
// JSON structure: { ..., "benchmark": { "cpu_ops_per_sec": N, "sandbox_passed": true, ... } }
type WorkerProfile struct {
	WorkerID             uuid.UUID
	CPUOpsPerSec         float64
	DiskReadBytesPerSec  float64
	DiskWriteBytesPerSec float64
	UnzipBytesPerSec     float64
	// NetworkDownloadBytesPerSec intentionally zero until MinIO benchmark is added
	NetworkDownloadBytesPerSec float64
	DockerStartupSeconds       float64
	SandboxPassed              bool
	NativeFinalAllowed         bool
	AvailableRAMBytes          int64
	AvailableDiskBytes         int64
	MaxParallelJobs            int
	MaxOutputSlots             int
	MaxInferenceSlots          int
	ExclusiveInference         bool
	// GPU fields — non-zero only on NVIDIA workers with torch+CUDA benchmark
	GPUFp32OpsPerSec   float64
	AvailableVRAMBytes int64
}

// ParseWorkerProfile parses capabilities JSON → WorkerProfile.
// benchmark fields are nested under caps["benchmark"].
func ParseWorkerProfile(workerID uuid.UUID, capsJSON []byte, maxWorkers int) (*WorkerProfile, error) {
	var caps map[string]any
	if err := json.Unmarshal(capsJSON, &caps); err != nil {
		return nil, err
	}
	bench, _ := caps["benchmark"].(map[string]any)

	getF := func(m map[string]any, k string) float64 {
		if m == nil {
			return 0
		}
		v, _ := m[k].(float64)
		return v
	}
	getBool := func(m map[string]any, k string) bool {
		if m == nil {
			return false
		}
		v, _ := m[k].(bool)
		return v
	}
	getInt := func(m map[string]any, k string) int {
		if m == nil {
			return 0
		}
		v, _ := m[k].(float64)
		return int(v)
	}
	maxOutputSlots := getInt(caps, "max_output_slots")
	if maxOutputSlots <= 0 {
		maxOutputSlots = maxWorkers
	}
	maxInferenceSlots := getInt(caps, "max_inference_slots")
	if maxInferenceSlots <= 0 {
		maxInferenceSlots = maxWorkers // default: same capacity as output slots
	}

	return &WorkerProfile{
		WorkerID:             workerID,
		CPUOpsPerSec:         getF(bench, "cpu_ops_per_sec"),
		DiskReadBytesPerSec:  getF(bench, "disk_read_bytes_per_sec"),
		DiskWriteBytesPerSec: getF(bench, "disk_write_bytes_per_sec"),
		UnzipBytesPerSec:     getF(bench, "unzip_bytes_per_sec"),
		DockerStartupSeconds: getF(bench, "docker_startup_seconds"),
		SandboxPassed:        getBool(bench, "sandbox_passed"),
		NativeFinalAllowed:   getBool(caps, "native_final_allowed"),
		AvailableRAMBytes:    int64(getF(caps, "available_ram_bytes")),
		AvailableDiskBytes:   int64(getF(caps, "available_disk_bytes")),
		MaxParallelJobs:      maxWorkers,
		MaxOutputSlots:       maxOutputSlots,
		MaxInferenceSlots:    maxInferenceSlots,
		ExclusiveInference:   getBool(caps, "exclusive_inference"),
		GPUFp32OpsPerSec:     getF(bench, "gpu_fp32_ops_per_sec"),
		AvailableVRAMBytes:   int64(getF(bench, "available_vram_bytes")),
	}, nil
}

func CanAcceptJob(w *WorkerProfile, activeOutputClaims, activeInferenceClaims int64, isFinal bool) bool {
	if !HasJobSlotCapability(w, isFinal) {
		return false
	}
	if isFinal {
		if activeInferenceClaims >= int64(w.MaxInferenceSlots) {
			return false
		}
		if w.ExclusiveInference && activeOutputClaims > 0 {
			return false
		}
		return true
	}
	if activeOutputClaims >= int64(w.MaxOutputSlots) {
		return false
	}
	if w.ExclusiveInference && activeInferenceClaims > 0 {
		return false
	}
	return true
}

func HasJobSlotCapability(w *WorkerProfile, isFinal bool) bool {
	if isFinal {
		return w.MaxInferenceSlots > 0
	}
	return w.MaxOutputSlots > 0
}

// JobDemand holds estimated resource requirements for a submission.
type JobDemand struct {
	SubmissionID uuid.UUID
	CPUOps       float64
	GPUOps       float64 // 0 for output-only; non-zero for final inference
	RAMBytes     int64
	VRAMBytes    int64 // 0 for output-only; non-zero for final inference
	UnzipBytes   int64 // compressed artifact size (final jobs only)
	NetworkBytes int64 // bytes to download from S3
	IsFinal      bool
	TimeoutSecs  int
	CreatedAt    time.Time
	EntryMode    string // "official" | "virtual" | "practice"
}

// EstimateJobDemand builds a heuristic JobDemand from submission metadata.
// Values are deliberately conservative; will be replaced by median from job_execution_logs
// once history accumulates.
func EstimateJobDemand(
	submissionID uuid.UUID,
	isFinal bool,
	timeoutSecs int,
	createdAt time.Time,
	entryMode string,
	submissionBytes int64,
) *JobDemand {
	if submissionBytes < 0 {
		submissionBytes = 0
	}
	d := &JobDemand{
		SubmissionID: submissionID,
		IsFinal:      isFinal,
		TimeoutSecs:  timeoutSecs,
		CreatedAt:    createdAt,
		EntryMode:    entryMode,
		NetworkBytes: submissionBytes,
	}
	if isFinal {
		d.UnzipBytes = submissionBytes
		d.CPUOps = 5_000_000           // fallback if no GPU
		d.RAMBytes = 512 * 1024 * 1024 // 512 MB
		// GPU demand for model inference — heuristic, replaced by dry-run profile later
		d.GPUOps = 50_000_000_000            // 50 GFLOPS FP32 (typical small model)
		d.VRAMBytes = 4 * 1024 * 1024 * 1024 // 4 GB VRAM heuristic
	} else {
		d.CPUOps = 500_000
		d.RAMBytes = 256 * 1024 * 1024 // 256 MB
		// Output-only: no GPU needed
		d.GPUOps = 0
		d.VRAMBytes = 0
	}
	return d
}
