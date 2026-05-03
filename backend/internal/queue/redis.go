// Package queue exposes a thin Redis Streams producer used by the Go API
// to enqueue jobs consumed by Python workers. Phase 5 defines the envelope.
package queue

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// NewRedis opens a Redis client from a URL; panics if URL is malformed.
func NewRedis(ctx context.Context, url string) (*redis.Client, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	c := redis.NewClient(opt)
	if err := c.Ping(ctx).Err(); err != nil {
		_ = c.Close()
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return c, nil
}
