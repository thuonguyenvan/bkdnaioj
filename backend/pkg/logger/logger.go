// Package logger builds a zerolog logger from a config string level.
package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

// New returns a zerolog.Logger configured for structured JSON output.
func New(level string) zerolog.Logger {
	lv, err := zerolog.ParseLevel(level)
	if err != nil || level == "" {
		lv = zerolog.InfoLevel
	}
	zerolog.TimeFieldFormat = time.RFC3339
	return zerolog.New(os.Stdout).Level(lv).With().Timestamp().Logger()
}
