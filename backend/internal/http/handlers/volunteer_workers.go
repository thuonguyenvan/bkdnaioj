package handlers

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/metrics"
	"github.com/mank1/olpai-backend/internal/queue"
	"github.com/mank1/olpai-backend/internal/scheduler"
	"github.com/mank1/olpai-backend/internal/storage"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

const (
	workerJobTimeoutMinutes = 10
	workerLeaseDuration     = 2 * time.Minute
)

type VolunteerWorkerHandler struct {
	q        db.Querier
	s3       *storage.S3
	producer *queue.Producer
	rdb      *redis.Client
	val      *validator.Validate
}

func pgUUID(id uuid.UUID) pgtype.UUID {
	if id == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}

func jsonText(v any) string {
	if v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func (h *VolunteerWorkerHandler) recordExperimentEvent(
	ctx context.Context,
	eventType string,
	submissionID uuid.UUID,
	workerID uuid.UUID,
	attemptID uuid.UUID,
	phaseKey *string,
	isFinal *bool,
	strategy *string,
	payload any,
) {
	if h == nil || h.q == nil {
		return
	}
	if err := h.q.InsertExperimentEvent(ctx, db.InsertExperimentEventParams{
		EventType:    eventType,
		SubmissionID: pgUUID(submissionID),
		WorkerID:     pgUUID(workerID),
		AttemptID:    pgUUID(attemptID),
		PhaseKey:     phaseKey,
		IsFinal:      isFinal,
		Strategy:     strategy,
		Column8:      jsonText(payload),
	}); err != nil {
		log.Warn().Err(err).Str("event_type", eventType).Msg("record experiment event failed")
	}
}

func (h *VolunteerWorkerHandler) recordSchedulerDecision(
	ctx context.Context,
	workerID uuid.UUID,
	selectedSubmissionID uuid.UUID,
	candidatesConsidered int32,
	compatibleCandidates int32,
	rejectedCandidates int32,
	predictedRuntime float64,
	correctedRuntime float64,
	cost *scheduler.Cost,
	rejectSummary map[string]int,
	reason *string,
) {
	if h == nil || h.q == nil {
		return
	}
	var predicted *float32
	if predictedRuntime > 0 {
		v := float32(predictedRuntime)
		predicted = &v
	}
	var corrected *float32
	if correctedRuntime > 0 {
		v := float32(correctedRuntime)
		corrected = &v
	}
	costPayload := map[string]any{}
	if cost != nil {
		costPayload = map[string]any{
			"timeout_violation": cost.TimeoutViolation,
			"finish_delay":      cost.FinishDelay,
			"stress":            cost.Stress,
			"waste":             cost.Waste,
			"created_at":        cost.CreatedAt,
		}
	}
	if err := h.q.InsertSchedulerDecisionLog(ctx, db.InsertSchedulerDecisionLogParams{
		WorkerID:                        workerID,
		SelectedSubmissionID:            pgUUID(selectedSubmissionID),
		Strategy:                        "measurement_driven",
		CandidatesConsidered:            candidatesConsidered,
		CompatibleCandidates:            compatibleCandidates,
		RejectedCandidates:              rejectedCandidates,
		SelectedPredictedRuntimeSeconds: predicted,
		SelectedCorrectedRuntimeSeconds: corrected,
		Column9:                         jsonText(costPayload),
		Column10:                        jsonText(rejectSummary),
		Reason:                          reason,
	}); err != nil {
		log.Warn().Err(err).Str("worker_id", workerID.String()).Msg("record scheduler decision failed")
	}
}

func NewVolunteerWorkerHandler(q db.Querier, s3 *storage.S3, producer *queue.Producer, rdb *redis.Client) *VolunteerWorkerHandler {
	return &VolunteerWorkerHandler{q: q, s3: s3, producer: producer, rdb: rdb, val: validator.New()}
}

// POST /api/v1/worker/register — no auth required
func (h *VolunteerWorkerHandler) Register(c echo.Context) error {
	var req dto.RegisterWorkerRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	if !json.Valid(req.Capabilities) {
		return mw.ErrBadRequest("capabilities must be valid JSON")
	}
	maxWorkers := req.MaxWorkers
	if maxWorkers <= 0 {
		maxWorkers = 1
	}
	worker, err := h.q.CreateVolunteerWorker(c.Request().Context(), db.CreateVolunteerWorkerParams{
		UserID:      pgtype.UUID{},
		DisplayName: req.DisplayName,
		Column3:     string(req.Capabilities), // string → text → jsonb cast in SQL
		MaxWorkers:  maxWorkers,
	})
	if err != nil {
		return mw.ErrInternal("register failed")
	}
	return c.JSON(http.StatusCreated, dto.VolunteerWorkerToResponse(worker))
}

// POST /api/v1/worker/heartbeat — requires X-Worker-Token
func (h *VolunteerWorkerHandler) Heartbeat(c echo.Context) error {
	var req dto.HeartbeatRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	token := mw.GetWorkerToken(c)
	cpu := int16(req.CPUUsage)
	ram := int16(req.RAMUsage)
	if _, err := h.q.UpdateWorkerHeartbeat(c.Request().Context(), db.UpdateWorkerHeartbeatParams{
		ApiToken: &token,
		CpuUsage: &cpu,
		RamUsage: &ram,
	}); err != nil {
		return mw.ErrInternal("heartbeat failed")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// GET /api/v1/worker/jobs/next — requires X-Worker-Token
func (h *VolunteerWorkerHandler) NextJob(c echo.Context) error {
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}
	if h.producer == nil {
		return mw.ErrInternal("queue unavailable")
	}

	token := mw.GetWorkerToken(c)
	ctx := c.Request().Context()

	worker, err := h.q.GetVolunteerWorkerByToken(ctx, &token)
	if err != nil {
		return mw.ErrInternal("fetch worker failed")
	}

	// Check capacity: active claims vs max_workers
	activeClaims, err := h.q.CountWorkerActiveClaims(ctx, worker.ID)
	if err != nil {
		return mw.ErrInternal("count claims failed")
	}
	metrics.WorkerActiveClaims.WithLabelValues(worker.ID.String()).Set(float64(activeClaims))
	if activeClaims >= int64(worker.MaxWorkers) {
		return c.JSON(http.StatusOK, map[string]any{
			"submission_id": nil,
			"reason":        "at_capacity",
			"active":        activeClaims,
			"max":           worker.MaxWorkers,
		})
	}

	envelope, msgID, err := h.producer.DequeueOne(ctx)
	if err != nil || envelope == nil {
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
	}

	sub, err := h.q.GetSubmissionForWorker(ctx, envelope.SubmissionID)
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
	}
	profile, err := scheduler.ParseWorkerProfile(worker.ID, worker.Capabilities, int(worker.MaxWorkers))
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "invalid_capabilities"})
	}
	activeByKind, err := h.q.CountWorkerActiveClaimsByKind(ctx, worker.ID)
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("count typed claims failed")
	}
	if !scheduler.CanAcceptJob(profile, int64(activeByKind.OutputClaims), int64(activeByKind.InferenceClaims), sub.IsFinal) {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "typed_capacity"})
	}

	artifacts, err := h.buildArtifactURLs(ctx, sub)
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("artifact presign failed")
	}

	// Create claim in DB (FIFO path — predicted_finish_at unknown)
	claim, err := h.q.CreateWorkerClaimWithFinish(ctx, db.CreateWorkerClaimWithFinishParams{
		WorkerID:          worker.ID,
		SubmissionID:      sub.ID,
		PredictedFinishAt: pgtype.Timestamptz{}, // not known for FIFO path
		LeaseExpiresAt:    pgtype.Timestamptz{Time: time.Now().Add(workerLeaseDuration), Valid: true},
	})
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("claim job failed")
	}

	_ = h.producer.Ack(ctx, msgID)
	_, _ = h.q.MarkSubmissionRunning(ctx, sub.ID)
	phaseKey := string(sub.PhaseKey)
	isFinal := sub.IsFinal
	strategy := "fifo"
	h.recordExperimentEvent(ctx, "job_claimed", sub.ID, worker.ID, claim.AttemptID, &phaseKey, &isFinal, &strategy, map[string]any{
		"message_id":  msgID,
		"enqueued_at": envelope.EnqueuedAt,
	})
	h.recordExperimentEvent(ctx, "submission_running", sub.ID, worker.ID, claim.AttemptID, &phaseKey, &isFinal, &strategy, nil)

	// Record job claim wait time (enqueue → claim)
	if !envelope.EnqueuedAt.IsZero() {
		isFinal := "false"
		if sub.IsFinal {
			isFinal = "true"
		}
		metrics.JobClaimDuration.
			WithLabelValues("fifo", "unknown", isFinal).
			Observe(time.Since(envelope.EnqueuedAt).Seconds())
	}

	contextJSON, _ := json.Marshal(map[string]any{
		"submission_id":        sub.ID,
		"contest_id":           sub.ContestID,
		"contest_entry_id":     sub.ContestEntryID,
		"task_id":              sub.TaskID,
		"phase_id":             sub.PhaseID,
		"contest_phase_def_id": sub.ContestPhaseDefID,
		"evaluation_set_id":    sub.EvaluationSetID,
		"is_final":             sub.IsFinal,
		"judge_key":            sub.JudgeKey,
		"submission_schema":    json.RawMessage(sub.SubmissionSchema),
	})

	return c.JSON(http.StatusOK, dto.JobResponse{
		SubmissionID: sub.ID,
		AttemptID:    claim.AttemptID,
		TaskID:       sub.TaskID,
		PhaseID:      sub.PhaseID,
		IsFinal:      sub.IsFinal,
		JudgeKey:     sub.JudgeKey,
		Context:      contextJSON,
		Artifacts:    artifacts,
		TimeoutSecs:  workerJobTimeoutMinutes * 60,
	})
}

