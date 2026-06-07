package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
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

type SubmissionHandler struct {
	q        db.Querier
	producer *queue.Producer
	s3       *storage.S3
	val      *validator.Validate
}

const (
	nonFinalSubmissionMaxBytes int64 = 50 * 1024 * 1024
	finalSubmissionMaxBytes    int64 = 500 * 1024 * 1024
)

func NewSubmissionHandler(q db.Querier, producer *queue.Producer, s3 *storage.S3) *SubmissionHandler {
	return &SubmissionHandler{q: q, producer: producer, s3: s3, val: validator.New()}
}

func submissionSizeLimit(isFinal bool) int64 {
	if isFinal {
		return finalSubmissionMaxBytes
	}
	return nonFinalSubmissionMaxBytes
}

func validateSubmissionSize(files []int64, isFinal bool) error {
	var total int64
	for _, size := range files {
		if size > submissionSizeLimit(isFinal)-total {
			limitMB := submissionSizeLimit(isFinal) / (1024 * 1024)
			return mw.ErrBadRequest("submission exceeds the " + strconv.FormatInt(limitMB, 10) + " MB limit for this phase")
		}
		total += size
	}
	return nil
}

// POST /api/v1/entries/:entry_id/submissions:initiate
func (h *SubmissionHandler) InitiateUpload(c echo.Context) error {
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}
	entryID, err := uuid.Parse(c.Param("entry_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	var req dto.InitiateSubmissionUploadRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	uid := mw.GetUserID(c)
	ctx := c.Request().Context()

	entry, err := h.q.GetContestEntryByID(ctx, entryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("entry not found")
		}
		return mw.ErrInternal("fetch entry failed")
	}
	phase, err := h.q.GetPhaseByID(ctx, req.PhaseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("phase not found")
		}
		return mw.ErrInternal("fetch phase failed")
	}
	fileSizes := make([]int64, len(req.Files))
	for i, file := range req.Files {
		fileSizes[i] = file.SizeBytes
	}
	if err := validateSubmissionSize(fileSizes, phase.IsFinal); err != nil {
		return err
	}
	if phase.SubmissionLimit != nil {
		used, err := h.q.CountSubmissionsByEntryPhase(ctx, db.CountSubmissionsByEntryPhaseParams{
			ContestEntryID: entryID,
			TaskID:         req.TaskID,
			PhaseID:        req.PhaseID,
		})
		if err != nil {
			return mw.ErrInternal("count submissions failed")
		}
		if used >= *phase.SubmissionLimit {
			return mw.ErrBadRequest("submission limit reached (" + strconv.FormatInt(int64(*phase.SubmissionLimit), 10) + " submissions allowed for this phase)")
		}
	}

	ip := c.RealIP()
	ua := c.Request().UserAgent()
	sub, err := h.q.CreateSubmission(ctx, db.CreateSubmissionParams{
		ContestID:      entry.ContestID,
		ContestEntryID: entryID,
		TaskID:         req.TaskID,
		PhaseID:        req.PhaseID,
		SubmittedBy:    uid,
		FileCount:      int32(len(req.Files)),
		TotalSizeBytes: 0,
		ClientIp:       &ip,
		UserAgent:      &ua,
	})
	if err != nil {
		return mw.ErrInternal("create submission failed: " + err.Error())
	}

	uploads := make([]dto.InitiateUploadFileResponse, 0, len(req.Files))
	for _, f := range req.Files {
		objectKey := "submissions/" + sub.ID.String() + "/" + f.Filename
		putURL, err := h.s3.PresignPut(ctx, objectKey, 15*time.Minute)
		if err != nil {
			return mw.ErrInternal("presign failed")
		}
		uploads = append(uploads, dto.InitiateUploadFileResponse{Filename: f.Filename, ObjectKey: objectKey, PutURL: putURL})
	}

	return c.JSON(http.StatusCreated, dto.InitiateSubmissionUploadResponse{SubmissionID: sub.ID, Uploads: uploads})
}

