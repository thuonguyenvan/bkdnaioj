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

func TestAdminHandler_Stats_Success(t *testing.T) {
	mock := &db.MockQuerier{
		CountUsersFunc: func(ctx context.Context) (int64, error) {
			return 42, nil
		},
		CountContestsFunc: func(ctx context.Context) (int64, error) {
			return 5, nil
		},
		CountSubmissionsFunc: func(ctx context.Context) (int64, error) {
			return 100, nil
		},
		CountActiveEntriesFunc: func(ctx context.Context) (int64, error) {
			return 20, nil
		},
	}
	h := NewAdminHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/admin/stats", "")

	err := h.Stats(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	body := parseBody(t, rec)
	assert.Equal(t, float64(42), body["users"])
	assert.Equal(t, float64(5), body["contests"])
	assert.Equal(t, float64(100), body["submissions"])
	assert.Equal(t, float64(20), body["active_entries"])
}

func TestAdminHandler_ListUsers_Success(t *testing.T) {
	mock := &db.MockQuerier{
		ListUsersAdminFunc: func(ctx context.Context, arg db.ListUsersAdminParams) ([]db.ListUsersAdminRow, error) {
			return []db.ListUsersAdminRow{
				{ID: uuid.New(), Email: "a@b.com", FullName: "User A", Role: "contestant"},
			}, nil
		},
	}
	h := NewAdminHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/admin/users", "")

	err := h.ListUsers(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestAdminHandler_UpdateUserRole_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		UpdateUserRoleFunc: func(ctx context.Context, arg db.UpdateUserRoleParams) (db.UpdateUserRoleRow, error) {
			return db.UpdateUserRoleRow{ID: userID, Email: "a@b.com", Role: "admin"}, nil
		},
	}
	h := NewAdminHandler(mock)
	body := `{"role":"admin"}`
	c, rec := newTestContext("PATCH", "/api/v1/admin/users/"+userID.String()+"/role", body)
	c.SetParamNames("id")
	c.SetParamValues(userID.String())

	err := h.UpdateUserRole(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestAdminHandler_UpdateUserRole_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		UpdateUserRoleFunc: func(ctx context.Context, arg db.UpdateUserRoleParams) (db.UpdateUserRoleRow, error) {
			return db.UpdateUserRoleRow{}, pgx.ErrNoRows
		},
	}
	h := NewAdminHandler(mock)
	body := `{"role":"admin"}`
	c, _ := newTestContext("PATCH", "/api/v1/admin/users/"+uuid.New().String()+"/role", body)
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.UpdateUserRole(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}

func TestAdminHandler_Health(t *testing.T) {
	h := NewAdminHandler(&db.MockQuerier{})
	c, rec := newTestContext("GET", "/api/v1/admin/health", "")

	err := h.Health(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	body := parseBody(t, rec)
	assert.Equal(t, "ok", body["status"])
}
