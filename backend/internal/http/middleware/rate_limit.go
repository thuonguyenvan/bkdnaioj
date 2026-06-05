package middleware

import (
	"fmt"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

// RateLimitIP limits requests by client IP using a fixed-window counter in Redis.
// If rdb is nil the limiter is skipped (fail-open).
func RateLimitIP(rdb *redis.Client, max int, window time.Duration) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if rdb == nil {
				return next(c)
			}
			ip := clientIP(c)
			key := fmt.Sprintf("rl:ip:%s:%s", sanitize(c.Path()), ip)
			return checkLimit(c, rdb, key, max, window, next)
		}
	}
}

// RateLimitUser limits requests by authenticated user ID (run after JWTAuth).
// Falls back to IP-based limiting if the user is not authenticated.
func RateLimitUser(rdb *redis.Client, max int, window time.Duration) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if rdb == nil {
				return next(c)
			}
			uid, _ := c.Get(CtxUserID).(int64)
			var key string
			if uid != 0 {
				key = fmt.Sprintf("rl:user:%d:%s", uid, sanitize(c.Path()))
			} else {
				key = fmt.Sprintf("rl:ip:%s:%s", sanitize(c.Path()), clientIP(c))
			}
			return checkLimit(c, rdb, key, max, window, next)
		}
	}
}

func checkLimit(c echo.Context, rdb *redis.Client, key string, max int, window time.Duration, next echo.HandlerFunc) error {
	ctx := c.Request().Context()
	count, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return next(c) // fail-open
	}
	if count == 1 {
		rdb.Expire(ctx, key, window) //nolint:errcheck
	}
	if count > int64(max) {
		return ErrTooManyRequests("too many requests, please try again later")
	}
	return next(c)
}

// clientIP extracts the real client IP, respecting Cloudflare and reverse-proxy headers.
func clientIP(c echo.Context) string {
	if ip := c.Request().Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := c.Request().Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := c.Request().Header.Get("X-Forwarded-For"); ip != "" {
		return strings.SplitN(ip, ",", 2)[0]
	}
	return c.RealIP()
}

func sanitize(path string) string {
	return strings.ReplaceAll(path, "/", "_")
}
