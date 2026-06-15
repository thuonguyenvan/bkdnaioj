package handlers

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/stretchr/testify/assert"
)

func TestContestHandler_Create_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		CreateContestFunc: func(ctx context.Context, arg db.CreateContestParams) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        arg.Slug,
				Title:       arg.Title,
				Status:      db.ContestStatusDraft,
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPublic,
				MaxTeamSize: arg.MaxTeamSize,
			}, nil
		},
	}
	h := NewContestHandler(mock)
	body := `{
		"slug":"test-contest",
		"title":"Test Contest",
		"entry_policy":"individual",
		"start_time":"2025-06-01T00:00:00Z",
		"end_time":"2025-06-30T00:00:00Z",
		"visibility":"public",
		"max_team_size":1
	}`
	c, rec := newTestContext("POST", "/api/v1/contests", body)
	setAuthContext(c, uuid.New(), "admin")

	err := h.Create(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, contestID.String(), resp["id"])
}

func TestContestHandler_Create_DuplicateSlug(t *testing.T) {
	mock := &db.MockQuerier{
		CreateContestFunc: func(ctx context.Context, arg db.CreateContestParams) (db.Contest, error) {
			return db.Contest{}, &pgconn.PgError{Code: "23505"}
		},
	}
	h := NewContestHandler(mock)
	body := `{
		"slug":"dup-slug",
		"title":"Dup Contest",
		"entry_policy":"individual",
		"start_time":"2025-06-01T00:00:00Z",
		"end_time":"2025-06-30T00:00:00Z",
		"visibility":"public",
		"max_team_size":1
	}`
	c, _ := newTestContext("POST", "/api/v1/contests", body)
	setAuthContext(c, uuid.New(), "admin")

	err := h.Create(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusConflict, appErr.Status)
}

func TestContestHandler_List_Success(t *testing.T) {
	mock := &db.MockQuerier{
		ListContestsFunc: func(ctx context.Context, arg db.ListContestsParams) ([]db.Contest, error) {
			assert.NotNil(t, arg.Visibility)
			assert.Equal(t, db.ContestVisibilityPublic, *arg.Visibility)
			return []db.Contest{
				{ID: uuid.New(), Slug: "c1", Title: "C1", Status: db.ContestStatusDraft,
					EntryPolicy: db.ContestEntryPolicyIndividual, Visibility: db.ContestVisibilityPublic},
			}, nil
		},
	}
	h := NewContestHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests", "")

	err := h.List(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestContestHandler_Get_PrivateContestRequiresAccess(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:         contestID,
				Visibility: db.ContestVisibilityPrivate,
			}, nil
		},
	}
	h := NewContestHandler(mock, security.NewJWTManager("test-secret", time.Hour))
	c, _ := newTestContext("GET", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Get(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusForbidden, appErr.Status)
}

func TestContestHandler_Get_PrivateContestAllowsRegisteredUser(t *testing.T) {
	contestID := uuid.New()
	userID := uuid.New()
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        "private-contest",
				Title:       "Private Contest",
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPrivate,
			}, nil
		},
		UserHasContestAccessFunc: func(ctx context.Context, arg db.UserHasContestAccessParams) (bool, error) {
			assert.Equal(t, contestID, arg.ContestID)
			assert.Equal(t, userID, uuid.UUID(arg.UserID.Bytes))
			return true, nil
		},
	}
	jwtMgr := security.NewJWTManager("test-secret", time.Hour)
	token, err := jwtMgr.Issue(userID, "contestant")
	assert.NoError(t, err)
	h := NewContestHandler(mock, jwtMgr)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())
	c.Request().Header.Set("Authorization", "Bearer "+token)

	err = h.Get(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestContestHandler_Get_Success(t *testing.T) {
	contestID := uuid.New()
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        "my-contest",
				Title:       "My Contest",
				Status:      db.ContestStatusDraft,
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPublic,
			}, nil
		},
	}
	h := NewContestHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Get(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, contestID.String(), resp["id"])
}

func TestContestHandler_Get_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetContestByIDFunc: func(ctx context.Context, id uuid.UUID) (db.Contest, error) {
			return db.Contest{}, pgx.ErrNoRows
		},
	}
	h := NewContestHandler(mock)
	contestID := uuid.New()
	c, _ := newTestContext("GET", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Get(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusNotFound, appErr.Status)
}

func TestContestHandler_Get_InvalidID(t *testing.T) {
	mock := &db.MockQuerier{}
	h := NewContestHandler(mock)
	c, _ := newTestContext("GET", "/api/v1/contests/not-a-uuid", "")
	c.SetParamNames("id")
	c.SetParamValues("not-a-uuid")

	err := h.Get(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, appErr.Status)
}

