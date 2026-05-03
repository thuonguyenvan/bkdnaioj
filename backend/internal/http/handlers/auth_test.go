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

func newJWT() *security.JWTManager {
	return security.NewJWTManager("test-secret-32-chars-minimum!!!!!", 24*time.Hour)
}

func TestAuthHandler_Register_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		CreateUserFunc: func(ctx context.Context, arg db.CreateUserParams) (db.User, error) {
			return db.User{
				ID:       userID,
				Email:    arg.Email,
				FullName: arg.FullName,
				Role:     db.UserRoleContestant,
			}, nil
		},
	}
	h := NewAuthHandler(mock, newJWT())
	body := `{"email":"test@example.com","password":"test1234","full_name":"Test User"}`
	c, rec := newTestContext("POST", "/api/v1/auth/register", body)

	err := h.Register(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
	resp := parseBody(t, rec)
	assert.NotNil(t, resp["user"])
	assert.NotNil(t, resp["token"])
}

func TestAuthHandler_Register_DuplicateEmail(t *testing.T) {
	mock := &db.MockQuerier{
		CreateUserFunc: func(ctx context.Context, arg db.CreateUserParams) (db.User, error) {
			return db.User{}, &pgconn.PgError{Code: "23505"}
		},
	}
	h := NewAuthHandler(mock, newJWT())
	body := `{"email":"dup@example.com","password":"test1234","full_name":"Dup User"}`
	c, _ := newTestContext("POST", "/api/v1/auth/register", body)

	err := h.Register(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusConflict, appErr.Status)
}

func TestAuthHandler_Register_ValidationError(t *testing.T) {
	mock := &db.MockQuerier{}
	h := NewAuthHandler(mock, newJWT())
	body := `{"email":"bad"}`
	c, _ := newTestContext("POST", "/api/v1/auth/register", body)

	err := h.Register(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, appErr.Status)
}

func TestAuthHandler_Login_Success(t *testing.T) {
	userID := uuid.New()
	hash, _ := security.HashPassword("test1234")
	mock := &db.MockQuerier{
		GetUserByEmailFunc: func(ctx context.Context, email string) (db.User, error) {
			return db.User{
				ID:           userID,
				Email:        email,
				PasswordHash: hash,
				FullName:     "Test User",
				Role:         db.UserRoleContestant,
			}, nil
		},
	}
	h := NewAuthHandler(mock, newJWT())
	body := `{"email":"test@example.com","password":"test1234"}`
	c, rec := newTestContext("POST", "/api/v1/auth/login", body)

	err := h.Login(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.NotNil(t, resp["user"])
	assert.NotNil(t, resp["token"])
}

func TestAuthHandler_Login_WrongPassword(t *testing.T) {
	hash, _ := security.HashPassword("correct-password")
	mock := &db.MockQuerier{
		GetUserByEmailFunc: func(ctx context.Context, email string) (db.User, error) {
			return db.User{
				ID:           uuid.New(),
				Email:        email,
				PasswordHash: hash,
				Role:         db.UserRoleContestant,
			}, nil
		},
	}
	h := NewAuthHandler(mock, newJWT())
	body := `{"email":"test@example.com","password":"wrong-password"}`
	c, _ := newTestContext("POST", "/api/v1/auth/login", body)

	err := h.Login(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusUnauthorized, appErr.Status)
}

func TestAuthHandler_Login_UserNotFound(t *testing.T) {
	mock := &db.MockQuerier{
		GetUserByEmailFunc: func(ctx context.Context, email string) (db.User, error) {
			return db.User{}, pgx.ErrNoRows
		},
	}
	h := NewAuthHandler(mock, newJWT())
	body := `{"email":"noone@example.com","password":"test1234"}`
	c, _ := newTestContext("POST", "/api/v1/auth/login", body)

	err := h.Login(c)

	assert.Error(t, err)
	appErr, ok := err.(*mw.AppError)
	assert.True(t, ok)
	assert.Equal(t, http.StatusUnauthorized, appErr.Status)
}

func TestAuthHandler_Me_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		GetUserByIDFunc: func(ctx context.Context, id uuid.UUID) (db.User, error) {
			return db.User{
				ID:       userID,
				Email:    "me@example.com",
				FullName: "Me User",
				Role:     db.UserRoleContestant,
			}, nil
		},
	}
	h := NewAuthHandler(mock, newJWT())
	c, rec := newTestContext("GET", "/api/v1/auth/me", "")
	setAuthContext(c, userID, "contestant")

	err := h.Me(c)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := parseBody(t, rec)
	assert.Equal(t, userID.String(), resp["id"])
}
