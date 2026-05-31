package middleware

import (
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
)

const ctxWorkerToken = "worker_token"

// WorkerAuth validates X-Worker-Token header against active volunteer workers.
func WorkerAuth(q db.Querier) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token := c.Request().Header.Get("X-Worker-Token")
			if token == "" {
				return ErrUnauthorized("missing X-Worker-Token header")
			}
			if _, err := q.GetVolunteerWorkerByToken(c.Request().Context(), &token); err != nil {
				return ErrUnauthorized("invalid or inactive worker token")
			}
			c.Set(ctxWorkerToken, token)
			return next(c)
		}
	}
}

// GetWorkerToken extracts the validated worker token from context.
func GetWorkerToken(c echo.Context) string {
	t, _ := c.Get(ctxWorkerToken).(string)
	return t
}
