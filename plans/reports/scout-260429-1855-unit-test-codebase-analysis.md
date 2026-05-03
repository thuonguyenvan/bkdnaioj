# Scout Report: Go Backend Codebase Analysis for Unit Testing

**Date:** 2026-04-29
**Purpose:** Full structural analysis of backend/ to plan handler unit tests
**Module:** github.com/mank1/olpai-backend (Go 1.22)

## 1. Key Dependencies

- labstack/echo/v4: HTTP router + context
- jackc/pgx/v5 + pgxpool: PostgreSQL driver (sqlc-generated)
- go-playground/validator/v10: Request struct validation
- golang-jwt/jwt/v5: JWT issue/verify
- golang.org/x/crypto/bcrypt: Password hashing
- redis/go-redis/v9: Redis (optional, unused by handlers)

## 2. DB Layer (sqlc-generated)

CRITICAL: db.Queries is concrete struct, NOT interface. Querier interface (db/querier.go) has 90+ methods.
All handler constructors take concrete *db.Queries. Must refactor to db.Querier for testability.
## 3. Handler Inventory

### AuthHandler (handlers/auth.go)
- Fields: q *db.Queries, jwt *security.JWTManager, val *validator.Validate
- Constructor: NewAuthHandler(q, jwt)
- Register POST /auth/register -> CreateUser, HashPassword, jwt.Issue
- Login POST /auth/login -> GetUserByEmail, CheckPassword, jwt.Issue, TouchUserLastVisit (goroutine)
- Me GET /auth/me (auth) -> GetUserByID

### AdminHandler (handlers/admin.go)
- Fields: q *db.Queries
- Constructor: NewAdminHandler(q)
- Stats GET /admin/stats -> CountUsers, CountContests, CountSubmissions, CountActiveEntries
- ListUsers GET /admin/users -> ListUsersAdmin
- UpdateUserRole PATCH /admin/users/:id/role -> UpdateUserRole
- Health GET /admin/health -> no DB
### ContestHandler (handlers/contests.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewContestHandler(q)
- Create POST /contests (admin) -> CreateContest
- List GET /contests (public) -> ListContests
- Get GET /contests/:id (public) -> GetContestByID
- Update PATCH /contests/:id (admin) -> UpdateContest
- Delete DELETE /contests/:id (admin) -> DeleteContest
- Publish POST /contests/:id/publish (admin) -> UpdateContestStatus
- Archive POST /contests/:id/archive (admin) -> UpdateContestStatus

### EntryHandler (handlers/entries.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewEntryHandler(q)
- Create POST /contests/:id/entries (auth) -> CreateContestEntry + AddEntryMember (multiple)
- List GET /contests/:id/entries (auth) -> ListContestEntries
- Get GET /entries/:id (auth) -> GetContestEntryByID
- Delete DELETE /entries/:id (auth) -> DeleteContestEntry
- Approve POST /entries/:id/approve (admin/jury) -> ApproveContestEntry
- Disqualify POST /entries/:id/disqualify (admin/jury) -> DisqualifyContestEntry

### EntryMemberHandler (handlers/entry-members.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewEntryMemberHandler(q)
- List GET /entries/:id/members (auth) -> ListEntryMembers
- Add POST /entries/:id/members (auth) -> AddEntryMember
- Remove DELETE /entries/:id/members/:user_id (auth) -> RemoveEntryMember

### TeamHandler (handlers/teams.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewTeamHandler(q)
- Create POST /teams (auth) -> CreateTeam + AddTeamMember
- Get GET /teams/:id (auth) -> GetTeamByID
- ListMembers GET /teams/:id/members (auth) -> ListTeamMembers
- AddMember POST /teams/:id/members (auth) -> GetTeamByID (ownership), AddTeamMember
- RemoveMember DELETE /teams/:id/members/:user_id (auth) -> GetTeamByID, RemoveTeamMember

### UserHandler (handlers/users.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewUserHandler(q)
- GetUser GET /users/:id (auth) -> GetUserByID
- UpdateProfile PATCH /users/:id (auth) -> UpdateUserProfile (self/admin via CtxRole)
- GetMyTeams GET /users/me/teams (auth) -> ListTeamsByUser

### TaskHandler (handlers/tasks.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewTaskHandler(q)
- Create POST /contests/:id/tasks (admin) -> CreateTask
- ListByContest GET /contests/:id/tasks (public) -> ListTasksByContest
- Get GET /tasks/:id (public) -> GetTaskByID
- Delete DELETE /tasks/:id (admin) -> DeleteTask

### PhaseHandler (handlers/phases.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewPhaseHandler(q)
- Create POST /tasks/:id/phases (admin) -> CreatePhase
- Get GET /phases/:id (public) -> GetPhaseByID
- ListByTask GET /tasks/:id/phases (public) -> ListPhasesByTask
- Delete DELETE /phases/:id (admin) -> DeletePhase
- Freeze POST /phases/:id/freeze (admin/jury) -> SetPhaseFrozen(true)
- Unfreeze POST /phases/:id/unfreeze (admin/jury) -> SetPhaseFrozen(false)

