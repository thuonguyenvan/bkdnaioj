# Phase 2: Go API Specification (Echo + sqlc)

**Status:** 🔄 Rewritten for Go stack
**Refs:** spec, reconciliation, brainstorm reports

---

## 1. Stack

| Component | Choice | Notes |
|---|---|---|
| Router | **Echo v4** | Middleware chain, group routing, OpenAPI plugin |
| Validation | **go-playground/validator/v10** | Struct tags |
| DB | **sqlc + pgx/v5** | Type-safe generated code |
| WS | **gorilla/websocket** | Manual JWT verify in upgrade handler |
| Auth | **golang-jwt/jwt v5** | HS256, refresh + access tokens |
| Logging | **zerolog** | Structured JSON |
| Errors | Custom `AppError` + central middleware | Shape mirrors Pydantic ErrorResponse |

---

## 2. Project Layout (API-relevant)

```
internal/
  http/
    router.go              # Echo setup, middlewares
    middleware/
      auth.go              # JWT verify, current-user injection
      authz.go             # role + entry membership guards
      error.go             # AppError → JSON
      ratelimit.go         # IP / per-entry
      requestid.go
    handlers/
      auth.go users.go teams.go
      contests.go contest_phase_defs.go
      tasks.go phases.go
      contest_entries.go submissions.go
      leaderboards.go clarifications.go
      announcements.go tickets.go
      ws.go                # gorilla/websocket
    dto/
      common.go auth.go users.go teams.go
      contests.go phase_defs.go tasks.go phases.go
      entries.go submissions.go leaderboards.go
      clarifications.go announcements.go tickets.go
internal/
  service/                 # business logic
  repo/                    # sqlc-generated + thin wrappers
  domain/                  # enums, value objects
```

Each file <200 LOC (DRY/KISS). Handlers thin → delegate to service layer.

---

## 3. Common Types

```go
type AppError struct {
    Code    string `json:"error"`
    Message string `json:"message"`
    Details any    `json:"details,omitempty"`
    Status  int    `json:"-"`
}

type Pagination struct {
    Items       any  `json:"items"`
    Total       int  `json:"total"`
    Page        int  `json:"page"`
    PageSize    int  `json:"page_size"`
    HasNext     bool `json:"has_next"`
    HasPrevious bool `json:"has_previous"`
}
```

ENUMs as Go typed strings:
```go
type EntryType string
const (EntryIndividual EntryType = "individual"; EntryTeam EntryType = "team")

type EntryMode string
const (ModeOfficial EntryMode = "official"; ModeVirtual EntryMode = "virtual"; ModePractice EntryMode = "practice")

type ContestPhaseKey string
const (PhasePublicTest ContestPhaseKey = "public_test"; ... )
```

Validator: `validate:"required,oneof=individual team"`.

---

## 4. Modules & Endpoints (~89)

### 4.1 Auth (5)
```
POST  /api/v1/auth/register
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
```

### 4.2 Users (6)
```
GET   /api/v1/users
GET   /api/v1/users/{id}
PATCH /api/v1/users/{id}
GET   /api/v1/users/me/entries
GET   /api/v1/users/me/teams
POST  /api/v1/users/me/avatar
```

### 4.3 Teams (8) — global
```
POST   /api/v1/teams
GET    /api/v1/teams
GET    /api/v1/teams/{id}
PATCH  /api/v1/teams/{id}
DELETE /api/v1/teams/{id}
POST   /api/v1/teams/{id}/members
PATCH  /api/v1/teams/{id}/members/{user_id}
DELETE /api/v1/teams/{id}/members/{user_id}
```

### 4.4 Contests (8)
```
GET    /api/v1/contests
POST   /api/v1/contests              [admin]
GET    /api/v1/contests/{id}
PATCH  /api/v1/contests/{id}         [admin]
DELETE /api/v1/contests/{id}         [admin]
POST   /api/v1/contests/{id}/publish [admin]
POST   /api/v1/contests/{id}/archive [admin]
GET    /api/v1/contests/{id}/summary
```

### 4.5 ContestPhaseDefs (4)
```
GET    /api/v1/contests/{id}/phase-defs
POST   /api/v1/contests/{id}/phase-defs           [admin] bulk-create 4 logical defs
PATCH  /api/v1/contests/{id}/phase-defs/{def_id}  [admin]
DELETE /api/v1/contests/{id}/phase-defs/{def_id}  [admin]
```

