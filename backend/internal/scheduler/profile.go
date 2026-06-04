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
	AvailableRAMBytes          int64
	AvailableDiskBytes         int64
	MaxParallelJobs            int
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

	return &WorkerProfile{
		WorkerID:             workerID,
		CPUOpsPerSec:         getF(bench, "cpu_ops_per_sec"),
		DiskReadBytesPerSec:  getF(bench, "disk_read_bytes_per_sec"),
		DiskWriteBytesPerSec: getF(bench, "disk_write_bytes_per_sec"),
		UnzipBytesPerSec:     getF(bench, "unzip_bytes_per_sec"),
		DockerStartupSeconds: getF(bench, "docker_startup_seconds"),
		SandboxPassed:        getBool(bench, "sandbox_passed"),
		AvailableRAMBytes:    int64(getF(caps, "available_ram_bytes")),
		AvailableDiskBytes:   int64(getF(caps, "available_disk_bytes")),
		MaxParallelJobs:      maxWorkers,
	}, nil
}

// JobDemand holds estimated resource requirements for a submission.
type JobDemand struct {
	SubmissionID uuid.UUID
	CPUOps       float64
	RAMBytes     int64
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
) *JobDemand {
	d := &JobDemand{
		SubmissionID: submissionID,
		IsFinal:      isFinal,
		TimeoutSecs:  timeoutSecs,
		CreatedAt:    createdAt,
		EntryMode:    entryMode,
	}
	if isFinal {
		d.UnzipBytes   = 50 * 1024 * 1024  // 50 MB compressed artifact
		d.NetworkBytes = 50 * 1024 * 1024
		d.CPUOps       = 5_000_000
		d.RAMBytes     = 512 * 1024 * 1024 // 512 MB
	} else {
		d.NetworkBytes = 5 * 1024 * 1024 // 5 MB prediction file
		d.CPUOps       = 500_000
		d.RAMBytes     = 256 * 1024 * 1024 // 256 MB
	}
	return d
}
