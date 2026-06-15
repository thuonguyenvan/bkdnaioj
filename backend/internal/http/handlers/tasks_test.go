package handlers

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/stretchr/testify/assert"
)

func TestTaskHandler_Create_Success(t *testing.T) {
	contestID := uuid.New()
	taskID := uuid.New()

	mock := &db.MockQuerier{
		CreateTaskFunc: func(ctx context.Context, arg db.CreateTaskParams) (db.Task, error) {
			return db.Task{
				ID:             taskID,
				ContestID:      contestID,
				Slug:           "task-a",
				Title:          "Task A",
				ScoreLabel:     "RMSE",
				HigherIsBetter: false,
				SortOrder:      1,
			}, nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	body := `{"slug":"task-a","title":"Task A","score_label":"RMSE","higher_is_better":false,"sort_order":1}`
	c, rec := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/tasks", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestTaskHandler_Create_DuplicateSlug(t *testing.T) {
	contestID := uuid.New()

	mock := &db.MockQuerier{
		CreateTaskFunc: func(ctx context.Context, arg db.CreateTaskParams) (db.Task, error) {
			return db.Task{}, &pgconn.PgError{Code: "23505"}
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	body := `{"slug":"task-a","title":"Task A","score_label":"RMSE","higher_is_better":false,"sort_order":1}`
	c, _ := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/tasks", body)
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Create(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "slug already exists")
}

func TestTaskHandler_ListByContest_Success(t *testing.T) {
	contestID := uuid.New()

	mock := &db.MockQuerier{
		ListTasksByContestFunc: func(ctx context.Context, cid uuid.UUID) ([]db.Task, error) {
			return []db.Task{
				{ID: uuid.New(), ContestID: contestID, Slug: "task-a", Title: "Task A", ScoreLabel: "RMSE"},
			}, nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/tasks", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.ListByContest(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTaskHandler_Get_Success(t *testing.T) {
	taskID := uuid.New()

	mock := &db.MockQuerier{
		GetTaskByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Task, error) {
			return db.Task{ID: taskID, ContestID: uuid.New(), Slug: "task-a", Title: "Task A", ScoreLabel: "RMSE"}, nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, rec := newTestContext("GET", "/api/v1/tasks/"+taskID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.Get(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTaskHandler_Get_NotFound(t *testing.T) {
	taskID := uuid.New()

	mock := &db.MockQuerier{
		GetTaskByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Task, error) {
			return db.Task{}, pgx.ErrNoRows
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, _ := newTestContext("GET", "/api/v1/tasks/"+taskID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestTaskHandler_Delete_Success(t *testing.T) {
	taskID := uuid.New()

	mock := &db.MockQuerier{
		DeleteTaskFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, rec := newTestContext("DELETE", "/api/v1/tasks/"+taskID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestTaskHandler_ListByContest_ForbiddenUnstartedContest(t *testing.T) {
	contestID := uuid.New()
	futureTime := time.Now().Add(24 * time.Hour)

	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:        contestID,
				Status:    db.ContestStatusRegistrationOpen,
				StartTime: pgtype.Timestamptz{Time: futureTime, Valid: true},
			}, nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, _ := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/tasks", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.ListByContest(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "contest has not started yet")
}

func TestTaskHandler_ListByContest_DraftContest(t *testing.T) {
	contestID := uuid.New()
	pastTime := time.Now().Add(-24 * time.Hour)

	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:        contestID,
				Status:    db.ContestStatusDraft,
				StartTime: pgtype.Timestamptz{Time: pastTime, Valid: true},
			}, nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, _ := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/tasks", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.ListByContest(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "contest not open yet")
}

func TestTaskHandler_ListByContest_PrivateContestRequiresAccess(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:         contestID,
				Visibility: db.ContestVisibilityPrivate,
			}, nil
		},
	}
	h := NewTaskHandler(mock, security.NewJWTManager("test-secret", time.Hour), nil)
	c, _ := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/tasks", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.ListByContest(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusForbidden, appErr.Status)
}

func TestTaskHandler_ListByContest_PrivateContestAllowsRegisteredUser(t *testing.T) {
	contestID := uuid.New()
	userID := uuid.New()
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:         contestID,
				Status:     db.ContestStatusRunning,
				Visibility: db.ContestVisibilityPrivate,
				StartTime:  pgtype.Timestamptz{Time: time.Now().Add(-time.Hour), Valid: true},
			}, nil
		},
		UserHasContestAccessFunc: func(ctx context.Context, arg db.UserHasContestAccessParams) (bool, error) {
			return true, nil
		},
		ListTasksByContestFunc: func(ctx context.Context, id uuid.UUID) ([]db.Task, error) {
			return []db.Task{{ID: uuid.New(), ContestID: contestID, Title: "Task"}}, nil
		},
	}
	jwtMgr := security.NewJWTManager("test-secret", time.Hour)
	token, err := jwtMgr.Issue(userID, "contestant")
	assert.NoError(t, err)
	h := NewTaskHandler(mock, jwtMgr, nil)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String()+"/tasks", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())
	c.Request().Header.Set("Authorization", "Bearer "+token)

	err = h.ListByContest(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTaskHandler_Get_ForbiddenUnstartedContest(t *testing.T) {
	taskID := uuid.New()
	contestID := uuid.New()
	futureTime := time.Now().Add(24 * time.Hour)

	mock := &db.MockQuerier{
		GetTaskByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Task, error) {
			return db.Task{ID: taskID, ContestID: contestID, Slug: "task-a", Title: "Task A", ScoreLabel: "RMSE"}, nil
		},
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:        contestID,
				Status:    db.ContestStatusRegistrationOpen,
				StartTime: pgtype.Timestamptz{Time: futureTime, Valid: true},
			}, nil
		},
	}
	h := NewTaskHandler(mock, nil, nil)
	c, _ := newTestContext("GET", "/api/v1/tasks/"+taskID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.Get(c)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "contest has not started yet")
}