func TestContestHandler_Delete_Success(t *testing.T) {
	mock := &db.MockQuerier{
		DeleteContestFunc: func(ctx context.Context, id uuid.UUID) error {
			return nil
		},
	}
	h := NewContestHandler(mock)
	contestID := uuid.New()
	c, rec := newTestContext("DELETE", "/api/v1/contests/"+contestID.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Delete(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestContestHandler_Publish_Success(t *testing.T) {
	contestID := uuid.New()
	taskID := uuid.New()
	publicSetID := uuid.New()
	privateSetID := uuid.New()
	mock := &db.MockQuerier{
		ListTasksByContestFunc: func(ctx context.Context, id uuid.UUID) ([]db.Task, error) {
			assert.Equal(t, contestID, id)
			return []db.Task{{
				ID:               taskID,
				ContestID:        contestID,
				Slug:             "classification",
				SubmissionSchema: []byte(`{"task_assets":{"required_assets":["judge.py"]},"evaluation":{"required_assets":["ground_truth","inputs"]}}`),
			}}, nil
		},
		ListTaskAssetsFunc: func(ctx context.Context, id uuid.UUID) ([]db.TaskAsset, error) {
			assert.Equal(t, taskID, id)
			return []db.TaskAsset{{TaskID: taskID, AssetKey: "judge.py"}}, nil
		},
		ListEvaluationSetsByTaskFunc: func(ctx context.Context, id uuid.UUID) ([]db.TaskEvaluationSet, error) {
			assert.Equal(t, taskID, id)
			return []db.TaskEvaluationSet{
				{ID: publicSetID, TaskID: taskID, Key: db.EvaluationSetKeyPublic},
				{ID: privateSetID, TaskID: taskID, Key: db.EvaluationSetKeyPrivate},
			}, nil
		},
		ListEvaluationSetAssetsFunc: func(ctx context.Context, id uuid.UUID) ([]db.EvaluationSetAsset, error) {
			return []db.EvaluationSetAsset{
				{EvaluationSetID: id, AssetKey: "ground_truth"},
				{EvaluationSetID: id, AssetKey: "inputs"},
			}, nil
		},
		UpdateContestStatusFunc: func(ctx context.Context, arg db.UpdateContestStatusParams) (db.Contest, error) {
			return db.Contest{
				ID:          contestID,
				Slug:        "pub-contest",
				Title:       "Pub Contest",
				Status:      db.ContestStatusRegistrationOpen,
				EntryPolicy: db.ContestEntryPolicyIndividual,
				Visibility:  db.ContestVisibilityPublic,
			}, nil
		},
	}
	h := NewContestHandler(mock)
	c, rec := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/publish", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Publish(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, "registration_open", resp["status"])
}

func TestContestHandler_Publish_BlocksMissingAssets(t *testing.T) {
	contestID := uuid.New()
	taskID := uuid.New()
	setID := uuid.New()
	statusUpdated := false
	mock := &db.MockQuerier{
		ListTasksByContestFunc: func(ctx context.Context, id uuid.UUID) ([]db.Task, error) {
			return []db.Task{{
				ID:               taskID,
				ContestID:        contestID,
				Slug:             "classification",
				SubmissionSchema: []byte(`{"task_assets":{"required_assets":["judge.py"]},"evaluation":{"required_assets":["ground_truth","inputs"]}}`),
			}}, nil
		},
		ListTaskAssetsFunc: func(ctx context.Context, id uuid.UUID) ([]db.TaskAsset, error) {
			return nil, nil
		},
		ListEvaluationSetsByTaskFunc: func(ctx context.Context, id uuid.UUID) ([]db.TaskEvaluationSet, error) {
			return []db.TaskEvaluationSet{{ID: setID, TaskID: taskID, Key: db.EvaluationSetKeyPublic}}, nil
		},
		ListEvaluationSetAssetsFunc: func(ctx context.Context, id uuid.UUID) ([]db.EvaluationSetAsset, error) {
			return []db.EvaluationSetAsset{{EvaluationSetID: setID, AssetKey: "ground_truth"}}, nil
		},
		UpdateContestStatusFunc: func(ctx context.Context, arg db.UpdateContestStatusParams) (db.Contest, error) {
			statusUpdated = true
			return db.Contest{}, nil
		},
	}
	h := NewContestHandler(mock)
	c, _ := newTestContext("POST", "/api/v1/contests/"+contestID.String()+"/publish", "")
	c.SetParamNames("id")
	c.SetParamValues(contestID.String())

	err := h.Publish(c)

	assert.Error(t, err)
	assert.False(t, statusUpdated)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, appErr.Status)
	assert.Contains(t, appErr.Message, "missing task asset judge.py")
	assert.Contains(t, appErr.Message, "missing asset inputs")
}