// POST /api/v1/worker/jobs/claim-next — Capability-Aware Scheduling
// Server selects the best job for this worker using cost function T(i,j).
// Falls back to best-effort FIFO if cost-selected job was already taken (race condition).
func (h *VolunteerWorkerHandler) ClaimNext(c echo.Context) error {
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}
	if h.producer == nil {
		return mw.ErrInternal("queue unavailable")
	}

	token := mw.GetWorkerToken(c)
	ctx := c.Request().Context()

	worker, err := h.q.GetVolunteerWorkerByToken(ctx, &token)
	if err != nil {
		return mw.ErrInternal("fetch worker failed")
	}

	// Capacity check
	activeClaims, err := h.q.CountWorkerActiveClaims(ctx, worker.ID)
	if err != nil {
		return mw.ErrInternal("count claims failed")
	}
	metrics.WorkerActiveClaims.WithLabelValues(worker.ID.String()).Set(float64(activeClaims))
	if activeClaims >= int64(worker.MaxWorkers) {
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "at_capacity"})
	}

	// Parse worker capability profile
	profile, err := scheduler.ParseWorkerProfile(worker.ID, worker.Capabilities, int(worker.MaxWorkers))
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "invalid_capabilities"})
	}
	activeByKind, err := h.q.CountWorkerActiveClaimsByKind(ctx, worker.ID)
	if err != nil {
		return mw.ErrInternal("count typed claims failed")
	}

	// Official-first policy: if any official contest active, only serve official submissions
	officialActive, _ := h.isOfficialContestActive(ctx)

	now := time.Now()

	// Query ALL active workers for global best finish time check (Section 8-9 design doc).
	// Fallback gracefully if query fails — scheduler still works, just without global check.
	workerRows, _ := h.q.GetAllActiveWorkersWithEarliestAvailable(ctx)
	allWorkers := scheduler.BuildWorkerAvailability(workerRows)
	requestingAvailableAt := now // requesting worker has a free slot (capacity check passed above)

	// Peek pending jobs (XRANGE — does not consume)
	start := time.Now()
	candidates, _ := h.producer.PeekPendingJobs(ctx, 100)
	demandsBySubmission := make(map[uuid.UUID]*scheduler.JobDemand, len(candidates))
	queueDemands := make([]*scheduler.JobDemand, 0, len(candidates))
	for _, msg := range candidates {
		payload, ok := msg.Values["payload"].(string)
		if !ok {
			continue
		}
		var env queue.JudgeEnvelope
		if err := json.Unmarshal([]byte(payload), &env); err != nil {
			continue
		}
		sub, err := h.q.GetSubmissionForWorker(ctx, env.SubmissionID)
		if err != nil {
			continue
		}
		demand := scheduler.EstimateJobDemand(
			sub.ID, sub.IsFinal, workerJobTimeoutMinutes*60,
			sub.SubmittedAt.Time, string(sub.EntryMode), sub.TotalSizeBytes,
		)
		h.applyObservedResourceProfile(ctx, demand, string(sub.PhaseKey), sub.IsFinal)
		demandsBySubmission[sub.ID] = demand
		queueDemands = append(queueDemands, demand)
	}
	gpuScarcity := scheduler.ComputeGPUScarcity(allWorkers, queueDemands)

	var bestEnqueuedAt time.Time
	var bestCost *scheduler.Cost
	var bestRuntime float64
	var bestPredictedRuntime float64
	var bestMsgID string
	var bestSubmissionID uuid.UUID
	var candidatesConsidered int32
	var compatibleCandidates int32
	var rejectedCandidates int32
	rejectSummary := map[string]int{}

	for _, msg := range candidates {
		candidatesConsidered++
		payload, ok := msg.Values["payload"].(string)
		if !ok {
			rejectedCandidates++
			rejectSummary["invalid_payload"]++
			continue
		}
		var env queue.JudgeEnvelope
		if err := json.Unmarshal([]byte(payload), &env); err != nil {
			rejectedCandidates++
			rejectSummary["invalid_envelope"]++
			continue
		}

		sub, err := h.q.GetSubmissionForWorker(ctx, env.SubmissionID)
		if err != nil {
			rejectedCandidates++
			rejectSummary["submission_unavailable"]++
			continue
		}

		// Official-first filter
		if officialActive && string(sub.EntryMode) != "official" {
			rejectedCandidates++
			rejectSummary["non_official_filtered"]++
			continue
		}
		if !scheduler.CanAcceptJob(
			profile,
			int64(activeByKind.OutputClaims),
			int64(activeByKind.InferenceClaims),
			sub.IsFinal,
		) {
			metrics.SchedulerConstraintReject.WithLabelValues("typed_capacity").Inc()
			rejectedCandidates++
			rejectSummary["typed_capacity"]++
			continue
		}

		demand := demandsBySubmission[sub.ID]
		if demand == nil {
			demand = scheduler.EstimateJobDemand(
				sub.ID, sub.IsFinal, workerJobTimeoutMinutes*60,
				sub.SubmittedAt.Time, string(sub.EntryMode), sub.TotalSizeBytes,
			)
			h.applyObservedResourceProfile(ctx, demand, string(sub.PhaseKey), sub.IsFinal)
		}
		plan := scheduler.EstimateRuntime(profile, demand)
		if !plan.HardConstraintsOK {
			metrics.SchedulerConstraintReject.WithLabelValues(plan.FailReason).Inc()
			rejectedCandidates++
			rejectSummary[plan.FailReason]++
			continue
		}

		// Apply EMA correction factor (Two-Layer Estimator — Section 7A)
		corrector := scheduler.NewCorrector(h.q)
		correctedRuntime, _ := corrector.CorrectedRuntime(ctx, profile, demand, string(sub.PhaseKey))

		// Global best finish time check (Section 8-9 design doc):
		// Only assign if requesting worker will finish this job at least as fast
		// as any other worker (including busy ones about to become free).
		// Fallback: if allWorkers is empty (query failed), skip this check.
		if len(allWorkers) > 0 {
			if !scheduler.IsGloballyBestWorker(
				profile, requestingAvailableAt, allWorkers, demand, now,
			) {
				// Another worker (e.g. GPU) can finish sooner — skip this job
				rejectedCandidates++
				rejectSummary["not_global_best"]++
				continue
			}
		}
		compatibleCandidates++

		tv := 0
		if correctedRuntime > float64(demand.TimeoutSecs) {
			tv = 1
		}
		cost := &scheduler.Cost{
			TimeoutViolation: tv,
			FinishDelay:      correctedRuntime,
			Stress:           scheduler.ComputeStress(profile, demand, plan),
			Waste:            scheduler.ComputeGPUWaste(profile, demand, plan, gpuScarcity),
			CreatedAt:        env.EnqueuedAt,
		}
		if bestCost == nil || cost.LessThan(*bestCost) {
			bestCost = cost
			bestEnqueuedAt = env.EnqueuedAt
			bestRuntime = correctedRuntime
			bestPredictedRuntime = plan.RuntimeSeconds
			bestMsgID = msg.ID
			bestSubmissionID = sub.ID
		}
	}
	metrics.SchedulerDecisionDuration.Observe(time.Since(start).Seconds())

	if bestCost == nil || bestMsgID == "" {
		reason := "no_compatible_jobs"
		h.recordSchedulerDecision(ctx, worker.ID, uuid.Nil, candidatesConsidered, compatibleCandidates, rejectedCandidates, 0, 0, nil, rejectSummary, &reason)
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "no_compatible_jobs"})
	}

	h.recordSchedulerDecision(ctx, worker.ID, bestSubmissionID, candidatesConsidered, compatibleCandidates, rejectedCandidates, bestPredictedRuntime, bestRuntime, bestCost, rejectSummary, nil)

	envelope, msgID, err := h.producer.ClaimMessage(ctx, bestMsgID)
	if err != nil || envelope == nil {
		reason := "claim_race"
		h.recordSchedulerDecision(ctx, worker.ID, bestSubmissionID, candidatesConsidered, compatibleCandidates, rejectedCandidates, bestPredictedRuntime, bestRuntime, bestCost, rejectSummary, &reason)
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
	}

	// Record claim duration
	enqAt := envelope.EnqueuedAt
	if !bestEnqueuedAt.IsZero() {
		enqAt = bestEnqueuedAt
	}
	if !enqAt.IsZero() {
		isFinal := "false"
		sub0, _ := h.q.GetSubmissionForWorker(ctx, envelope.SubmissionID)
		if sub0.IsFinal {
			isFinal = "true"
		}
		entryMode := string(sub0.EntryMode)
		if entryMode == "" {
			entryMode = "unknown"
		}
		metrics.JobClaimDuration.
			WithLabelValues("cost", entryMode, isFinal).
			Observe(time.Since(enqAt).Seconds())
	}

	return h.dispatchJob(c, ctx, worker, envelope, msgID, bestRuntime)
}

