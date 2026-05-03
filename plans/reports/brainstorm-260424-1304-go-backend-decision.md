# Brainstorm Report — Go Backend Decision for OLPAI

**Date:** 2026-04-24 13:04
**Topic:** Có nên dùng Go làm backend chính thay cho FastAPI không?
**Verdict:** ✅ **Hybrid Go + Python** — approved với điều kiện.
**Ref plan đang tái cấu trúc:** `plans/260415-1507-olpai-backend-design/`

---

## 1. Problem Statement

Plan hiện tại (FastAPI + Celery + SQLAlchemy) đã align xong với spec 17-table entry-driven. User muốn đổi backend chính sang **Go**. Cần validate tính hợp lý, tránh quyết định cảm tính.

## 2. Context (user inputs)

- **Motivation:** performance/concurrency + CV value cho job
- **Workers:** giữ Python (không port numpy/sklearn/BLEU/PSNR metric)
- **Team/timeline:** 2–3 người, < 6 tháng
- **Go skill:** hobby project level (chưa ship production)
- **Project type:** thesis

## 3. Evaluated Approaches

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Stay FastAPI** | Plan đã có, velocity cao, ecosystem AI-Python native, không sunk cost | Không học được Go, WS/conn scale yếu hơn | Nếu gấp & solo |
| **All-in Go** | Single-language, single binary deploy, perf tốt nhất | Port metric AI sang Go tốn nhiều công, hobby skill chưa đủ, mất thời gian | ❌ Reject |
| **Hybrid Go API + Python workers** ✅ | Tận dụng Python cho AI judging, Go cho API/WS/concurrency, CV value, đủ thời gian | Protocol queue cần tự thiết kế (Celery/asynq không tương thích), debug xuyên ngôn ngữ, team cần 1 senior Go | **CHOSEN** |
| **Spike 1 tuần** | Giảm risk | Trì hoãn plan | Không cần nếu commit |

## 4. Chosen Solution

### 4.1 Architecture

```
React FE ──► Go API (Echo + WebSocket)
              │
              ├─► PostgreSQL (sqlc generated queries)
              ├─► MinIO (submission artifacts)
              └─► Redis Streams (job queue)
                     │
                     ▼
              Python Workers (validate / judge / score)
                     │
                     ▼ (UPDATE status/score qua DB hoặc callback)
                  PostgreSQL
```

### 4.2 Stack chốt

| Layer | Chosen | Lý do |
|---|---|---|
| Web framework | **Echo** | Full-feature, gần FastAPI, middleware chain tốt |
| DB access | **sqlc** | Type-safe generated code, handle composite FK ngon, không magic như GORM |
| Migration | **goose** | Simple, SQL-native, sync được với 5-migration plan |
| Validation | **go-playground/validator** | Struct tags, quen thuộc |
| WebSocket | **gorilla/websocket** | Production-grade, battle-tested |
| Job queue | **Redis Streams** (không asynq) | Cross-language giữa Go producer + Python consumer |
| Workers | **Python + Celery hoặc RQ** | Giữ AI stack Python |
| Auth | **JWT (golang-jwt/jwt)** | Standard |
| Config | **viper** + env | Standard |
| Logging | **zerolog** hoặc slog | Structured JSON logs |
| Testing | **testify + go-sqlmock** | Standard |

### 4.3 Queue Protocol (Redis Streams)

- Stream `jobs:validate`, `jobs:judge`, `jobs:score`, `jobs:rejudge`
- Consumer groups cho Python workers
- Envelope JSON: `{job_id, submission_id, job_type, priority, enqueued_at}`
- Worker reads → processes → XADD vào `jobs:results` stream + UPDATE `submissions` trực tiếp
- Go API subscribes `jobs:results` để broadcast WS events

### 4.4 Single-Writer Rule (tránh race)

- **Go ghi:** users, teams, contests, tasks, phases, contest_entries, submissions (create), submission_files, leaderboard rows
- **Python ghi:** submissions.status transitions, raw_score, display_score, score_payload, evaluated_at, error_message, evaluation_jobs (full lifecycle)
- Go **không** ghi score; Python **không** ghi leaderboard rows — tách rạch ròi

## 5. Impact on Existing Plan

### Giữ nguyên 100%
- `phase-01-database-schema.md` — DB không quan tâm ngôn ngữ
- Toàn bộ ENUM, composite FK, CHECK, indexes
- Business rules, integrity constraints, app-layer validations
- `plans/reports/planner-260424-1148-spec-reconciliation.md`

### Cần rewrite
- `phase-02-api-specification.md`: Pydantic → Go structs + validator tags; endpoint shapes giữ nguyên
- `phase-03-worker-architecture.md`: Celery → Redis Streams protocol + Python consumer

### Cần thêm (phase mới)
- `phase-04-go-project-scaffold.md`: layout (`cmd/`, `internal/`, `pkg/`, `migrations/`, `queries/`), Makefile, sqlc config, goose setup
- `phase-05-queue-protocol.md`: Redis Streams envelope, consumer groups, retry/DLQ, result stream → WS bridge

