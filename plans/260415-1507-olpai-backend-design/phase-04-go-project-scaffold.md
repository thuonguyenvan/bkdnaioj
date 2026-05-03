# Phase 4: Go Project Scaffold

**Status:** 🆕 New
**Refs:** phases 01/02/03/05, brainstorm Go decision

---

## 1. Objective

Bootstrap Go project with production-ready layout, sqlc + goose wired, Docker Compose one-command up, and a 2-week ramp-up checklist for hobby-level Go team.

---

## 2. Repository Layout

```
olpai-backend/
├── cmd/
│   ├── api/
│   │   └── main.go              # Echo entrypoint
│   └── migrate/
│       └── main.go              # goose CLI wrapper (optional; can use goose binary)
├── internal/
│   ├── config/                  # viper loader
│   ├── domain/                  # enums, value objects (EntryType, ModeEnum, ...)
│   ├── http/
│   │   ├── router.go
│   │   ├── middleware/          # auth, authz, error, ratelimit, requestid, recover
│   │   ├── handlers/            # one file per module (<200 LOC each)
│   │   ├── dto/                 # one file per module
│   │   └── ws/                  # hub + gorilla/websocket
│   ├── service/                 # business logic, one file per domain
│   ├── repo/                    # thin wrappers around sqlc-generated
│   ├── queue/
│   │   ├── producer.go          # XADD + envelope
│   │   └── consumer.go          # WS bridge listens jobs:results
│   ├── storage/
│   │   └── s3.go                # MinIO client
│   └── security/
│       ├── jwt.go
│       └── password.go
├── pkg/
│   └── clock/                   # testable time provider
├── migrations/                  # goose SQL files
│   ├── 20260415000001_init_users_teams.sql
│   ├── 20260415000002_contests_tasks_phases.sql
│   ├── 20260415000003_contest_entries.sql
│   ├── 20260415000004_submissions_jobs.sql
│   └── 20260415000005_leaderboards_comms.sql
├── queries/                     # sqlc input (.sql with -- name: comments)
│   ├── users.sql
│   ├── teams.sql
│   ├── contests.sql
│   ├── phase_defs.sql
│   ├── tasks.sql
│   ├── phases.sql
│   ├── entries.sql
│   ├── submissions.sql
│   ├── eval_jobs.sql
│   ├── leaderboards.sql
│   └── comms.sql
├── db/                          # sqlc-generated output
│   ├── models.go
│   ├── querier.go
│   └── *_sql.go
├── sqlc.yaml
├── goose.env.example
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── go.mod
├── go.sum
└── README.md
```

**File-size rule:** every `.go` file < 200 LOC. Split handlers by sub-module if needed.

---

## 3. sqlc Configuration

```yaml
# sqlc.yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "queries"
    schema: "migrations"
    gen:
      go:
        package: "db"
        out: "db"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_pointers_for_null_types: true
        emit_enum_valid_method: true
        overrides:
          - db_type: "jsonb"
            go_type:
              import: "encoding/json"
              type: "RawMessage"
          - db_type: "uuid"
            go_type:
              import: "github.com/google/uuid"
              type: "UUID"
          - db_type: "timestamptz"
            go_type:
              import: "time"
              type: "Time"
          - db_type: "numeric"
            go_type: "string"      # preserve precision; convert in service layer
```

---

## 4. Migration Approach (goose)

- Convert 5 Alembic-equivalent migrations from Phase 1 into SQL goose files
- Each file: `-- +goose Up` / `-- +goose Down` markers
- Migrations = source of truth for sqlc schema parsing

Example:
```sql
-- migrations/20260415000003_contest_entries.sql
-- +goose Up
CREATE TYPE entry_type AS ENUM ('individual','team');
CREATE TYPE entry_mode AS ENUM ('official','virtual','practice');

CREATE TABLE contest_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  entry_type entry_type NOT NULL,
  entry_mode entry_mode NOT NULL,
  user_id UUID REFERENCES users(id),
  team_id UUID REFERENCES teams(id),
  display_name VARCHAR(255) NOT NULL,
  ...
  CONSTRAINT entry_exactly_one CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL AND team_id IS NOT NULL)
  ),
  CONSTRAINT entry_type_consistency CHECK (
    (entry_type='individual' AND user_id IS NOT NULL) OR
    (entry_type='team' AND team_id IS NOT NULL)
  ),
  CONSTRAINT virtual_window CHECK (
    entry_mode <> 'virtual' OR (start_at IS NOT NULL AND end_at IS NOT NULL AND start_at < end_at)
  ),
  UNIQUE (id, contest_id)
);
CREATE UNIQUE INDEX ... WHERE user_id IS NOT NULL;
-- ...

-- +goose Down
DROP TABLE contest_entries;
DROP TYPE entry_mode;
DROP TYPE entry_type;
```

---

## 5. Sample sqlc Query File

```sql
-- queries/submissions.sql

-- name: InsertSubmission :one
INSERT INTO submissions (
  id, contest_id, contest_entry_id, task_id, phase_id, submitted_by,
  status, submitted_at, file_count, total_size_bytes, manifest_hash,
  client_ip, user_agent
) VALUES (
  gen_random_uuid(), $1, $2, $3, $4, $5,
  'uploaded', now(), $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetSubmission :one
SELECT * FROM submissions WHERE id = $1;

-- name: ListSubmissionsByEntry :many
SELECT * FROM submissions
WHERE contest_entry_id = $1
  AND (sqlc.narg('task_id')::uuid IS NULL OR task_id = sqlc.narg('task_id'))
  AND (sqlc.narg('phase_id')::uuid IS NULL OR phase_id = sqlc.narg('phase_id'))
ORDER BY submitted_at DESC
LIMIT $2 OFFSET $3;

-- Python writes status/score — Go does NOT have an UPDATE query for those columns.
```

