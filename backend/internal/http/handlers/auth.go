// Package handlers contains Echo handler functions for API endpoints.
package handlers

import (
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/security"
)

// AuthHandler groups auth-related handlers.
type AuthHandler struct {
	q   db.Querier
	jwt *security.JWTManager
	val *validator.Validate
}

func NewAuthHandler(q db.Querier, jwt *security.JWTManager) *AuthHandler {
	return &AuthHandler{q: q, jwt: jwt, val: validator.New()}
}

// Register creates a new user account.
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c echo.Context) error {
	var req dto.RegisterRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	hash, err := security.HashPassword(req.Password)
	if err != nil {
		return mw.ErrInternal("failed to hash password")
	}

	user, err := h.q.CreateUser(c.Request().Context(), db.CreateUserParams{
		Email:        req.Email,
		PasswordHash: hash,
		FullName:     req.FullName,
		Role:         db.UserRoleContestant,
		StudentID:    req.StudentID,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return mw.ErrConflict("email already registered")
		}
		return mw.ErrInternal("create user failed")
	}

	token, err := h.jwt.Issue(user.ID, string(user.Role))
	if err != nil {
		return mw.ErrInternal("token generation failed")
	}

	return c.JSON(http.StatusCreated, dto.AuthResponse{
		User:  dto.UserToResponse(user),
		Token: dto.TokenResponse{AccessToken: token, TokenType: "bearer", ExpiresIn: 604800},
	})
}

// Login authenticates a user and returns a JWT.
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c echo.Context) error {
	var req dto.LoginRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}

	// Allow login with email or username
	ctx := c.Request().Context()
	user, err := h.q.GetUserByEmail(ctx, req.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		// Try username
		uname := req.Email // reuse field for username attempt
		user, err = h.q.GetUserByUsername(ctx, &uname)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrUnauthorized("invalid email or password")
		}
		return mw.ErrInternal("login failed")
	}
	if !security.CheckPassword(user.PasswordHash, req.Password) {
		return mw.ErrUnauthorized("invalid email or password")
	}

	// Touch last_visit async (fire-and-forget)
	go func() { _ = h.q.TouchUserLastVisit(c.Request().Context(), user.ID) }()

	token, err := h.jwt.Issue(user.ID, string(user.Role))
	if err != nil {
		return mw.ErrInternal("token generation failed")
	}

	return c.JSON(http.StatusOK, dto.AuthResponse{
		User:  dto.UserToResponse(user),
		Token: dto.TokenResponse{AccessToken: token, TokenType: "bearer", ExpiresIn: 604800},
	})
}

// Me returns the current authenticated user.
// GET /api/v1/auth/me
func (h *AuthHandler) Me(c echo.Context) error {
	uid := mw.GetUserID(c)
	user, err := h.q.GetUserByID(c.Request().Context(), uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("user not found")
		}
		return mw.ErrInternal("fetch user failed")
	}
	return c.JSON(http.StatusOK, dto.UserToResponse(user))
}
