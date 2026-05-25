package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/storage"
)

type submissionSchemaEval struct {
	Evaluation struct {
		RequiredAssets []string `json:"required_assets"`
	} `json:"evaluation"`
}

type EvaluationSetHandler struct {
	q   db.Querier
	s3  *storage.S3
	val *validator.Validate
}

func NewEvaluationSetHandler(q db.Querier, s3 *storage.S3) *EvaluationSetHandler {
	return &EvaluationSetHandler{q: q, s3: s3, val: validator.New()}
}

func (h *EvaluationSetHandler) populateAssetFlags(ctx context.Context, resp *dto.EvaluationSetResponse) {
	assets, err := h.q.ListEvaluationSetAssets(ctx, resp.ID)
	if err != nil {
		return
	}
	if task, err := h.q.GetTaskByID(ctx, resp.TaskID); err == nil {
		var schema submissionSchemaEval
		if err := json.Unmarshal(task.SubmissionSchema, &schema); err == nil && len(schema.Evaluation.RequiredAssets) > 0 {
			resp.RequiredAssets = schema.Evaluation.RequiredAssets
		}
	}
	resp.Assets = make([]dto.EvaluationSetAssetResponse, 0, len(assets))
	resp.AssetKeys = make([]string, 0, len(assets))
	for _, a := range assets {
		resp.Assets = append(resp.Assets, dto.EvaluationSetAssetToResponse(a))
		resp.AssetKeys = append(resp.AssetKeys, a.AssetKey)
		for _, required := range resp.RequiredAssets {
			if a.AssetKey == required {
				if required == "judge.py" || required == "judge_script" {
					resp.HasJudgeScript = true
				}
			}
		}
		if a.AssetKey == "judge.py" || a.AssetKey == "judge_script" {
			resp.HasJudgeScript = true
		}
	}
}

func (h *EvaluationSetHandler) Create(c echo.Context) error {
	taskID, err := uuid.Parse(c.Param("task_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	var req dto.CreateEvaluationSetRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	set, err := h.q.CreateEvaluationSet(c.Request().Context(), db.CreateEvaluationSetParams{
		TaskID:      taskID,
		Key:         db.EvaluationSetKey(req.Key),
		Title:       req.Title,
		Description: req.Description,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("evaluation set already exists for this task")
		}
		return mw.ErrInternal("create evaluation set failed")
	}
	resp := dto.EvaluationSetToResponse(set)
	h.populateAssetFlags(c.Request().Context(), &resp)
	return c.JSON(http.StatusCreated, resp)
}

func (h *EvaluationSetHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid evaluation set id")
	}
	set, err := h.q.GetEvaluationSetByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("evaluation set not found")
		}
		return mw.ErrInternal("fetch evaluation set failed")
	}
	resp := dto.EvaluationSetToResponse(set)
	h.populateAssetFlags(c.Request().Context(), &resp)
	return c.JSON(http.StatusOK, resp)
}

func (h *EvaluationSetHandler) ListByTask(c echo.Context) error {
	taskID, err := uuid.Parse(c.Param("task_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	sets, err := h.q.ListEvaluationSetsByTask(c.Request().Context(), taskID)
	if err != nil {
		return mw.ErrInternal("list evaluation sets failed")
	}
	resp := make([]dto.EvaluationSetResponse, len(sets))
	for i, s := range sets {
		resp[i] = dto.EvaluationSetToResponse(s)
		h.populateAssetFlags(c.Request().Context(), &resp[i])
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *EvaluationSetHandler) InitiateAssets(c echo.Context) error {
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}
	setID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid evaluation set id")
	}
	var req dto.InitiateEvaluationSetAssetsRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	ctx := c.Request().Context()
	if _, err := h.q.GetEvaluationSetByID(ctx, setID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("evaluation set not found")
		}
		return mw.ErrInternal("fetch evaluation set failed")
	}

	uploads := make([]dto.InitiateEvaluationSetAssetResponse, 0, len(req.Assets))
	for _, a := range req.Assets {
		objectKey := "evaluation-sets/" + setID.String() + "/" + a.AssetKey + "/" + a.Filename
		putURL, err := h.s3.PresignPut(ctx, objectKey, 15*time.Minute)
		if err != nil {
			return mw.ErrInternal("presign failed")
		}
		uploads = append(uploads, dto.InitiateEvaluationSetAssetResponse{AssetKey: a.AssetKey, Filename: a.Filename, ObjectKey: objectKey, PutURL: putURL})
	}
	return c.JSON(http.StatusOK, dto.InitiateEvaluationSetAssetsResponse{Uploads: uploads})
}

