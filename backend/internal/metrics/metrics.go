package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	// LeaderboardRecomputeDuration — Phase 04: so sánh full vs incremental
	LeaderboardRecomputeDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "olpai_leaderboard_recompute_duration_seconds",
			Help:    "Duration of leaderboard recompute per type",
			Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
		},
		[]string{"type"}, // "task_phase_full" | "task_phase_incremental" | "contest_phase"
	)

	// QueueDepth — monitor backlog
	QueueDepth = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "olpai_queue_depth",
			Help: "Pending jobs in Redis stream",
		},
		[]string{"stream"},
	)

	// JobClaimDuration — Phase 03: so sánh wait time giữa FIFO/Tier/Cost
	JobClaimDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "olpai_job_claim_duration_seconds",
			Help:    "Time from job enqueue to worker claim",
			Buckets: []float64{.1, .5, 1, 2, 5, 10, 30, 60},
		},
		[]string{"strategy", "entry_mode", "is_final"},
		// strategy:   "fifo" | "tier" | "cost"
		// entry_mode: "official" | "virtual" | "practice"
		// is_final:   "true" | "false"
	)

	// WorkerActiveClaims — monitor per-worker load
	WorkerActiveClaims = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "olpai_worker_active_claims",
			Help: "Active job claims per worker",
		},
		[]string{"worker_id"},
	)

	// SubmissionsTotal — throughput counter
	SubmissionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "olpai_submissions_total",
			Help: "Submissions processed by status",
		},
		[]string{"status"}, // "done" | "failed"
	)

	// SchedulerDecisionDuration — Phase 03: overhead của cost function
	SchedulerDecisionDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "olpai_scheduler_decision_duration_seconds",
			Help:    "Time for cost function to select best job",
			Buckets: []float64{.001, .005, .01, .05, .1, .5},
		},
	)

	// JobActualRuntime — Phase 03: feed vào EMA correction factor
	JobActualRuntime = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "olpai_job_actual_runtime_seconds",
			Help:    "Actual wall-clock job runtime",
			Buckets: []float64{5, 10, 30, 60, 120, 300, 600},
		},
		[]string{"phase_key", "is_final", "strategy"},
	)

	// SchedulerPredictionErrorRatio — Phase 03: MAE = mean(|actual/predicted - 1|)
	SchedulerPredictionErrorRatio = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "olpai_scheduler_prediction_error_ratio",
			Help:    "actual_runtime / predicted_runtime per job",
			Buckets: []float64{0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0},
		},
		[]string{"phase_key", "is_final"},
	)

	// JobTimeoutTotal — Phase 03: timeout_rate per strategy
	JobTimeoutTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "olpai_job_timeout_total",
			Help: "Jobs reclaimed by timeout watcher",
		},
		[]string{"strategy"},
	)

	// SchedulerConstraintReject — Phase 03: mismatch detection
	SchedulerConstraintReject = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "olpai_scheduler_constraint_reject_total",
			Help: "Jobs rejected by hard constraint in cost scheduler",
		},
		[]string{"reason"}, // "insufficient_ram" | "no_sandbox" | "no_benchmark"
	)
)

// Register registers all metrics and pre-initializes common label combinations.
// Pre-init ensures metrics appear in /metrics output even before first observation,
// which is required for Prometheus vector metrics (NewHistogramVec, NewGaugeVec, etc.).
func Register() {
	prometheus.MustRegister(
		LeaderboardRecomputeDuration,
		QueueDepth,
		JobClaimDuration,
		WorkerActiveClaims,
		SubmissionsTotal,
		SchedulerDecisionDuration,
		JobActualRuntime,
		SchedulerPredictionErrorRatio,
		JobTimeoutTotal,
		SchedulerConstraintReject,
	)

	// Pre-initialize label combinations so they appear in /metrics before first observation.
	for _, t := range []string{"task_phase_full", "task_phase_incremental", "contest_phase"} {
		LeaderboardRecomputeDuration.WithLabelValues(t)
	}
	for _, s := range []string{"fifo", "cost", "tier"} {
		JobClaimDuration.WithLabelValues(s, "official", "true")
		JobClaimDuration.WithLabelValues(s, "official", "false")
		JobClaimDuration.WithLabelValues(s, "practice", "false")
		JobTimeoutTotal.WithLabelValues(s)
	}
	for _, st := range []string{"done", "failed"} {
		SubmissionsTotal.WithLabelValues(st)
	}
	for _, r := range []string{"insufficient_ram", "no_sandbox", "no_benchmark"} {
		SchedulerConstraintReject.WithLabelValues(r)
	}
	QueueDepth.WithLabelValues("jobs:judge")
}
