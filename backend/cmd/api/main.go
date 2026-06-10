// cmd/api is the HTTP API entrypoint. Loads config, opens pools, boots Echo,
// and coordinates graceful shutdown.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/config"
	"github.com/mank1/olpai-backend/internal/email"
	olpaihttp "github.com/mank1/olpai-backend/internal/http"
	"github.com/mank1/olpai-backend/internal/metrics"
	"github.com/mank1/olpai-backend/internal/queue"
	"github.com/mank1/olpai-backend/internal/repo"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/mank1/olpai-backend/internal/storage"
	"github.com/mank1/olpai-backend/pkg/logger"
	"github.com/rs/zerolog"
)

func pgUUID(id uuid.UUID) pgtype.UUID {
	if id == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}

func jsonText(v any) string {
	if v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

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

	var s3 *storage.S3
	if cfg.S3Endpoint != "" && cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
		s3, err = storage.New(storage.Config{
			Endpoint:       cfg.S3Endpoint,
			PublicEndpoint: cfg.S3PublicEndpoint,
			Region:         cfg.S3Region,
			Bucket:         cfg.S3Bucket,
			AccessKey:      cfg.S3AccessKey,
			SecretKey:      cfg.S3SecretKey,
		})
		if err != nil {
			log.Warn().Err(err).Msg("s3 unavailable (artifact upload disabled)")
		} else if err := s3.EnsureBucket(bootCtx); err != nil {
			log.Warn().Err(err).Msg("s3 bucket unavailable (artifact upload disabled)")
			s3 = nil
		}
	}

	jwtMgr := security.NewJWTManager(cfg.JWTSecret, cfg.JWTTTL)

	var producer *queue.Producer
	if rdb != nil {
		producer = queue.NewProducer(rdb)
		if err := producer.EnsureConsumerGroup(bootCtx); err != nil {
			log.Warn().Err(err).Msg("consumer group init failed (volunteer dispatch may not work)")
		}
	}

	var mailer *email.Mailer
	if cfg.SMTPHost != "" && cfg.SMTPUser != "" && cfg.SMTPPassword != "" {
		mailer = email.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPFrom)
		log.Info().Str("smtp_host", cfg.SMTPHost).Str("smtp_user", cfg.SMTPUser).Msg("email mailer configured")
	} else {
		log.Warn().Msg("SMTP not configured — forgot-password emails will not be sent")
	}

	e := olpaihttp.NewRouter(&olpaihttp.Deps{
		Pool:       pool,
		Redis:      rdb,
		Storage:    s3,
		Log:        log,
		JWTMgr:     jwtMgr,
		Producer:   producer,
		Mailer:     mailer,
		AppBaseURL: cfg.AppBaseURL,
	})

	runCtx, runCancel := context.WithCancel(context.Background())
	defer runCancel()
	if rdb != nil {
		bridge := queue.NewLeaderboardBridge(rdb, pool, log)
		go func() {
			if err := bridge.Run(runCtx); err != nil && !errors.Is(err, context.Canceled) {
				log.Error().Err(err).Msg("leaderboard bridge")
			}
		}()

		// Reclaim stale volunteer worker jobs every 60 seconds.
		go runWorkerTimeoutWatcher(runCtx, db.New(pool), producer, log)
	}

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
	runCancel()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("shutdown")
	}
}

func runWorkerTimeoutWatcher(ctx context.Context, q *db.Queries, producer *queue.Producer, log zerolog.Logger) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	const (
		nonFinalJobTimeout = 10 * time.Minute
		finalJobTimeout    = 30 * time.Minute
		orphanRunTimeout   = 3 * time.Minute
	)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			nonFinalCutoff := pgtype.Timestamptz{Time: time.Now().Add(-nonFinalJobTimeout), Valid: true}
			finalCutoff := pgtype.Timestamptz{Time: time.Now().Add(-finalJobTimeout), Valid: true}
			// Batch delete all stale claims in one query
			stale, err := q.DeleteStaleWorkerClaims(ctx, db.DeleteStaleWorkerClaimsParams{
				ClaimedAt:   nonFinalCutoff,
				ClaimedAt_2: finalCutoff,
			})
			if err != nil {
				log.Error().Err(err).Msg("batch delete stale worker claims")
				continue
			}
			// Re-enqueue in a pipeline for efficiency
			for _, claim := range stale {
				_, _ = q.MarkSubmissionRequeued(ctx, claim.SubmissionID)
				if err := producer.EnqueueJudge(ctx, claim.SubmissionID, nil); err != nil {
					log.Error().Err(err).Str("submission", claim.SubmissionID.String()).Msg("re-enqueue stale job")
					continue
				}
				_ = q.InsertExperimentEvent(ctx, db.InsertExperimentEventParams{
					EventType:    "job_requeued",
					SubmissionID: pgUUID(claim.SubmissionID),
					WorkerID:     pgUUID(claim.WorkerID),
					AttemptID:    pgUUID(claim.AttemptID),
					Column8: jsonText(map[string]any{
						"reason": "stale_claim",
					}),
				})
				_, _ = q.IncrementWorkerFailedByID(ctx, claim.WorkerID)
				metrics.JobTimeoutTotal.WithLabelValues("fifo").Inc()
				log.Warn().Str("worker", claim.WorkerID.String()).Str("submission", claim.SubmissionID.String()).Msg("reclaimed stale job")
			}

			orphanCutoff := pgtype.Timestamptz{Time: time.Now().Add(-orphanRunTimeout), Valid: true}
			orphans, err := q.RequeueOrphanRunningSubmissions(ctx, db.RequeueOrphanRunningSubmissionsParams{
				UpdatedAt: orphanCutoff,
				Limit:     100,
			})
			if err != nil {
				log.Error().Err(err).Msg("requeue orphan running submissions")
				continue
			}
			for _, sub := range orphans {
				if err := producer.EnqueueJudge(ctx, sub.ID, nil); err != nil {
					log.Error().Err(err).Str("submission", sub.ID.String()).Msg("re-enqueue orphan running submission")
					continue
				}
				_ = q.InsertExperimentEvent(ctx, db.InsertExperimentEventParams{
					EventType:    "job_requeued",
					SubmissionID: pgUUID(sub.ID),
					Column8: jsonText(map[string]any{
						"reason": "orphan_running_submission",
					}),
				})
				log.Warn().Str("submission", sub.ID.String()).Msg("requeued orphan running submission")
			}
		}
	}
}
