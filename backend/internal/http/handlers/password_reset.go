package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/email"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

func pgTime(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

type PasswordResetHandler struct {
	q       db.Querier
	mailer  *email.Mailer
	baseURL string // e.g. "https://www.bkdnaioj.app"
}

func NewPasswordResetHandler(q db.Querier, mailer *email.Mailer, baseURL string) *PasswordResetHandler {
	return &PasswordResetHandler{q: q, mailer: mailer, baseURL: baseURL}
}

// POST /api/v1/auth/forgot-password
func (h *PasswordResetHandler) ForgotPassword(c echo.Context) error {
	var req struct {
		Email string `json:"email" validate:"required,email"`
	}
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request")
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	ctx := c.Request().Context()

	// Always return success to prevent email enumeration
	user, err := h.q.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Error().Err(err).Str("email", req.Email).Msg("forgot-password: db lookup failed")
		} else {
			log.Info().Str("email", req.Email).Msg("forgot-password: email not found")
		}
		return c.JSON(http.StatusOK, map[string]string{"message": "If that email exists, a reset link has been sent."})
	}

	// Generate secure token
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return mw.ErrInternal("token generation failed")
	}
	token := hex.EncodeToString(b)
	expires := time.Now().Add(30 * time.Minute)

	if _, err := h.q.CreatePasswordResetToken(ctx, db.CreatePasswordResetTokenParams{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: pgTime(expires),
	}); err != nil {
		log.Error().Err(err).Msg("forgot-password: create token failed")
		return mw.ErrInternal("could not create reset token")
	}

	resetURL := h.baseURL + "/reset-password?token=" + token
	if err := h.mailer.SendPasswordReset(req.Email, resetURL); err != nil {
		log.Error().Err(err).Str("to", req.Email).Msg("forgot-password: send email failed")
	} else {
		log.Info().Str("to", req.Email).Msg("forgot-password: email sent")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "If that email exists, a reset link has been sent."})
}

// POST /api/v1/auth/reset-password
func (h *PasswordResetHandler) ResetPassword(c echo.Context) error {
	var req struct {
		Token    string `json:"token"    validate:"required"`
		Password string `json:"password" validate:"required,min=8"`
	}
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request")
	}

	ctx := c.Request().Context()

	row, err := h.q.GetValidPasswordResetToken(ctx, req.Token)
	if err != nil {
		return mw.ErrBadRequest("invalid or expired reset token")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return mw.ErrInternal("password hash failed")
	}

	if err := h.q.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           row.UserID,
		PasswordHash: string(hash),
	}); err != nil {
		return mw.ErrInternal("password update failed")
	}

	_ = h.q.MarkPasswordResetTokenUsed(ctx, req.Token)

	return c.JSON(http.StatusOK, map[string]string{"message": "Password updated successfully."})
}

// POST /api/v1/auth/register — overrides to add username
// (integrated into existing AuthHandler)