// isOfficialContestActive returns true if any contest is currently running in official mode.
// Lightweight check: looks for any active worker claim on an official submission.
// TODO: replace with a proper contest-level flag query when available.
func (h *VolunteerWorkerHandler) isOfficialContestActive(_ context.Context) (bool, error) {
	// V1: always returns false — official-first not enforced until contest schema supports it
	return false, nil
}

// dispatchJob encapsulates the shared logic for both NextJob and ClaimNext.
// predictedRuntime: estimated seconds to complete (0 = unknown, from FIFO path).
func (h *VolunteerWorkerHandler) dispatchJob(
	c echo.Context, ctx context.Context,
	worker db.VolunteerWorker, envelope *queue.JudgeEnvelope, msgID string,
	predictedRuntime float64,
) error {
	sub, err := h.q.GetSubmissionForWorker(ctx, envelope.SubmissionID)
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil})
	}

	artifacts, err := h.buildArtifactURLs(ctx, sub)
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("artifact presign failed")
	}

	// Store predicted_finish_at for global best finish time scheduling.
	// Used by other workers to know when this worker will next be available.
	var predictedFinishAt pgtype.Timestamptz
	if predictedRuntime > 0 {
		predictedFinishAt = pgtype.Timestamptz{
			Time:  time.Now().Add(time.Duration(predictedRuntime * float64(time.Second))),
			Valid: true,
		}
	}

	claim, err := h.q.CreateWorkerClaimWithFinish(ctx, db.CreateWorkerClaimWithFinishParams{
		WorkerID:          worker.ID,
		SubmissionID:      sub.ID,
		PredictedFinishAt: predictedFinishAt,
		LeaseExpiresAt:    pgtype.Timestamptz{Time: time.Now().Add(workerLeaseDuration), Valid: true},
	})
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("claim job failed")
	}

	_ = h.producer.Ack(ctx, msgID)
	_, _ = h.q.MarkSubmissionRunning(ctx, sub.ID)
	phaseKey := string(sub.PhaseKey)
	isFinal := sub.IsFinal
	strategy := "measurement_driven"
	h.recordExperimentEvent(ctx, "job_claimed", sub.ID, worker.ID, claim.AttemptID, &phaseKey, &isFinal, &strategy, map[string]any{
		"message_id":                msgID,
		"enqueued_at":               envelope.EnqueuedAt,
		"predicted_runtime_seconds": predictedRuntime,
	})
	h.recordExperimentEvent(ctx, "submission_running", sub.ID, worker.ID, claim.AttemptID, &phaseKey, &isFinal, &strategy, nil)

	contextJSON, _ := json.Marshal(map[string]any{
		"submission_id":        sub.ID,
		"contest_id":           sub.ContestID,
		"contest_entry_id":     sub.ContestEntryID,
		"task_id":              sub.TaskID,
		"phase_id":             sub.PhaseID,
		"contest_phase_def_id": sub.ContestPhaseDefID,
		"evaluation_set_id":    sub.EvaluationSetID,
		"is_final":             sub.IsFinal,
		"judge_key":            sub.JudgeKey,
		"submission_schema":    json.RawMessage(sub.SubmissionSchema),
	})

	return c.JSON(http.StatusOK, dto.JobResponse{
		SubmissionID: sub.ID,
		AttemptID:    claim.AttemptID,
		TaskID:       sub.TaskID,
		PhaseID:      sub.PhaseID,
		IsFinal:      sub.IsFinal,
		JudgeKey:     sub.JudgeKey,
		Context:      contextJSON,
		Artifacts:    artifacts,
		TimeoutSecs:  workerJobTimeoutMinutes * 60,
	})
}

