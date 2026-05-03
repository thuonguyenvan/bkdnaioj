package http

import (
	"context"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)

// healthz is cheap: just confirms process is up.
func healthz(_ *Deps) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}
}

// readyz checks DB + Redis liveness; used by orchestrator probes.
func readyz(d *Deps) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
		defer cancel()

		result := map[string]string{"status": "ok", "db": "ok", "redis": "ok"}
		status := http.StatusOK

		if err := d.Pool.Ping(ctx); err != nil {
			result["db"] = err.Error()
			result["status"] = "degraded"
			status = http.StatusServiceUnavailable
		}
		if d.Redis != nil {
			if err := d.Redis.Ping(ctx).Err(); err != nil {
				result["redis"] = err.Error()
				result["status"] = "degraded"
				status = http.StatusServiceUnavailable
			}
		} else {
			result["redis"] = "not configured"
		}
		return c.JSON(status, result)
	}
}
