# Phase 2 Implementation Report — Auth + Users + Teams

**Date:** 2026-04-28 17:57
**Plan ref:** `plans/260415-1507-olpai-backend-design/phase-02-api-specification.md`
**Scope:** First batch — auth (3), users (3), teams (5) = 11 endpoints

---

## 1. Deliverables

### 1.1 Security Layer
| File | LOC | Purpose |
|---|---|---|
| `internal/security/password.go` | 24 | bcrypt hash + verify |
| `internal/security/jwt.go` | 68 | HS256 JWT issue/verify, Claims struct |

### 1.2 Middleware
| File | LOC | Purpose |
|---|---|---|
| `internal/http/middleware/error.go` | 60 | AppError type + custom ErrorHandler |
| `internal/http/middleware/auth.go` | 67 | JWTAuth middleware + RequireRole + GetUserID helper |

### 1.3 DTOs
| File | LOC | Purpose |
|---|---|---|
| `internal/http/dto/auth.go` | 39 | RegisterReq, LoginReq, TokenResponse, UserResponse |
| `internal/http/dto/users.go` | 9 | UpdateProfileRequest |
| `internal/http/dto/teams.go` | 39 | CreateTeamReq, AddMemberReq, TeamResponse, MemberResponse |
| `internal/http/dto/mappers.go` | 38 | pgtype.Timestamptz → time.Time, User→UserResponse |

### 1.4 Handlers
| File | LOC | Endpoints |
|---|---|---|
| `internal/http/handlers/auth.go` | 119 | POST /register, POST /login, GET /me |
| `internal/http/handlers/users.go` | 104 | GET /:id, PATCH /:id, GET /me/teams |
| `internal/http/handlers/teams.go` | 186 | POST, GET /:id, GET /:id/members, POST /:id/members, DELETE /:id/members/:user_id |

### 1.5 Wiring
| File | LOC | Changes |
|---|---|---|
| `internal/http/router.go` | 78 | registerAuth + registerUsers + registerTeams, custom ErrorHandler |
| `cmd/api/main.go` | 75 | JWTManager init, Redis optional (warn only) |
| `internal/config/config.go` | 58 | Redis not required, JWT min=16 |
| `internal/http/health.go` | 43 | Handle nil Redis in readyz |
| `internal/repo/pool.go` | 43 | Supabase pooler detection → SimpleProtocol mode |

---

## 2. Endpoint Summary (11 total this batch)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/v1/auth/register | ❌ | Create account → JWT |
| POST | /api/v1/auth/login | ❌ | Email/password → JWT |
| GET | /api/v1/auth/me | ✅ | Current user profile |
| GET | /api/v1/users/:id | ✅ | Get any user |
| PATCH | /api/v1/users/:id | ✅ | Update own profile (or admin) |
| GET | /api/v1/users/me/teams | ✅ | My teams |
| POST | /api/v1/teams | ✅ | Create team (caller = owner) |
| GET | /api/v1/teams/:id | ✅ | Get team |
| GET | /api/v1/teams/:id/members | ✅ | List members |
| POST | /api/v1/teams/:id/members | ✅ | Add member (owner only) |
| DELETE | /api/v1/teams/:id/members/:user_id | ✅ | Remove member (owner only) |

---

## 3. Validation

| Check | Result |
|---|---|
| `go mod tidy` | ✅ clean |
| `go build ./...` | ✅ zero errors |
| All files < 200 LOC | ✅ max=186 (teams.go) |
| Supabase pooler simple protocol | ✅ auto-detected |
| Redis optional | ✅ warns only, doesn't crash |

---

## 4. Remaining Phase 2 endpoints (~78 more)

| Module | Endpoints | Status |
|---|---|---|
| Contests CRUD + publish/archive | 8 | ⏳ Next |
| ContestPhaseDefs | 4 | ⏳ |
| Tasks | 6 | ⏳ |
| Phases + freeze | 6 | ⏳ |
| ContestEntries + lineup | 10 | ⏳ |
| Submissions (stub upload) | 8 | ⏳ |
| Leaderboards (stub) | 6 | ⏳ |
| Clarifications | 5 | ⏳ |
| Announcements | 4 | ⏳ |
| Tickets | 5 | ⏳ |
| Admin | 8 | ⏳ |

---

## 5. Architecture Notes

- **Single validator instance** per handler struct (reuse, not per-request)
- **Fire-and-forget** `TouchUserLastVisit` in login (goroutine)
- **Composite error handling**: pgconn.PgError codes for unique violations (23505) and FK violations (23503)
- **Owner-based authz** on teams: only `teams.owner_id` can add/remove members
- **COALESCE pattern** in SQL: nil fields in PATCH → keep old value

---

## 6. Unresolved

1. `/api/v1/users/me/teams` path may conflict with `/api/v1/users/:id` when Echo matches "me" as `:id` → need to register `/me/*` routes before `/:id` or use different prefix.
2. Refresh token flow not implemented (simple JWT re-issue on login for V1).
3. Rate limiting not yet wired.
4. WebSocket not yet wired.