Single-writer rule enforced **at code level** by omitting score-update queries from Go sqlc inputs.

---

## 6. Makefile

```makefile
.PHONY: sqlc migrate-up migrate-down migrate-status run dev test fmt lint build docker-up

SHELL := /bin/bash
DB_URL ?= postgres://olpai:olpai@localhost:5432/olpai?sslmode=disable

sqlc:
	sqlc generate

migrate-up:
	goose -dir migrations postgres "$(DB_URL)" up

migrate-down:
	goose -dir migrations postgres "$(DB_URL)" down

migrate-status:
	goose -dir migrations postgres "$(DB_URL)" status

run:
	go run ./cmd/api

dev:
	air    # hot-reload

test:
	go test ./... -race -cover

fmt:
	gofumpt -w .
	goimports -w .

lint:
	golangci-lint run

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/api ./cmd/api

docker-up:
	docker compose up -d --build
```

---

## 7. Docker Compose

```yaml
services:
  db:
    image: postgres:15
    environment: [POSTGRES_USER=olpai, POSTGRES_PASSWORD=olpai, POSTGRES_DB=olpai]
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000","9001:9001"]
    volumes: [miniodata:/data]

  api:
    build: .
    environment:
      DATABASE_URL: postgres://olpai:olpai@db:5432/olpai?sslmode=disable
      REDIS_URL: redis://redis:6379/0
      S3_ENDPOINT: http://minio:9000
      JWT_SECRET: dev-secret
    ports: ["8080:8080"]
    depends_on: [db, redis, minio]

  worker-validate: &worker
    build: ./workers
    environment: { WORKER_ROLE: validate, ... }
    depends_on: [db, redis]
  worker-judge:
    <<: *worker
    privileged: true
    environment: { WORKER_ROLE: judge, ... }
  worker-score:
    <<: *worker
    environment: { WORKER_ROLE: score, ... }

volumes: { pgdata: {}, miniodata: {} }
```

---

## 8. Config (viper)

```go
type Config struct {
    HTTPAddr   string `mapstructure:"HTTP_ADDR" default:":8080"`
    DatabaseURL string `mapstructure:"DATABASE_URL" validate:"required"`
    RedisURL    string `mapstructure:"REDIS_URL"    validate:"required"`
    JWTSecret   string `mapstructure:"JWT_SECRET"   validate:"required,min=32"`
    JWTTTL      time.Duration `mapstructure:"JWT_TTL" default:"168h"`
    S3Endpoint  string `mapstructure:"S3_ENDPOINT"`
    S3Bucket    string `mapstructure:"S3_BUCKET" default:"submissions"`
    LogLevel    string `mapstructure:"LOG_LEVEL" default:"info"`
}
```

---

## 9. Dependencies (go.mod highlights)

```
github.com/labstack/echo/v4
github.com/go-playground/validator/v10
github.com/golang-jwt/jwt/v5
github.com/gorilla/websocket
github.com/jackc/pgx/v5
github.com/redis/go-redis/v9
github.com/google/uuid
github.com/rs/zerolog
github.com/spf13/viper
github.com/minio/minio-go/v7
github.com/stretchr/testify
github.com/testcontainers/testcontainers-go
```

Tooling (installed via Makefile or asdf):
```
github.com/pressly/goose/v3/cmd/goose@latest
github.com/sqlc-dev/sqlc/cmd/sqlc@latest
github.com/air-verse/air@latest
mvdan.cc/gofumpt@latest
github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

---

## 10. 2-Week Go Ramp-Up (team hobby-level)

### Week 1: Foundations
- Day 1: Go tour + effective-go refresher; read `stdlib/context` + `stdlib/net/http`
- Day 2: pgx/v5 crash course; `testcontainers-go` with Postgres
- Day 3: Echo middlewares + error handling; write sample CRUD on 1 table
- Day 4: sqlc generate pipeline; write queries for `users` + CRUD endpoint
- Day 5: Goroutines/channels/context patterns; write a mini WS echo server

### Week 2: Project patterns
- Day 6: Auth flow (JWT issue/verify) + middleware
- Day 7: goose migration lifecycle; run schema up/down idempotent
- Day 8: Redis Streams client patterns (XADD, XREADGROUP, XPENDING)
- Day 9: Docker Compose wiring (api + db + redis + minio)
- Day 10: Spike end-to-end vertical slice (register → login → `/me`)

Deliverable at week 2: working spike branch merged, not feature code.

---

## 11. Todo

- [ ] Init `go mod init github.com/<org>/olpai-backend`
- [ ] Scaffold directories
- [ ] Write sqlc.yaml + first 2 queries files
- [ ] Port 5 migrations from Phase 1 to goose SQL
- [ ] Makefile + Docker Compose
- [ ] Echo router skeleton + middleware stubs
- [ ] 2-week ramp-up kickoff + pair-programming schedule
- [ ] CI (GitHub Actions): `go test` + `sqlc diff` + `goose status`

---

## 12. Success Criteria

1. `make docker-up` → all services healthy
2. `make sqlc` + `make migrate-up` → 17 tables created
3. Spike endpoint `/healthz` + `/api/v1/auth/register` works
4. Test suite with testcontainers runs in CI
5. All files < 200 LOC

---

## 13. Next → Phase 5 (queue protocol) + begin feature modules
