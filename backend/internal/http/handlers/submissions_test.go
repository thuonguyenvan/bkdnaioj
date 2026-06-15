package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSubmissionHandler_Create_Unsupported(t *testing.T) {
	h := NewSubmissionHandler(&db.MockQuerier{}, nil, nil)
	c, _ := newTestContext("POST", "/api/v1/entries/"+uuid.New().String()+"/submissions", `{}`)

	err := h.Create(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestSubmissionHandler_Get_Success(t *testing.T) {
	subID := uuid.New()
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, rec := newTestContext("GET", "/api/v1/submissions/"+subID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(subID.String())

	err := h.Get(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestSubmissionHandler_Get_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{}, pgx.ErrNoRows
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, _ := newTestContext("GET", "/api/v1/submissions/"+uuid.New().String(), "")
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}

func TestSubmissionHandler_ListByEntry_Success(t *testing.T) {
	entryID := uuid.New()
	phaseDefID := uuid.New()
	mock := &db.MockQuerier{
		ListSubmissionsByEntryFunc: func(ctx context.Context, arg db.ListSubmissionsByEntryParams) ([]db.Submission, error) {
			assert.Equal(t, entryID, arg.ContestEntryID)
			assert.True(t, arg.ContestPhaseDefID.Valid)
			assert.Equal(t, phaseDefID, uuid.UUID(arg.ContestPhaseDefID.Bytes))
			return []db.Submission{{ID: uuid.New()}}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, rec := newTestContext("GET", "/api/v1/entries/"+entryID.String()+"/submissions?contest_phase_def_id="+phaseDefID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(entryID.String())

	err := h.ListByEntry(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestSubmissionHandler_CompleteUpload_PreservesGenericFilename(t *testing.T) {
	subID := uuid.New()
	phaseID := uuid.New()
	var captured db.CreateSubmissionFileParams
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID, PhaseID: phaseID}, nil
		},
		GetPhaseByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Phase, error) {
			return db.Phase{ID: phaseID, IsFinal: false}, nil
		},
		CreateSubmissionFileFunc: func(ctx context.Context, arg db.CreateSubmissionFileParams) (db.SubmissionFile, error) {
			captured = arg
			return db.SubmissionFile{}, nil
		},
		MarkSubmissionQueuedFunc: func(ctx context.Context, arg db.MarkSubmissionQueuedParams) (db.Submission, error) {
			return db.Submission{
				ID:             subID,
				FileCount:      arg.FileCount,
				TotalSizeBytes: arg.TotalSizeBytes,
				Status:         db.SubmissionStatusQueued,
				RawScore:       pgtype.Numeric{},
				DisplayScore:   pgtype.Numeric{},
			}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	body := `{"files":[{"filename":"adversarial_images.zip","object_key":"submissions/` + subID.String() + `/adversarial_images.zip","size_bytes":2048,"content_type":"application/zip"}]}`
	c, rec := newTestContext("POST", "/api/v1/submissions/"+subID.String()+"/complete", body)
	c.SetParamNames("id")
	c.SetParamValues(subID.String())

	err := h.CompleteUpload(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "adversarial_images.zip", captured.OriginalFilename)
	assert.Equal(t, "submissions/"+subID.String()+"/adversarial_images.zip", captured.StoragePath)
	assert.Equal(t, int64(2048), captured.FileSize)
}

func TestValidateSubmissionSizeLimits(t *testing.T) {
	assert.NoError(t, validateSubmissionSize([]int64{50 * 1024 * 1024}, false))
	assert.NoError(t, validateSubmissionSize([]int64{500 * 1024 * 1024}, true))

	err := validateSubmissionSize([]int64{50*1024*1024 + 1}, false)
	require.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
	assert.Contains(t, err.Error(), "50 MB")

	err = validateSubmissionSize([]int64{500*1024*1024 + 1}, true)
	require.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
	assert.Contains(t, err.Error(), "500 MB")
}

func TestSubmissionHandler_CompleteUpload_RejectsOversizedFinalBeforeWritingFiles(t *testing.T) {
	subID := uuid.New()
	phaseID := uuid.New()
	createFileCalled := false
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID, PhaseID: phaseID}, nil
		},
		GetPhaseByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Phase, error) {
			return db.Phase{ID: phaseID, IsFinal: true}, nil
		},
		CreateSubmissionFileFunc: func(ctx context.Context, arg db.CreateSubmissionFileParams) (db.SubmissionFile, error) {
			createFileCalled = true
			return db.SubmissionFile{}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	body := `{"files":[{"filename":"model.zip","object_key":"submissions/` + subID.String() + `/model.zip","size_bytes":524288001,"content_type":"application/zip"}]}`
	c, _ := newTestContext("POST", "/api/v1/submissions/"+subID.String()+"/complete", body)
	c.SetParamNames("id")
	c.SetParamValues(subID.String())

	err := h.CompleteUpload(c)
	require.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
	assert.False(t, createFileCalled)
}

func TestSubmissionHandler_MarkFinal_Success(t *testing.T) {
	subID := uuid.New()
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID}, nil
		},
		ResetOtherFinalSubmissionsFunc: func(ctx context.Context, arg db.ResetOtherFinalSubmissionsParams) error {
			return nil
		},
		MarkSubmissionFinalFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{ID: subID, IsFinal: true}, nil
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, rec := newTestContext("POST", "/api/v1/submissions/"+subID.String()+"/mark-final", "")
	c.SetParamNames("id")
	c.SetParamValues(subID.String())

	err := h.MarkFinal(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestSubmissionHandler_MarkFinal_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetSubmissionByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Submission, error) {
			return db.Submission{}, pgx.ErrNoRows
		},
	}
	h := NewSubmissionHandler(mock, nil, nil)
	c, _ := newTestContext("POST", "/api/v1/submissions/"+uuid.New().String()+"/mark-final", "")
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.MarkFinal(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}
