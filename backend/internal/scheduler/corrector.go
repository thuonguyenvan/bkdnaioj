package scheduler

import (
	"context"
	"math"

	"github.com/mank1/olpai-backend/db"
)

// Corrector applies EMA-based correction to T0 estimates using job_execution_logs.
//
// Two-Layer Estimator (design doc Section 7A):
//   Layer 1 — T0: deterministic estimate from benchmark (EstimateRuntime)
//   Layer 2 — Correction: T(i,j) = T0 × correction_factor(phase_key, is_final)
//
// correction_factor = median(actual_runtime / predicted_runtime) over last 7 days.
// Falls back to 1.0 when < 3 samples exist (cold start).
type Corrector struct {
	q db.Querier
}

// NewCorrector creates a Corrector backed by the given Querier.
func NewCorrector(q db.Querier) *Corrector {
	return &Corrector{q: q}
}

// CorrectedRuntime returns T0 × correction_factor.
// phaseKey is the phase UUID string used as grouping key (simple, no schema change needed).
func (c *Corrector) CorrectedRuntime(
	ctx context.Context,
	w *WorkerProfile,
	d *JobDemand,
	phaseKey string,
) (float64, float64) {
	plan := EstimateRuntime(w, d)
	if !plan.HardConstraintsOK {
		return 0, 1.0
	}
	t0 := plan.RuntimeSeconds

	row, err := c.q.GetCorrectionFactor(ctx, db.GetCorrectionFactorParams{
		PhaseKey: phaseKey,
		IsFinal:  d.IsFinal,
	})
	if err != nil || row.SampleCount < 3 {
		return t0, 1.0 // cold start: use raw T0
	}

	factor := row.CorrectionFactor
	if factor <= 0 {
		factor = 1.0
	}
	return t0 * factor, factor
}

// ChooseAlpha computes EMA alpha = 2/(N+1) for a window of N recent jobs.
// Design doc Section 19A.1: this gives economic interpretation — estimator
// reacts to approximately the last N jobs.
//
// Recommended N values:
//   N=5  → alpha≈0.33  (responsive, fewer samples needed)
//   N=10 → alpha≈0.18  (balanced)
//   N=20 → alpha≈0.095 (stable, slower to adapt)
func ChooseAlpha(n int) float64 {
	if n <= 0 {
		n = 10
	}
	return 2.0 / float64(n+1)
}

// UpdateEMAErrorRatio computes the new EMA of error_ratio after observing one job.
// oldEMA: previous EMA value (use 1.0 as initial)
// actual, predicted: runtime in seconds
// alpha: from ChooseAlpha(N)
func UpdateEMAErrorRatio(oldEMA, actual, predicted, alpha float64) float64 {
	if predicted <= 0 {
		return oldEMA
	}
	errorRatio := actual / predicted
	// Clamp to [0.1, 10] to prevent runaway from outliers
	errorRatio = math.Max(0.1, math.Min(10.0, errorRatio))
	return (1-alpha)*oldEMA + alpha*errorRatio
}