// POST /api/v1/submissions/:id/complete
func (h *SubmissionHandler) CompleteUpload(c echo.Context) error {
	subID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	var req dto.CompleteSubmissionUploadRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	ctx := c.Request().Context()

	sub, err := h.q.GetSubmissionByID(ctx, subID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("submission not found")
		}
		return mw.ErrInternal("fetch submission failed")
	}
	phase, err := h.q.GetPhaseByID(ctx, sub.PhaseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("phase not found")
		}
		return mw.ErrInternal("fetch phase failed")
	}

	total := int64(0)
	for _, f := range req.Files {
		prefix := "submissions/" + subID.String() + "/"
		if !strings.HasPrefix(f.ObjectKey, prefix) {
			return mw.ErrBadRequest("invalid object_key")
		}
		total += f.SizeBytes
	}
	fileSizes := make([]int64, len(req.Files))
	for i, file := range req.Files {
		fileSizes[i] = file.SizeBytes
	}
	if err := validateSubmissionSize(fileSizes, phase.IsFinal); err != nil {
		return err
	}

	for _, f := range req.Files {
		_, err := h.q.CreateSubmissionFile(ctx, db.CreateSubmissionFileParams{
			SubmissionID:     subID,
			OriginalFilename: f.Filename,
			StoragePath:      f.ObjectKey,
			FileSize:         f.SizeBytes,
			ContentType:      &f.ContentType,
			HashSha256:       f.SHA256,
		})
		if err != nil {
			return mw.ErrInternal("create submission_file failed")
		}
	}

	queued, err := h.q.MarkSubmissionQueued(ctx, db.MarkSubmissionQueuedParams{ID: subID, FileCount: int32(len(req.Files)), TotalSizeBytes: total})
	if err != nil {
		return mw.ErrInternal("mark queued failed")
	}

	if h.producer != nil {
		_ = h.producer.EnqueueJudge(ctx, queued.ID, nil)
	}

	return c.JSON(http.StatusOK, dto.SubmissionToResponse(queued))
}

// POST /api/v1/entries/:entry_id/submissions — legacy shortcut (no presign)
func (h *SubmissionHandler) Create(c echo.Context) error {
	return mw.ErrBadRequest("use presigned submission upload flow")
}

// GET /api/v1/submissions/:id
func (h *SubmissionHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	sub, err := h.q.GetSubmissionByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("submission not found")
		}
		return mw.ErrInternal("fetch submission failed")
	}
	return c.JSON(http.StatusOK, dto.SubmissionToResponse(sub))
}

// GET /api/v1/entries/:id/submissions
func (h *SubmissionHandler) ListByEntry(c echo.Context) error {
	entryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var taskFilter, phaseFilter pgtype.UUID
	if t := c.QueryParam("task_id"); t != "" {
		if v, e := uuid.Parse(t); e == nil {
			taskFilter = pgtype.UUID{Bytes: v, Valid: true}
		}
	}
	if p := c.QueryParam("phase_id"); p != "" {
		if v, e := uuid.Parse(p); e == nil {
			phaseFilter = pgtype.UUID{Bytes: v, Valid: true}
		}
	}
	subs, err := h.q.ListSubmissionsByEntry(c.Request().Context(), db.ListSubmissionsByEntryParams{
		ContestEntryID: entryID, Limit: int32(limit), Offset: int32(offset),
		TaskID: taskFilter, PhaseID: phaseFilter,
	})
	if err != nil {
		return mw.ErrInternal("list submissions failed")
	}
	resp := make([]dto.SubmissionResponse, len(subs))
	for i, s := range subs {
		resp[i] = dto.SubmissionToResponse(s)
	}
	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/submissions/:id/mark-final
func (h *SubmissionHandler) MarkFinal(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid submission id")
	}
	ctx := c.Request().Context()
	sub, err := h.q.GetSubmissionByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("submission not found")
		}
		return mw.ErrInternal("fetch submission failed")
	}

	err = h.q.ResetOtherFinalSubmissions(ctx, db.ResetOtherFinalSubmissionsParams{
		ContestEntryID: sub.ContestEntryID,
		TaskID:         sub.TaskID,
		PhaseID:        sub.PhaseID,
		ID:             sub.ID,
	})
	if err != nil {
		return mw.ErrInternal("reset other finals failed")
	}

	sub, err = h.q.MarkSubmissionFinal(ctx, id)
	if err != nil {
		return mw.ErrInternal("mark final failed")
	}

	if h.producer != nil {
		_ = h.producer.EnqueueResult(ctx, sub.ID, "done")
	}

	return c.JSON(http.StatusOK, dto.SubmissionToResponse(sub))
}
