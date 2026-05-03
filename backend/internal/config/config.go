// Package config loads environment-driven runtime configuration.
// Uses viper with env var binding. Validated on startup via validator tags.
package config

import (
	"fmt"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// Config holds all runtime settings. Populated from env vars (see .env.example).
type Config struct {
	HTTPAddr    string        `mapstructure:"HTTP_ADDR"    validate:"required"`
	DatabaseURL string        `mapstructure:"DATABASE_URL" validate:"required,url"`
	RedisURL    string        `mapstructure:"REDIS_URL"`
	JWTSecret   string        `mapstructure:"JWT_SECRET"   validate:"required,min=16"`
	JWTTTL      time.Duration `mapstructure:"JWT_TTL"`
	S3Endpoint  string        `mapstructure:"S3_ENDPOINT"`
	S3Region    string        `mapstructure:"S3_REGION"`
	S3Bucket    string        `mapstructure:"S3_BUCKET"`
	S3AccessKey string        `mapstructure:"S3_ACCESS_KEY"`
	S3SecretKey string        `mapstructure:"S3_SECRET_KEY"`
	LogLevel    string        `mapstructure:"LOG_LEVEL"`
}

// Load reads .env (if present) + environment and returns a validated Config.
func Load() (*Config, error) {
	_ = godotenv.Load() // best-effort; prod uses real env vars

	v := viper.New()
	v.AutomaticEnv()
	v.SetDefault("HTTP_ADDR", ":8080")
	v.SetDefault("JWT_TTL", "168h")
	v.SetDefault("S3_REGION", "us-east-1")
	v.SetDefault("S3_BUCKET", "submissions")
	v.SetDefault("LOG_LEVEL", "info")

	// viper needs an explicit bind for AutomaticEnv + Unmarshal to populate struct fields
	for _, k := range []string{
		"HTTP_ADDR", "DATABASE_URL", "REDIS_URL", "JWT_SECRET", "JWT_TTL",
		"S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY",
		"LOG_LEVEL",
	} {
		_ = v.BindEnv(k)
	}

	cfg := &Config{}
	if err := v.Unmarshal(cfg); err != nil {
		return nil, fmt.Errorf("config unmarshal: %w", err)
	}
	if err := validator.New().Struct(cfg); err != nil {
		return nil, fmt.Errorf("config validation: %w", err)
	}
	return cfg, nil
}
