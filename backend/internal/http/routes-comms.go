package http

import (
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/handlers"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/queue"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/mank1/olpai-backend/internal/storage"
	"github.com/redis/go-redis/v9"
)

func registerSubmissions(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager, rdb *redis.Client, s3 *storage.S3) {
	h := handlers.NewSubmissionHandler(q, queue.NewProducer(rdb), s3)
	auth := mw.JWTAuth(jwtMgr)
	api.POST("/entries/:entry_id/submissions:initiate", h.InitiateUpload, auth)
	api.POST("/submissions/:id/complete", h.CompleteUpload, auth)
	api.POST("/entries/:entry_id/submissions", h.Create, auth)
	api.GET("/submissions/:id", h.Get, auth)
	api.GET("/entries/:id/submissions", h.ListByEntry, auth)
	api.POST("/submissions/:id/mark-final", h.MarkFinal, auth)
}

func registerAnnouncements(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewAnnouncementHandler(q)
	api.GET("/contests/:id/announcements", h.List)
	api.GET("/announcements", h.ListSystem)
	admin := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("/contests/:id/announcements", h.Create)
	admin.POST("/announcements", h.CreateSystem)
	admin.PATCH("/announcements/:id", h.Update)
	admin.DELETE("/announcements/:id", h.Delete)
}

func registerClarifications(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewClarificationHandler(q)
	auth := mw.JWTAuth(jwtMgr)
	api.POST("/contests/:id/clarifications", h.Create, auth)
	api.GET("/contests/:id/clarifications", h.List, auth)
	api.GET("/clarifications/:id", h.Get, auth)
	jury := api.Group("", auth, mw.RequireRole("admin", "jury"))
	jury.POST("/clarifications/:id/answer", h.Answer)
	jury.PATCH("/clarifications/:id", h.Update)
}

func registerTickets(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewTicketHandler(q)
	auth := mw.JWTAuth(jwtMgr)
	api.POST("/tickets", h.Create, auth)
	api.GET("/tickets/me", h.ListMine, auth)
	staff := api.Group("/tickets", auth, mw.RequireRole("admin", "jury"))
	staff.GET("", h.ListAll)
	staff.PATCH("/:id", h.Update)
	staff.POST("/:id/resolve", h.Resolve)
}

func registerLeaderboards(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewLeaderboardHandler(q)
	api.GET("/phases/:phase_id/leaderboard", h.TaskPhaseBoard)
	api.GET("/contests/:contest_id/phase-defs/:def_id/leaderboard", h.ContestPhaseBoard)
	admin := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("/phases/:phase_id/leaderboard/recompute", h.RecomputeTaskPhase)
	admin.POST("/contests/:id/phase-defs/:def_id/leaderboard/recompute", h.RecomputeContestPhase)
}

func registerAdmin(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewAdminHandler(q)
	admin := api.Group("/admin", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.GET("/stats", h.Stats)
	admin.GET("/users", h.ListUsers)
	admin.PATCH("/users/:id/role", h.UpdateUserRole)
	admin.GET("/health", h.Health)
}