// POST /api/v1/worker/jobs/:id/heartbeat — renews the active job lease.
func (h *VolunteerWorkerHandler) JobHeartbeat(c echo.Context) error {
	subID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	var req dto.JobHeartbeatRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	token := mw.GetWorkerToken(c)
	ctx := c.Request().Context()
	worker, err := h.q.GetVolunteerWorkerByToken(ctx, &token)
	if err != nil {
		return mw.ErrInternal("fetch worker failed")
	}
	claim, err := h.q.GetWorkerClaimBySubmission(ctx, subID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrForbidden("not your job")
		}
		return mw.ErrInternal("fetch claim failed")
	}
	if claim.WorkerID != worker.ID {
		return mw.ErrForbidden("not your job")
	}
	if claim.AttemptID != req.AttemptID {
		return mw.ErrForbidden("stale job attempt")
	}
	if _, err := h.q.RenewWorkerClaimLease(ctx, db.RenewWorkerClaimLeaseParams{
		SubmissionID:   subID,
		AttemptID:      req.AttemptID,
		LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(workerLeaseDuration), Valid: true},
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrForbidden("not your job")
		}
		return mw.ErrInternal("renew job lease failed")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/v1/worker/jobs/:id/result — requires X-Worker-Token
func (h *VolunteerWorkerHandler) SubmitResult(c echo.Context) error {
	subID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	var req dto.JobResultRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	token := mw.GetWorkerToken(c)
	ctx := c.Request().Context()

	// Verify this worker owns the claim for this submission
	claim, err := h.q.GetWorkerClaimBySubmission(ctx, subID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrForbidden("not your job")
		}
		return mw.ErrInternal("fetch claim failed")
	}

	worker, err := h.q.GetVolunteerWorkerByToken(ctx, &token)
	if err != nil {
		return mw.ErrInternal("fetch worker failed")
	}
	if claim.WorkerID != worker.ID {
		return mw.ErrForbidden("not your job")
	}
	if claim.AttemptID != req.AttemptID {
		return mw.ErrForbidden("stale job attempt")
	}
	strategy := "fifo"
	if claim.PredictedFinishAt.Valid {
		strategy = "measurement_driven"
	}
	workerSub, subErr := h.q.GetSubmissionForWorker(ctx, subID)
	var phaseKey *string
	var isFinal *bool
	if subErr == nil {
		pk := string(workerSub.PhaseKey)
		phaseKey = &pk
		final := workerSub.IsFinal
		isFinal = &final
	}
	h.recordExperimentEvent(ctx, "result_received", subID, worker.ID, req.AttemptID, phaseKey, isFinal, &strategy, map[string]any{
		"status": req.Status,
	})

	// Capture actual runtime before claim is deleted
	actualRuntime := 0.0
	if claim.ClaimedAt.Valid {
		actualRuntime = time.Since(claim.ClaimedAt.Time).Seconds()
	}

	if req.Status == "done" {
		if req.RawScore == nil || req.DisplayScore == nil {
			return mw.ErrBadRequest("raw_score and display_score required for done status")
		}
		rawScore, err := numericFromFloat(*req.RawScore)
		if err != nil {
			return mw.ErrBadRequest("invalid raw_score")
		}
		dispScore, err := numericFromFloat(*req.DisplayScore)
		if err != nil {
			return mw.ErrBadRequest("invalid display_score")
		}
		payloadText := "null"
		if len(req.Payload) > 0 {
			if !json.Valid(req.Payload) {
				return mw.ErrBadRequest("payload must be valid JSON")
			}
			payloadText = string(req.Payload)
		}
		if _, err := h.q.MarkSubmissionDone(ctx, db.MarkSubmissionDoneParams{
			ID:           subID,
			RawScore:     rawScore,
			DisplayScore: dispScore,
			Column4:      payloadText,
		}); err != nil {
			log.Error().Err(err).Str("submission_id", subID.String()).Msg("mark submission done failed")
			return mw.ErrInternal("mark done failed")
		}
		_, _ = h.q.IncrementWorkerCompleted(ctx, &token)
		_ = h.producer.EnqueueResult(ctx, subID, "done")
		metrics.SubmissionsTotal.WithLabelValues("done").Inc()
		h.recordExperimentEvent(ctx, "result_committed", subID, worker.ID, req.AttemptID, phaseKey, isFinal, &strategy, map[string]any{
			"status":        "done",
			"raw_score":     *req.RawScore,
			"display_score": *req.DisplayScore,
		})
		h.recordExperimentEvent(ctx, "job_finished", subID, worker.ID, req.AttemptID, phaseKey, isFinal, &strategy, map[string]any{
			"status":                 "done",
			"actual_runtime_seconds": actualRuntime,
		})
		h.logExecutionRuntime(ctx, subID, worker, actualRuntime, strategy, req.ExecutionProfile)
	} else {
		errMsg := "judge failed"
		if req.ErrorMessage != nil {
			msg := *req.ErrorMessage
			if len(msg) > 4000 {
				msg = msg[:4000]
			}
			errMsg = msg
		}
		if _, err := h.q.MarkSubmissionFailed(ctx, db.MarkSubmissionFailedParams{
			ID:           subID,
			ErrorMessage: &errMsg,
		}); err != nil {
			log.Error().Err(err).Str("submission_id", subID.String()).Msg("mark submission failed failed")
			return mw.ErrInternal("mark failed failed")
		}
		_, _ = h.q.IncrementWorkerFailed(ctx, &token)
		_ = h.producer.EnqueueResult(ctx, subID, "failed")
		metrics.SubmissionsTotal.WithLabelValues("failed").Inc()
		h.recordExperimentEvent(ctx, "result_committed", subID, worker.ID, req.AttemptID, phaseKey, isFinal, &strategy, map[string]any{
			"status":        "failed",
			"error_message": errMsg,
		})
		h.recordExperimentEvent(ctx, "job_finished", subID, worker.ID, req.AttemptID, phaseKey, isFinal, &strategy, map[string]any{
			"status":                 "failed",
			"actual_runtime_seconds": actualRuntime,
		})
		h.logExecutionRuntime(ctx, subID, worker, actualRuntime, strategy, req.ExecutionProfile)
	}

	if err := h.q.DeleteWorkerClaim(ctx, db.DeleteWorkerClaimParams{
		WorkerID:     worker.ID,
		SubmissionID: subID,
	}); err != nil {
		log.Warn().Err(err).Str("submission_id", subID.String()).Str("worker_id", worker.ID.String()).Msg("delete worker claim after result failed")
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func numericFromFloat(v float64) (pgtype.Numeric, error) {
	var n pgtype.Numeric
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return n, fmt.Errorf("non-finite numeric")
	}
	if err := n.Scan(strconv.FormatFloat(v, 'f', -1, 64)); err != nil {
		return n, err
	}
	return n, nil
}

