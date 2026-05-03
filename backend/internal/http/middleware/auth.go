package middleware

import (
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/internal/security"
)

// Context keys for storing auth info.
const (
	CtxUserID = "user_id"
	CtxRole   = "role"
	CtxClaims = "claims"
)

// JWTAuth returns an Echo middleware that verifies Bearer tokens.
func JWTAuth(jwtMgr *security.JWTManager) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if header == "" {
				return ErrUnauthorized("missing authorization header")
			}
			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				return ErrUnauthorized("invalid authorization format")
			}
			claims, err := jwtMgr.Verify(parts[1])
			if err != nil {
				return ErrUnauthorized("invalid or expired token")
			}
			uid, err := security.UserIDFromClaims(claims)
			if err != nil {
				return ErrUnauthorized("invalid token subject")
			}
			c.Set(CtxUserID, uid)
			c.Set(CtxRole, claims.Role)
			c.Set(CtxClaims, claims)
			return next(c)
		}
	}
}

// RequireRole returns middleware that rejects requests from users without one of the given roles.
func RequireRole(roles ...string) echo.MiddlewareFunc {
	set := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		set[r] = struct{}{}
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role, _ := c.Get(CtxRole).(string)
			if _, ok := set[role]; !ok {
				return ErrForbidden("insufficient role")
			}
			return next(c)
		}
	}
}

// GetUserID extracts user UUID from context (set by JWTAuth).
func GetUserID(c echo.Context) uuid.UUID {
	uid, _ := c.Get(CtxUserID).(uuid.UUID)
	return uid
}
