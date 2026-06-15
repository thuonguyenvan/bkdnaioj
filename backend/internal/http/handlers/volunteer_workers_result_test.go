package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestVolunteerWorkerSubmitResultRejectsExpiredAttemptDuringCommit(t *testing.T) {
	submissionID := uuid.New()
	workerID := uuid.New()
	attemptID := uuid.New()
	token := "worker-token"
	markFailedCalled := false

	mock := &db.MockQuerier{
		GetWorkerClaimBySubmissionFunc: func(ctx context.Context, id uuid.UUID) (db.VolunteerWorkerClaim, error) {
			return db.VolunteerWorkerClaim{
				WorkerID:     workerID,
				SubmissionID: submissionID,
				AttemptID:    attemptID,
			}, nil
		},
		GetVolunteerWorkerByTokenFunc: func(ctx context.Context, got *string) (db.VolunteerWorker, error) {
			assert.Equal(t, token, *got)
			return db.VolunteerWorker{ID: workerID}, nil
		},
		MarkSubmissionFailedFunc: func(ctx context.Context, arg db.MarkSubmissionFailedParams) (db.Submission, error) {
			markFailedCalled = true
			assert.Equal(t, submissionID, arg.ID)
			assert.Equal(t, workerID, arg.WorkerID)
			assert.Equal(t, attemptID, arg.AttemptID)
			return db.Submission{}, pgx.ErrNoRows
		},
	}

	h := NewVolunteerWorkerHandler(mock, nil, nil, nil)
	body := `{"attempt_id":"` + attemptID.String() + `","status":"failed","error_message":"judge failed"}`
	c, _ := newTestContext(http.MethodPost, "/api/v1/worker/jobs/"+submissionID.String()+"/result", body)
	c.SetParamNames("id")
	c.SetParamValues(submissionID.String())
	c.Set("worker_token", token)

	err := h.SubmitResult(c)

	assert.True(t, markFailedCalled)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusForbidden, appErr.Status)
	assert.Contains(t, appErr.Message, "stale or completed")
}