func (h *EvaluationSetHandler) CompleteAssets(c echo.Context) error {
	setID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid evaluation set id")
	}
	var req dto.CompleteEvaluationSetAssetsRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	ctx := c.Request().Context()
	if _, err := h.q.GetEvaluationSetByID(ctx, setID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("evaluation set not found")
		}
		return mw.ErrInternal("fetch evaluation set failed")
	}

	resp := make([]dto.EvaluationSetAssetResponse, 0, len(req.Assets))
	for _, a := range req.Assets {
		prefix := "evaluation-sets/" + setID.String() + "/" + a.AssetKey + "/"
		if !strings.HasPrefix(a.ObjectKey, prefix) {
			return mw.ErrBadRequest("invalid object_key")
		}
		asset, err := h.q.UpsertEvaluationSetAsset(ctx, db.UpsertEvaluationSetAssetParams{
			EvaluationSetID:  setID,
			AssetKey:         a.AssetKey,
			OriginalFilename: a.Filename,
			StoragePath:      a.ObjectKey,
			FileSize:         a.SizeBytes,
			ContentType:      &a.ContentType,
			HashSha256:       a.SHA256,
		})
		if err != nil {
			return mw.ErrInternal("upsert evaluation set asset failed")
		}
		resp = append(resp, dto.EvaluationSetAssetToResponse(asset))
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *EvaluationSetHandler) ListAssets(c echo.Context) error {
	setID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid evaluation set id")
	}
	assets, err := h.q.ListEvaluationSetAssets(c.Request().Context(), setID)
	if err != nil {
		return mw.ErrInternal("list evaluation set assets failed")
	}
	resp := make([]dto.EvaluationSetAssetResponse, len(assets))
	for i, a := range assets {
		resp[i] = dto.EvaluationSetAssetToResponse(a)
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *EvaluationSetHandler) InitiateTaskAssets(c echo.Context) error {
	if h.s3 == nil {
		return mw.ErrInternal("storage unavailable")
	}
	taskID, err := uuid.Parse(c.Param("task_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	var req dto.InitiateEvaluationSetAssetsRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	ctx := c.Request().Context()
	if _, err := h.q.GetTaskByID(ctx, taskID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("task not found")
		}
		return mw.ErrInternal("fetch task failed")
	}

	uploads := make([]dto.InitiateEvaluationSetAssetResponse, 0, len(req.Assets))
	for _, a := range req.Assets {
		objectKey := "tasks/" + taskID.String() + "/" + a.AssetKey + "/" + a.Filename
		putURL, err := h.s3.PresignPut(ctx, objectKey, 15*time.Minute)
		if err != nil {
			return mw.ErrInternal("presign failed")
		}
		uploads = append(uploads, dto.InitiateEvaluationSetAssetResponse{AssetKey: a.AssetKey, Filename: a.Filename, ObjectKey: objectKey, PutURL: putURL})
	}
	return c.JSON(http.StatusOK, dto.InitiateEvaluationSetAssetsResponse{Uploads: uploads})
}

func (h *EvaluationSetHandler) CompleteTaskAssets(c echo.Context) error {
	taskID, err := uuid.Parse(c.Param("task_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	var req dto.CompleteEvaluationSetAssetsRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	ctx := c.Request().Context()
	if _, err := h.q.GetTaskByID(ctx, taskID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("task not found")
		}
		return mw.ErrInternal("fetch task failed")
	}

	resp := make([]dto.TaskAssetResponse, 0, len(req.Assets))
	for _, a := range req.Assets {
		prefix := "tasks/" + taskID.String() + "/" + a.AssetKey + "/"
		if !strings.HasPrefix(a.ObjectKey, prefix) {
			return mw.ErrBadRequest("invalid object_key")
		}
		asset, err := h.q.UpsertTaskAsset(ctx, db.UpsertTaskAssetParams{
			TaskID:           taskID,
			AssetKey:         a.AssetKey,
			OriginalFilename: a.Filename,
			StoragePath:      a.ObjectKey,
			FileSize:         a.SizeBytes,
			ContentType:      &a.ContentType,
			HashSha256:       a.SHA256,
		})
		if err != nil {
			return mw.ErrInternal("upsert task asset failed")
		}
		resp = append(resp, dto.TaskAssetToResponse(asset))
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *EvaluationSetHandler) ListTaskAssets(c echo.Context) error {
	taskID, err := uuid.Parse(c.Param("task_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid task id")
	}
	assets, err := h.q.ListTaskAssets(c.Request().Context(), taskID)
	if err != nil {
		return mw.ErrInternal("list task assets failed")
	}
	resp := make([]dto.TaskAssetResponse, len(assets))
	for i, a := range assets {
		resp[i] = dto.TaskAssetToResponse(a)
	}
	return c.JSON(http.StatusOK, resp)
}