// GET /api/v1/admin/workers
func (h *VolunteerWorkerHandler) AdminList(c echo.Context) error {
	ctx := c.Request().Context()
	workers, err := h.q.ListVolunteerWorkers(ctx)
	if err != nil {
		return mw.ErrInternal("list workers failed")
	}

	// Single aggregation query instead of 1+N CountWorkerActiveClaims calls
	claimRows, _ := h.q.ListWorkerActiveClaimCounts(ctx)
	claimMap := make(map[uuid.UUID]int64, len(claimRows))
	for _, row := range claimRows {
		claimMap[row.WorkerID] = int64(row.ActiveClaims)
	}

	resp := make([]dto.WorkerResponse, len(workers))
	for i, w := range workers {
		r := dto.VolunteerWorkerToResponse(w)
		r.ActiveJobs = claimMap[w.ID]
		resp[i] = r
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/admin/workers/:id
func (h *VolunteerWorkerHandler) AdminGet(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid worker id")
	}
	worker, err := h.q.GetVolunteerWorkerByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("worker not found")
		}
		return mw.ErrInternal("fetch worker failed")
	}
	r := dto.VolunteerWorkerToResponse(worker)
	if n, err := h.q.CountWorkerActiveClaims(c.Request().Context(), id); err == nil {
		r.ActiveJobs = n
	}
	return c.JSON(http.StatusOK, r)
}

