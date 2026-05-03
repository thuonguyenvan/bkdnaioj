# Handler Interface Refactor & MockQuerier

## Status: Completed

## Tasks Completed

- [x] Refactored all 15 handler structs: `*db.Queries` -> `db.Querier`
- [x] Updated all 15 constructor functions to accept `db.Querier`
- [x] Created `db/mock.go` with `MockQuerier` (78 methods, func-field delegation pattern)
- [x] Created `internal/http/handlers/testutil_test.go` with shared test helpers
- [x] Added `github.com/stretchr/testify` dependency (v1.11.1)
- [x] Verified compilation: `go build ./...` and `go vet ./...` pass clean

## Files Modified (15 handlers)

| File | Change |
|------|--------|
| `internal/http/handlers/auth.go` | `AuthHandler.q` + `NewAuthHandler` |
| `internal/http/handlers/admin.go` | `AdminHandler.q` + `NewAdminHandler` |
| `internal/http/handlers/contests.go` | `ContestHandler.q` + `NewContestHandler` |
| `internal/http/handlers/entries.go` | `EntryHandler.q` + `NewEntryHandler` |
| `internal/http/handlers/entry-members.go` | `EntryMemberHandler.q` + `NewEntryMemberHandler` |
| `internal/http/handlers/teams.go` | `TeamHandler.q` + `NewTeamHandler` |
| `internal/http/handlers/users.go` | `UserHandler.q` + `NewUserHandler` |
| `internal/http/handlers/tasks.go` | `TaskHandler.q` + `NewTaskHandler` |
| `internal/http/handlers/phases.go` | `PhaseHandler.q` + `NewPhaseHandler` |
| `internal/http/handlers/phase-defs.go` | `PhaseDefHandler.q` + `NewPhaseDefHandler` |
| `internal/http/handlers/submissions.go` | `SubmissionHandler.q` + `NewSubmissionHandler` |
| `internal/http/handlers/announcements.go` | `AnnouncementHandler.q` + `NewAnnouncementHandler` |
| `internal/http/handlers/clarifications.go` | `ClarificationHandler.q` + `NewClarificationHandler` |
| `internal/http/handlers/tickets.go` | `TicketHandler.q` + `NewTicketHandler` |
| `internal/http/handlers/leaderboards.go` | `LeaderboardHandler.q` + `NewLeaderboardHandler` |

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `db/mock.go` | ~460 | Hand-written MockQuerier implementing all 78 Querier methods |
| `internal/http/handlers/testutil_test.go` | ~45 | `newTestContext`, `setAuthContext`, `parseBody` helpers |

## Router Impact

`internal/http/router.go` and `internal/http/routes-comms.go` required NO changes. The `register*` functions pass `*db.Queries` to `New*Handler(q db.Querier)` -- Go handles the implicit interface conversion since `*db.Queries` satisfies `db.Querier`.

## Build Verification

- `go build ./...`: pass
- `go vet ./...`: pass