### PhaseDefHandler (handlers/phase-defs.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewPhaseDefHandler(q)
- Create POST /contests/:id/phase-defs (admin) -> CreatePhaseDef
- List GET /contests/:id/phase-defs (public) -> ListPhaseDefsByContest
- Update PATCH /contests/:id/phase-defs/:def_id (admin) -> UpdatePhaseDef
- Delete DELETE /contests/:id/phase-defs/:def_id (admin) -> DeletePhaseDef

### SubmissionHandler (handlers/submissions.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewSubmissionHandler(q)
- Create POST /entries/:entry_id/submissions (auth) -> GetContestEntryByID + CreateSubmission
- Get GET /submissions/:id (auth) -> GetSubmissionByID
- ListByEntry GET /entries/:id/submissions (auth) -> ListSubmissionsByEntry
- MarkFinal POST /submissions/:id/mark-final (auth) -> MarkSubmissionFinal

### AnnouncementHandler (handlers/announcements.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewAnnouncementHandler(q)
- Create POST /contests/:id/announcements (admin) -> CreateAnnouncement
- List GET /contests/:id/announcements (public) -> ListAnnouncementsByContest
- Update PATCH /announcements/:id (admin) -> UpdateAnnouncement
- Delete DELETE /announcements/:id (admin) -> DeleteAnnouncement

### ClarificationHandler (handlers/clarifications.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewClarificationHandler(q)
- Create POST /contests/:id/clarifications (auth) -> CreateClarification (entry_id query param)
- List GET /contests/:id/clarifications (auth) -> ListClarificationsByContest
- Get GET /clarifications/:id (auth) -> GetClarificationByID
- Answer POST /clarifications/:id/answer (admin/jury) -> AnswerClarification
- Update PATCH /clarifications/:id (admin/jury) -> UpdateClarificationStatus

### TicketHandler (handlers/tickets.go)
- Fields: q *db.Queries, val *validator.Validate
- Constructor: NewTicketHandler(q)
- Create POST /tickets (auth) -> CreateTicket
- ListMine GET /tickets/me (auth) -> ListTicketsByUser
- ListAll GET /tickets (admin/jury) -> ListTicketsAll
- Update PATCH /tickets/:id (admin/jury) -> UpdateTicket
- Resolve POST /tickets/:id/resolve (admin/jury) -> ResolveTicket

### LeaderboardHandler (handlers/leaderboards.go)
- Fields: q *db.Queries
- Constructor: NewLeaderboardHandler(q)
- TaskPhaseBoard GET /phases/:phase_id/leaderboard (public) -> GetTaskPhaseLeaderboard
- ContestPhaseBoard GET /contests/:contest_id/phase-defs/:def_id/leaderboard (public) -> GetContestPhaseLeaderboard
- RecomputeTaskPhase POST (admin) -> stub
- RecomputeContestPhase POST (admin) -> stub

## 4. Middleware

error.go: AppError struct, factory fns (ErrBadRequest etc), ErrorHandler
auth.go: JWTAuth(jwtMgr), RequireRole(roles...), GetUserID(c), keys CtxUserID/CtxRole/CtxClaims

## 5. Security Package

JWTManager: Issue(userID, role) / Verify(tokenStr), Claims (RegisteredClaims + Role)
HashPassword / CheckPassword (bcrypt cost 12)

## 6. Router Wiring

NewRouter(d *Deps) creates Echo, q := db.New(d.Pool), calls 14 register* fns.
Deps: Pool *pgxpool.Pool, Redis *redis.Client, Log zerolog.Logger, JWTMgr *security.JWTManager

## 7. Testing Strategy

### Recommended Approach
1. Refactor handler struct q field: *db.Queries -> db.Querier
2. Generate mock via mockgen
3. Test: create Echo context, set auth context, call method, assert status+JSON

### Test Files to Create
- backend/db/mock_querier.go
- backend/internal/http/handlers/*_test.go (15 files)
- backend/internal/http/middleware/{auth,error}_test.go
- backend/internal/security/{jwt,password}_test.go

## 8. File Inventory

### Handlers (15)
backend/internal/http/handlers/{admin,announcements,auth,clarifications,contests,entries,entry-members,leaderboards,phase-defs,phases,submissions,tasks,teams,tickets,users}.go

### DTOs (10)
backend/internal/http/dto/{auth,comms,contests,entries,leaderboards,mappers,submissions,tasks-phases,teams,users}.go

### Middleware (2)
backend/internal/http/middleware/{auth,error}.go

### Router (3)
backend/internal/http/{router,routes-comms,health}.go

### Security (2)
backend/internal/security/{jwt,password}.go

### DB sqlc (14)
backend/db/{db,querier,models,admin.sql,comms.sql,contests.sql,entries.sql,leaderboards.sql,phase_defs.sql,phases.sql,submissions.sql,tasks.sql,teams.sql,users.sql}.go

### Infra
backend/internal/config/config.go, backend/internal/repo/pool.go, backend/internal/queue/redis.go
backend/pkg/logger/logger.go, backend/cmd/api/main.go

## Unresolved Questions

1. Refactor to db.Querier vs pgxmock at DBTX level? Querier approach recommended.
2. No test deps (testify, mockgen) in go.mod yet.
3. AuthHandler.Login goroutine for TouchUserLastVisit needs care in tests.
