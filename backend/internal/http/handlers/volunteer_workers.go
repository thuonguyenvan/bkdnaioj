package handlers

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/queue"
	"github.com/mank1/olpai-backend/internal/storage"
)

const workerJobTimeoutMinutes = 10

type VolunteerWorkerHandler struct {
	q        db.Querier
	s3       *storage.S3
	producer *queue.Producer
	val      *validator.Validate
}

func NewVolunteerWorkerHandler(q db.Querier, s3 *storage.S3, producer *queue.Producer) *VolunteerWorkerHandler {
	return &VolunteerWorkerHandler{q: q, s3: s3, producer: producer, val: validator.New()}
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
	worker, err := h.q.CreateVolunteerWorker(c.Request().Context(), db.CreateVolunteerWorkerParams{
		UserID:       pgtype.UUID{},
		DisplayName:  req.DisplayName,
		Capabilities: []byte(req.Capabilities),
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
	if worker.CurrentJobID.Valid {
		return c.JSON(http.StatusOK, map[string]any{"submission_id": nil, "reason": "already_busy"})
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

	artifacts, err := h.buildArtifactURLs(ctx, sub)
	if err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("artifact presign failed")
	}

	jobUUID := pgtype.UUID{Bytes: sub.ID, Valid: true}
	if _, err := h.q.ClaimWorkerJob(ctx, db.ClaimWorkerJobParams{
		ApiToken:     &token,
		CurrentJobID: jobUUID,
	}); err != nil {
		_ = h.producer.Ack(ctx, msgID)
		_ = h.producer.EnqueueJudge(ctx, envelope.SubmissionID, nil)
		return mw.ErrInternal("claim job failed")
	}

	_ = h.producer.Ack(ctx, msgID)
	_, _ = h.q.MarkSubmissionRunning(ctx, sub.ID)

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
		TaskID:       sub.TaskID,
		PhaseID:      sub.PhaseID,
		IsFinal:      sub.IsFinal,
		JudgeKey:     sub.JudgeKey,
		Context:      contextJSON,
		Artifacts:    artifacts,
		TimeoutSecs:  workerJobTimeoutMinutes * 60,
	})
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

	worker, err := h.q.GetVolunteerWorkerByToken(ctx, &token)
	if err != nil {
		return mw.ErrInternal("fetch worker failed")
	}
	if !worker.CurrentJobID.Valid || uuid.UUID(worker.CurrentJobID.Bytes) != subID {
		return mw.ErrForbidden("not your job")
	}

	if req.Status == "done" {
		if req.RawScore == nil || req.DisplayScore == nil {
			return mw.ErrBadRequest("raw_score and display_score required for done status")
		}
		rawScore := pgtype.Numeric{}
		_ = rawScore.Scan(fmt.Sprintf("%f", *req.RawScore))
		dispScore := pgtype.Numeric{}
		_ = dispScore.Scan(fmt.Sprintf("%f", *req.DisplayScore))
		payloadBytes := []byte("null")
		if len(req.Payload) > 0 {
			payloadBytes = []byte(req.Payload)
		}
		if _, err := h.q.MarkSubmissionDone(ctx, db.MarkSubmissionDoneParams{
			ID:           subID,
			RawScore:     rawScore,
			DisplayScore: dispScore,
			Column4:      payloadBytes,
		}); err != nil {
			return mw.ErrInternal("mark done failed")
		}
		if _, err := h.q.CompleteWorkerJob(ctx, &token); err != nil {
			return mw.ErrInternal("complete job failed")
		}
		_ = h.producer.EnqueueResult(ctx, subID, "done")
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
			return mw.ErrInternal("mark failed failed")
		}
		if _, err := h.q.FailWorkerJob(ctx, &token); err != nil {
			return mw.ErrInternal("fail job failed")
		}
		_ = h.producer.EnqueueResult(ctx, subID, "failed")
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// GET /api/v1/admin/workers
func (h *VolunteerWorkerHandler) AdminList(c echo.Context) error {
	workers, err := h.q.ListVolunteerWorkers(c.Request().Context())
	if err != nil {
		return mw.ErrInternal("list workers failed")
	}
	resp := make([]dto.WorkerResponse, len(workers))
	for i, w := range workers {
		resp[i] = dto.VolunteerWorkerToResponse(w)
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
	return c.JSON(http.StatusOK, dto.VolunteerWorkerToResponse(worker))
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

	// Submission files
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
		})
	}

	// Evaluation set assets
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
		})
	}

	// Task-level assets (shared judge script etc.)
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
		})
	}

	return artifacts, nil
}

func generateWorkerToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}
