package handlers

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mank1/olpai-backend/db"
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
	h := NewTaskHandler(mock)
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
	h := NewTaskHandler(mock)
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
	h := NewTaskHandler(mock)
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
	h := NewTaskHandler(mock)
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
	h := NewTaskHandler(mock)
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
	h := NewTaskHandler(mock)
	c, rec := newTestContext("DELETE", "/api/v1/tasks/"+taskID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(taskID.String())

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