// POST /api/v1/admin/workers/:id/approve
func (h *VolunteerWorkerHandler) AdminApprove(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid worker id")
	}
	token, err := generateWorkerToken()
	if err != nil {
		return mw.ErrInternal("token generation failed")
	}
	worker, err := h.q.ApproveVolunteerWorker(c.Request().Context(), db.ApproveVolunteerWorkerParams{
		ID:       id,
		ApiToken: &token,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("worker not found")
		}
		return mw.ErrInternal("approve failed")
	}
	return c.JSON(http.StatusOK, dto.ApproveWorkerResponse{
		Worker: dto.VolunteerWorkerToResponse(worker),
		Token:  token,
	})
}

// POST /api/v1/admin/workers/:id/reject
func (h *VolunteerWorkerHandler) AdminReject(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid worker id")
	}
	worker, err := h.q.RejectVolunteerWorker(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("worker not found")
		}
		return mw.ErrInternal("reject failed")
	}
	return c.JSON(http.StatusOK, dto.VolunteerWorkerToResponse(worker))
}

// DELETE /api/v1/admin/workers/:id
func (h *VolunteerWorkerHandler) AdminDelete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid worker id")
	}
	if err := h.q.DeleteVolunteerWorker(c.Request().Context(), id); err != nil {
		return mw.ErrInternal("delete failed")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *VolunteerWorkerHandler) buildArtifactURLs(ctx context.Context, sub db.GetSubmissionForWorkerRow) ([]dto.ArtifactURL, error) {
	expiry := 30 * time.Minute
	var artifacts []dto.ArtifactURL

	files, err := h.q.ListSubmissionFilesBySubmission(ctx, sub.ID)
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		u, err := h.s3.PresignGet(ctx, f.StoragePath, expiry)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, dto.ArtifactURL{
			Type:             "submission",
			Key:              f.OriginalFilename,
			OriginalFilename: f.OriginalFilename,
			URL:              u,
			SHA256:           f.HashSha256,
		})
	}

	evalAssets, err := h.q.ListEvaluationSetAssets(ctx, sub.EvaluationSetID)
	if err != nil {
		return nil, err
	}
	for _, a := range evalAssets {
		u, err := h.s3.PresignGet(ctx, a.StoragePath, expiry)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, dto.ArtifactURL{
			Type:             "asset",
			Key:              a.AssetKey,
			OriginalFilename: a.OriginalFilename,
			URL:              u,
			SHA256:           a.HashSha256,
		})
	}

	taskAssets, err := h.q.ListTaskAssets(ctx, sub.TaskID)
	if err != nil {
		return nil, err
	}
	for _, a := range taskAssets {
		u, err := h.s3.PresignGet(ctx, a.StoragePath, expiry)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, dto.ArtifactURL{
			Type:             "task_asset",
			Key:              a.AssetKey,
			OriginalFilename: a.OriginalFilename,
			URL:              u,
			SHA256:           a.HashSha256,
		})
	}

	return artifacts, nil
}