### 4.6 Tasks (6)
```
GET    /api/v1/contests/{id}/tasks
POST   /api/v1/contests/{id}/tasks   [admin]
GET    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}            [admin]
DELETE /api/v1/tasks/{id}            [admin]
GET    /api/v1/tasks/{id}/phases
```

### 4.7 Phases (6)
```
POST   /api/v1/tasks/{id}/phases     [admin]   body must include contest_phase_def_id
GET    /api/v1/phases/{id}
PATCH  /api/v1/phases/{id}           [admin]
DELETE /api/v1/phases/{id}           [admin]
POST   /api/v1/phases/{id}/freeze    [jury]
POST   /api/v1/phases/{id}/unfreeze  [jury]
```

### 4.8 ContestEntries (10)
```
POST   /api/v1/contests/{id}/entries
GET    /api/v1/contests/{id}/entries           [filters: status,mode]
GET    /api/v1/entries/{id}
PATCH  /api/v1/entries/{id}
DELETE /api/v1/entries/{id}
POST   /api/v1/entries/{id}/approve            [jury]
POST   /api/v1/entries/{id}/disqualify         [jury]
GET    /api/v1/entries/{id}/members
POST   /api/v1/entries/{id}/members
DELETE /api/v1/entries/{id}/members/{user_id}
```

### 4.9 Submissions (8)
```
POST   /api/v1/entries/{entry_id}/submissions   multipart: task_id, phase_id, files[]
GET    /api/v1/submissions/{id}
GET    /api/v1/submissions/{id}/files
GET    /api/v1/submissions/{id}/jobs
POST   /api/v1/submissions/{id}/rejudge         [jury]
POST   /api/v1/submissions/{id}/mark-final
GET    /api/v1/entries/{id}/submissions         [filters: task_id,phase_id]
GET    /api/v1/tasks/{id}/submissions           [admin]
```

### 4.10 Leaderboards (6) — DUAL
```
GET    /api/v1/phases/{phase_id}/leaderboard?entry_mode=official|virtual|practice
GET    /api/v1/contests/{contest_id}/phase-defs/{def_id}/leaderboard?entry_mode=...
GET    /api/v1/phases/{phase_id}/leaderboard/export.csv
GET    /api/v1/contests/{id}/phase-defs/{def_id}/leaderboard/export.csv
POST   /api/v1/phases/{phase_id}/leaderboard/recompute       [admin]
POST   /api/v1/contests/{id}/phase-defs/{def_id}/leaderboard/recompute [admin]
```

### 4.11 Clarifications (5)
```
POST   /api/v1/contests/{id}/clarifications
GET    /api/v1/contests/{id}/clarifications
GET    /api/v1/clarifications/{id}
POST   /api/v1/clarifications/{id}/answer       [jury]
PATCH  /api/v1/clarifications/{id}              [jury]   publish/close
```

### 4.12 Announcements (4)
```
POST   /api/v1/contests/{id}/announcements      [admin]
GET    /api/v1/contests/{id}/announcements
PATCH  /api/v1/announcements/{id}               [admin]
DELETE /api/v1/announcements/{id}               [admin]
```

### 4.13 Tickets (5)
```
POST   /api/v1/tickets
GET    /api/v1/tickets/me
GET    /api/v1/tickets                          [staff]
PATCH  /api/v1/tickets/{id}                     [staff]
POST   /api/v1/tickets/{id}/resolve             [staff]
```

### 4.14 Admin/Jury (8)
```
GET    /api/v1/admin/stats
GET    /api/v1/admin/users
PATCH  /api/v1/admin/users/{id}/role
POST   /api/v1/admin/contests/{id}/rejudge-all
POST   /api/v1/admin/leaderboards/freeze-all
POST   /api/v1/admin/leaderboards/unfreeze-all
GET    /api/v1/admin/exports/contest/{id}
GET    /api/v1/admin/health
```

**Total:** 89.

---

## 5. Sample Go DTOs