## 6. Implementation Considerations

### Go-specific challenges với schema này
1. **JSONB fields** (rules_json, score_payload, validation_result, score_breakdown) → `json.RawMessage` hoặc custom types với `Scan`/`Value` interface. sqlc hỗ trợ tốt.
2. **Discriminated entries** (individual vs team) → không có Pydantic-style union. Validate thủ công trong handler + rely on CHECK constraint DB.
3. **Partial unique indexes** (`WHERE user_id IS NOT NULL`) → sqlc OK, goose migration SQL-native nên dễ.
4. **Composite FKs** → GORM fragile, sqlc handle tốt. ✅ đã chọn sqlc.
5. **WebSocket auth** — gorilla/websocket không có built-in; phải verify JWT trong upgrade handler.
6. **Pydantic-style error responses** → wrapper struct + error middleware, verbose hơn nhưng không phức tạp.

### Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Hobby-level Go skill | Velocity giảm 60% | 2 tuần đầu: đọc Go concurrency patterns, build 1 demo CRUD + WS; không build feature chính |
| Queue protocol bugs giữa 2 ngôn ngữ | Job loss, score mất | Test harness cả hai đầu; XPENDING + claim lại message |
| Race: Go upsert leaderboard song song với Python update submission | Leaderboard sai | Single-writer rule + `SELECT ... FOR UPDATE` khi recompute |
| Composite FK phức tạp → lỗi migration | Schema không lên | Test up/down nhiều lần, seed fixtures trước khi ship |
| JSONB validation yếu hơn Pydantic | Bad data lọt vào DB | Viết helper validator + reject tại handler |
| Team member khác không biết Go | Bottleneck | Pair-programming 2 tuần đầu; tài liệu CLAUDE.md chi tiết |

## 7. Success Metrics

1. API p95 < 100ms cho leaderboard read (với 1000 rows)
2. WebSocket: 500 concurrent connections không crash
3. Queue throughput: 50 jobs/s end-to-end (validate → score → leaderboard)
4. Zero race condition trên score/leaderboard (verified bằng load test)
5. Migration up/down idempotent
6. All 89 endpoints implemented và pass integration test

## 8. Validation Criteria

- Demo full flow: register → create entry → submit → judge → leaderboard update qua WS
- Passes 17-table schema spec (đã align)
- Docker Compose 1-command up (postgres + redis + minio + go-api + python-worker)
- Alembic-free migration flow (goose up)

## 9. Next Steps

1. Rewrite `phase-02-api-specification.md` sang Go stack
2. Rewrite `phase-03-worker-architecture.md` sang Redis Streams + Python consumer
3. Tạo `phase-04-go-project-scaffold.md`
4. Tạo `phase-05-queue-protocol.md`
5. Update `00-plan-overview.md` phản ánh 5 phases
6. Bootstrap Go project (cmd/api + cmd/migrate) + spike 1 endpoint
7. 2-tuần Go ramp-up cho toàn team

## 10. Dependencies

- Go 1.22+
- PostgreSQL 15+
- Redis 7+ (Streams)
- Python 3.11+ (workers)
- Docker + Docker Compose
- sqlc v1.27+, goose v3.x, echo v4

## 11. Unresolved Questions

1. **Worker queue library (Python side):** Celery + redis-streams adapter, hay viết consumer thuần bằng `redis-py` với XREADGROUP? Celery quen nhưng cần Celery broker format → rối. Recommend: **redis-py thuần** cho KISS.
2. **WebSocket pub/sub:** dùng Redis Pub/Sub riêng hay tái dùng Redis Streams? Separate tốt hơn (WS ephemeral, không cần persistence).
3. **Auth session store:** JWT stateless (đơn giản) hay session table (revoke được)? Thesis → JWT stateless đủ.
4. **sqlc vs ent vs pgx-raw:** đã chọn sqlc nhưng cần xác nhận với toàn team — ent có GraphQL free nếu sau này cần.
5. **FE:** React trước đó giả định trong plan cũ — vẫn giữ?
6. **Go module path:** `github.com/<user>/olpai-backend` → cần username/org.
7. **2-tuần ramp-up** team có chấp nhận không? Nếu không → rủi ro trễ.

---

## 12. Final Recommendation

✅ **Proceed với Hybrid Go (Echo + sqlc + goose) + Python workers qua Redis Streams.**

Lý do chấp nhận:
- 6 tháng + 2–3 người đủ cover 60% velocity overhead
- Workers Python giữ được ecosystem AI — YAGNI đúng
- sqlc xử schema phức tạp tốt hơn GORM
- CV value + perf là motivation hợp lệ
- Plan DB (phase-01) không đổi → đỡ work

Điều kiện:
- Commit 2 tuần đầu ramp-up Go (không build feature)
- Single-writer rule giữa Go và Python strict
- Redis Streams làm protocol chung (không Celery)
