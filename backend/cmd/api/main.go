// cmd/api is the HTTP API entrypoint. Loads config, opens pools, boots Echo,
// and coordinates graceful shutdown.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/mank1/olpai-backend/internal/config"
	olpaihttp "github.com/mank1/olpai-backend/internal/http"
	"github.com/mank1/olpai-backend/internal/queue"
	"github.com/mank1/olpai-backend/internal/repo"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/mank1/olpai-backend/pkg/logger"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(1)
	}
	log := logger.New(cfg.LogLevel)

	bootCtx, bootCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer bootCancel()

	pool, err := repo.NewPool(bootCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("db pool")
	}
	defer pool.Close()

	// Redis is optional for Phase 2 (auth/users/teams don't need it).
	// Will fail gracefully; /readyz reports degraded.
	rdb, err := queue.NewRedis(bootCtx, cfg.RedisURL)
	if err != nil {
		log.Warn().Err(err).Msg("redis unavailable (queue features disabled)")
	}
	if rdb != nil {
		defer rdb.Close()
	}

	jwtMgr := security.NewJWTManager(cfg.JWTSecret, cfg.JWTTTL)

	e := olpaihttp.NewRouter(&olpaihttp.Deps{
		Pool:   pool,
		Redis:  rdb,
		Log:    log,
		JWTMgr: jwtMgr,
	})

	go func() {
		log.Info().Str("addr", cfg.HTTPAddr).Msg("listening")
		if err := e.Start(cfg.HTTPAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("http server")
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Info().Msg("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("shutdown")
	}
}