// logExecutionRuntime records actual vs predicted runtime to job_execution_logs
// and emits Prometheus metrics for MAE tracking. Best-effort: errors are ignored.
func (h *VolunteerWorkerHandler) logExecutionRuntime(
	ctx context.Context,
	subID uuid.UUID,
	worker db.VolunteerWorker,
	actualRuntime float64,
	strategy string, // "fifo" | "cost" — which endpoint claimed the job
	executionProfile json.RawMessage,
) {
	if actualRuntime <= 0 {
		return
	}

	sub, err := h.q.GetSubmissionForWorker(ctx, subID)
	if err != nil {
		return
	}

	// Compute T0 using worker profile + heuristic demand
	profile, err := scheduler.ParseWorkerProfile(worker.ID, worker.Capabilities, int(worker.MaxWorkers))
	if err != nil {
		return
	}
	demand := scheduler.EstimateJobDemand(
		sub.ID, sub.IsFinal, workerJobTimeoutMinutes*60,
		sub.SubmittedAt.Time, string(sub.EntryMode), sub.TotalSizeBytes,
	)
	h.applyObservedResourceProfile(ctx, demand, string(sub.PhaseKey), sub.IsFinal)
	plan := scheduler.EstimateRuntime(profile, demand)
	predictedRuntime := plan.RuntimeSeconds

	isFinalStr := "false"
	if sub.IsFinal {
		isFinalStr = "true"
	}
	phaseKey := string(sub.PhaseKey)

	// Insert into job_execution_logs
	predicted32 := float32(predictedRuntime)
	actual32 := float32(actualRuntime)
	peakRAM, peakVRAM, executionPath, profilePayload := parseExecutionProfile(executionProfile)
	if err := h.q.InsertJobExecutionLog(ctx, db.InsertJobExecutionLogParams{
		SubmissionID:            sub.ID,
		WorkerID:                worker.ID,
		PhaseKey:                phaseKey,
		IsFinal:                 sub.IsFinal,
		PredictedRuntimeSeconds: &predicted32,
		ActualRuntimeSeconds:    &actual32,
		PeakRamBytes:            peakRAM,
		PeakVramBytes:           peakVRAM,
		ExecutionPath:           executionPath,
		Column10:                profilePayload,
	}); err != nil {
		log.Warn().Err(err).Str("submission_id", sub.ID.String()).Msg("insert job execution log failed")
	}

	// Emit Prometheus metrics
	metrics.JobActualRuntime.
		WithLabelValues(phaseKey, isFinalStr, strategy).
		Observe(actualRuntime)

	if predictedRuntime > 0 {
		metrics.SchedulerPredictionErrorRatio.
			WithLabelValues(phaseKey, isFinalStr).
			Observe(actualRuntime / predictedRuntime)
	}
}

