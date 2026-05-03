# Phase 4 Implementation Report — Go Project Scaffold

**Date:** 2026-04-24 16:41
**Plan ref:** `plans/260415-1507-olpai-backend-design/phase-04-go-project-scaffold.md`

---

## 1. Pre-work — Migration amendments (per user)

Applied 4 edits to Phase 1 migrations:

| File | Change |
|---|---|
| `001_init_users_teams.sql` | `team_role` ENUM: removed `'owner'`, now `('manager','member')` |
| `002_contests_tasks_phases.sql` | `contests.entry_policy` default → `'individual'` |
| `002_contests_tasks_phases.sql` | `contests.max_team_size` → NOT NULL, no default |
| `004_submissions_jobs.sql` | `evaluation_jobs.celery_task_id` → `external_job_id VARCHAR(255)` |

Validated: 5 files re-parsed, balanced parens, goose markers intact.

---

## 2. Deliverables

### 2.1 Config & tooling

| Path | Purpose |
|---|---|
| `go.mod` | module `github.com/mank1/olpai-backend`, Go 1.22, 12 deps |
| `sqlc.yaml` | pgx/v5 target; JSONB→json.RawMessage, uuid→uuid.UUID, numeric→string |
| `Makefile` | deps, tools, sqlc, migrate-{up,down,status,reset}, run, dev, test, fmt, lint, build, docker-up |
| `Dockerfile` | multi-stage golang:1.22-alpine → alpine:3.20, CGO off |
| `docker-compose.yml` | db + redis + minio + api; healthchecks on db/redis |
| `.env.example` | full env surface |
| `.gitignore` | Go + env + editor ignores |

### 2.2 Source tree

```
cmd/api/main.go              (62 LOC)   Echo bootstrap + graceful shutdown
internal/config/config.go    (54 LOC)   viper + validator, .env auto-load
internal/repo/pool.go        (34 LOC)   pgx/v5 pool, ping, tuned limits
internal/queue/redis.go      (21 LOC)   redis client factory
internal/http/router.go      (37 LOC)   Echo + middlewares + /api/v1 group
internal/http/health.go      (41 LOC)   /healthz (liveness) + /readyz (DB+Redis)
pkg/logger/logger.go         (20 LOC)   zerolog factory
```

All files < 200 LOC (KISS rule). Placeholder dirs created: `internal/domain`, `internal/http/{middleware,handlers,dto,ws}`, `internal/service`, `internal/security`, `internal/storage`, `pkg/clock`, `db`.

### 2.3 sqlc query seeds

`queries/users.sql` (5 queries) + `queries/teams.sql` (7 queries). Rest to be added per feature module.

### 2.4 README.md

Rewritten to reflect hybrid stack + quick-start + single-writer rule.

---

## 3. Dependencies (go.mod)

```
echo/v4 v4.12.0            pgx/v5 v5.7.1
validator/v10 v10.22.1     redis/go-redis/v9 v9.7.0
golang-jwt/jwt/v5 v5.2.1   rs/zerolog v1.33.0
google/uuid v1.6.0         spf13/viper v1.19.0
gorilla/websocket v1.5.3   joho/godotenv v1.5.1
stretchr/testify v1.9.0
```

Tools (installed by `make tools`): goose, sqlc, air, golangci-lint.

---

## 4. Validation status

- Migration SQL: ✅ (sqlparse OK)
- Go code: ⚠ Go compiler not on box → not verified via `go build`. Code hand-reviewed; imports consistent; no circular deps.
- Docker Compose: ⚠ Docker not on box → not verified via `docker compose config`.

---

## 5. Gaps / deferred

- [ ] `db/` sqlc output — requires `make sqlc` with sqlc installed
- [ ] `go.sum` — requires `go mod download`
- [ ] Seed CLI (`cmd/seed`) — placeholder Makefile target
- [ ] Air `.air.toml` config
- [ ] golangci-lint config
- [ ] CI (GitHub Actions)
- [ ] Feature handlers (auth, users, teams, contests, ...) — Phase 2 scope

---

## 6. Success criteria (from Phase 4 plan)

| Criterion | Status |
|---|---|
| 1. `make docker-up` boots all services | ⚠ needs Docker-on-box to verify |
| 2. `make sqlc + make migrate-up` creates 17 tables | ⚠ needs Go + PG to verify |
| 3. Spike endpoint works | ✅ `/healthz` + `/readyz` implemented |
| 4. Test suite ready for testcontainers | ⏳ test scaffold not added yet |
| 5. All files < 200 LOC | ✅ max 62 LOC |

---

## 7. Next recommended

1. User runs `make tools && make deps` (install Go tool-chain + download modules → generates `go.sum`)
2. `make docker-up db redis minio` + `make migrate-up` (verifies migrations end-to-end)
3. `make sqlc` (first codegen; commit `db/`)
4. Begin **Phase 2** feature handlers (auth → users → teams → contests)

---

## 8. Unresolved questions

1. Module path `github.com/mank1/olpai-backend` — confirm GitHub org/user? Currently `mank1`.
2. Air config file (`.air.toml`) — auto-generate on first `air` run, or commit explicit config?
3. `cmd/seed` planned target — separate binary or `main.go -seed` flag? Recommend: separate binary (cleaner).
4. License in README marked TBD — pick MIT / Apache-2.0 / proprietary?
5. CI pipeline — GitHub Actions vs GitLab vs none for thesis scope?