```go
// internal/http/dto/entries.go
type ContestEntryCreateReq struct {
    EntryType    EntryType   `json:"entry_type"   validate:"required,oneof=individual team"`
    EntryMode    EntryMode   `json:"entry_mode"   validate:"required,oneof=official virtual practice"`
    UserID       *uuid.UUID  `json:"user_id"      validate:"omitempty,uuid"`
    TeamID       *uuid.UUID  `json:"team_id"      validate:"omitempty,uuid"`
    DisplayName  string      `json:"display_name" validate:"required,min=1,max=120"`
    StartAt      *time.Time  `json:"start_at"`
    EndAt        *time.Time  `json:"end_at"`
    LineupUserIDs []uuid.UUID `json:"lineup_user_ids" validate:"omitempty,dive,uuid"`
}

// custom validator: exactly_one(user_id, team_id) + virtual_window
```

```go
// internal/http/dto/submissions.go
type SubmissionResponse struct {
    ID              uuid.UUID       `json:"id"`
    ContestID       uuid.UUID       `json:"contest_id"`
    ContestEntryID  uuid.UUID       `json:"contest_entry_id"`
    TaskID          uuid.UUID       `json:"task_id"`
    PhaseID         uuid.UUID       `json:"phase_id"`
    Status          SubmissionStatus `json:"status"`
    RawScore        *string         `json:"raw_score,omitempty"`     // numeric as string
    DisplayScore    *string         `json:"display_score,omitempty"`
    ScorePayload    json.RawMessage `json:"score_payload,omitempty"`
    SubmittedAt     time.Time       `json:"submitted_at"`
    EvaluatedAt     *time.Time      `json:"evaluated_at,omitempty"`
    FileCount       int             `json:"file_count"`
    TotalSizeBytes  int64           `json:"total_size_bytes"`
    IsFinal         bool            `json:"is_final"`
    RejudgeCount    int             `json:"rejudge_count"`
}
```

---

## 6. Authorization Matrix

| Action | Contestant | Jury | Admin |
|---|---|---|---|
| Create contest | ❌ | ❌ | ✅ |
| Manage phase defs | ❌ | ❌ | ✅ |
| Submit | ✅ if entry-member, phase open, mode allowed | ❌ | ✅ |
| Rejudge | ❌ | ✅ | ✅ |
| Approve/DQ entry | ❌ | ✅ | ✅ |
| Answer clarification | ❌ | ✅ | ✅ |
| Freeze leaderboard | ❌ | ✅ | ✅ |

Middleware `RequireRole(...)` + `RequireEntryMember(entryIDParam)` + `RequirePhaseOpen`.

---

## 7. WebSocket

`GET /api/v1/ws?token=<JWT>`

Upgrade flow: parse JWT in upgrade handler → register conn under `userID`.

Server → client events:
- `submission.status` — to entry members
- `leaderboard.task_phase.updated` — broadcast to subscribers of `phase_id`
- `leaderboard.contest_phase.updated`
- `clarification.answered`
- `announcement.created`

Bridge: subscribe to Redis `jobs:results` stream → fan out (see Phase 5).

Subscription protocol (client → server):
```json
{"type":"subscribe","channels":["leaderboard:phase:<uuid>","entry:<uuid>"]}
```

---

## 8. Error Codes

`VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`, `CONFLICT`, `RATE_LIMITED`, `PHASE_CLOSED`, `MODE_NOT_ALLOWED`, `LINEUP_VIOLATION`, `INTERNAL_ERROR`.

---

## 9. Rate Limiting

- Auth endpoints: per-IP (golang.org/x/time/rate)
- Submissions: per-entry-per-phase respecting `phases.submission_limit`
- Implemented as Echo middleware + Redis counter

---

## 10. Todo

- [ ] Echo router skeleton + middlewares
- [ ] sqlc queries for all 17 tables (Phase 4)
- [ ] DTOs split per module (each <200 LOC)
- [ ] JWT issuer/verifier
- [ ] Custom validators (exactly_one, virtual_window)
- [ ] WS hub + subscription manager
- [ ] OpenAPI generation (echo-swagger)
- [ ] Integration tests (testcontainers-go)

---

## 11. Success Criteria

1. 89 endpoints implemented + documented
2. Authorization on every contest-scoped route
3. Composite validation prevents cross-contest writes
4. WS broadcasts validated end-to-end
5. p95 < 100ms for leaderboard read with 1000 rows

---

## 12. Next → Phase 3

Worker pipeline (Python + Redis Streams) consuming submissions, writing scores back.