func (h *VolunteerWorkerHandler) applyObservedResourceProfile(ctx context.Context, demand *scheduler.JobDemand, phaseKey string, isFinal bool) {
	row, err := h.q.GetObservedResourceProfile(ctx, db.GetObservedResourceProfileParams{
		PhaseKey: phaseKey,
		IsFinal:  isFinal,
	})
	if err != nil || row.SampleCount < 3 {
		return
	}
	if row.P95PeakRamBytes > 0 {
		demand.RAMBytes = row.P95PeakRamBytes
	}
	if isFinal && row.P95PeakVramBytes > 0 {
		demand.VRAMBytes = row.P95PeakVramBytes
	}
}

func parseExecutionProfile(raw json.RawMessage) (*int64, *int64, *string, string) {
	if len(raw) == 0 {
		return nil, nil, nil, "null"
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, nil, nil, string(raw)
	}
	intField := func(keys ...string) *int64 {
		for _, key := range keys {
			v, ok := data[key]
			if !ok {
				continue
			}
			switch n := v.(type) {
			case float64:
				if n > 0 {
					x := int64(n)
					return &x
				}
			case int64:
				if n > 0 {
					x := n
					return &x
				}
			}
		}
		return nil
	}
	stringField := func(key string) *string {
		v, ok := data[key].(string)
		if !ok || v == "" {
			return nil
		}
		return &v
	}
	return intField("peak_ram_bytes", "peak_rss_bytes"), intField("peak_vram_bytes", "peak_vram_delta_bytes"), stringField("execution_path"), string(raw)
}

// GET /api/v1/admin/workers/stream — SSE real-time scheduler dashboard
func (h *VolunteerWorkerHandler) StreamScheduler(c echo.Context) error {
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no")

	flusher, ok := c.Response().Writer.(http.Flusher)
	if !ok {
		return mw.ErrInternal("streaming not supported")
	}

	ctx := c.Request().Context()
	send := func() {
		snap := h.buildSchedulerSnapshot(ctx)
		b, err := json.Marshal(snap)
		if err != nil {
			return
		}
		fmt.Fprintf(c.Response().Writer, "data: %s\n\n", b)
		flusher.Flush()
	}

	send()
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			send()
		}
	}
}

func (h *VolunteerWorkerHandler) buildSchedulerSnapshot(ctx context.Context) dto.SchedulerSnapshot {
	snap := dto.SchedulerSnapshot{Timestamp: time.Now()}

	workers, _ := h.q.ListVolunteerWorkers(ctx)
	claimRows, _ := h.q.ListWorkerActiveClaimCounts(ctx)
	claimMap := make(map[uuid.UUID]int64, len(claimRows))
	for _, r := range claimRows {
		claimMap[r.WorkerID] = int64(r.ActiveClaims)
	}

	snap.Workers = make([]dto.WorkerSnapshotItem, len(workers))
	for i, w := range workers {
		active := claimMap[w.ID]
		online := w.LastSeenAt.Valid && time.Since(w.LastSeenAt.Time) < 2*time.Minute

		label := "offline"
		if online && active > 0 {
			label = "online_busy"
		} else if online {
			label = "online_idle"
		}

		item := dto.WorkerSnapshotItem{
			ID:            w.ID,
			DisplayName:   w.DisplayName,
			StatusLabel:   label,
			Online:        online,
			ActiveJobs:    active,
			MaxWorkers:    w.MaxWorkers,
			Capabilities:  json.RawMessage(w.Capabilities),
			CPUUsage:      w.CpuUsage,
			RAMUsage:      w.RamUsage,
			JobsCompleted: w.JobsCompleted,
			JobsFailed:    w.JobsFailed,
		}
		if w.LastSeenAt.Valid {
			t := w.LastSeenAt.Time
			item.LastSeenAt = &t
		}
		snap.Workers[i] = item
	}

	if h.rdb != nil {
		snap.QueueDepth, _ = h.rdb.XLen(ctx, queue.StreamJobsJudge).Result()
	}

	logs, _ := h.q.ListRecentJobExecutionLogs(ctx, 20)
	snap.RecentLogs = make([]dto.ScheduleLogItem, 0, len(logs))
	for _, l := range logs {
		name := ""
		if l.WorkerName != nil {
			name = *l.WorkerName
		}
		item := dto.ScheduleLogItem{
			SubmissionID:     l.SubmissionID,
			WorkerID:         l.WorkerID,
			WorkerName:       name,
			PhaseKey:         l.PhaseKey,
			IsFinal:          l.IsFinal,
			PredictedSeconds: l.PredictedRuntimeSeconds,
			ActualSeconds:    l.ActualRuntimeSeconds,
			PeakRAMBytes:     l.PeakRamBytes,
			PeakVRAMBytes:    l.PeakVramBytes,
			ExecutionPath:    l.ExecutionPath,
			ErrorRatio:       l.ErrorRatio,
		}
		if l.CreatedAt.Valid {
			item.CreatedAt = l.CreatedAt.Time
		}
		snap.RecentLogs = append(snap.RecentLogs, item)
	}

	return snap
}

func generateWorkerToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}
