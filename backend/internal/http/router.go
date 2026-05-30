// Package http wires Echo router with middlewares and route groups.
package http

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	emw "github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/handlers"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/mank1/olpai-backend/internal/security"
	"github.com/mank1/olpai-backend/internal/storage"
)

// Deps groups shared dependencies injected into handlers.
type Deps struct {
	Pool    *pgxpool.Pool
	Redis   *redis.Client
	Storage *storage.S3
	Log     zerolog.Logger
	JWTMgr  *security.JWTManager
}

// NewRouter builds the Echo instance with middlewares and all route groups.
func NewRouter(d *Deps) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.HTTPErrorHandler = mw.ErrorHandler

	e.Use(emw.Recover())
	e.Use(emw.RequestID())
	e.Use(emw.CORSWithConfig(emw.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAuthorization},
	}))

	e.GET("/healthz", healthz(d))
	e.GET("/readyz", readyz(d))

	q := db.New(d.Pool)
	api := e.Group("/api/v1")
	registerAuth(api, q, d.JWTMgr)
	registerUsers(api, q, d.JWTMgr)
	registerTeams(api, q, d.JWTMgr)
	registerContests(api, q, d.JWTMgr)
	registerPhaseDefs(api, q, d.JWTMgr)
	registerTasks(api, q, d.JWTMgr)
	registerEvaluationSets(api, q, d.JWTMgr, d.Storage)
	registerPhases(api, q, d.JWTMgr, d.Storage)
	registerEntries(api, q, d.JWTMgr)
	registerSubmissions(api, q, d.JWTMgr, d.Redis, d.Storage)
	registerAnnouncements(api, q, d.JWTMgr)
	registerClarifications(api, q, d.JWTMgr)
	registerTickets(api, q, d.JWTMgr)
	registerLeaderboards(api, q, d.JWTMgr)
	registerAdmin(api, q, d.JWTMgr)

	return e
}

func registerAuth(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewAuthHandler(q, jwtMgr)
	auth := api.Group("/auth")
	auth.POST("/register", h.Register)
	auth.POST("/login", h.Login)
	auth.GET("/me", h.Me, mw.JWTAuth(jwtMgr))
}

func registerUsers(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewUserHandler(q)
	users := api.Group("/users", mw.JWTAuth(jwtMgr))
	users.GET("/:id", h.GetUser)
	users.PATCH("/:id", h.UpdateProfile)
	users.GET("/me/teams", h.GetMyTeams)
}

func registerTeams(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewTeamHandler(q)
	teams := api.Group("/teams", mw.JWTAuth(jwtMgr))
	teams.POST("", h.Create)
	teams.GET("/:id", h.Get)
	teams.GET("/:id/members", h.ListMembers)
	teams.POST("/:id/members", h.AddMember)
	teams.DELETE("/:id/members/:user_id", h.RemoveMember)
}

func registerContests(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewContestHandler(q)
	contests := api.Group("/contests")
	contests.GET("", h.List)
	contests.GET("/:id", h.Get)
	// Admin-only routes
	admin := contests.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("", h.Create)
	admin.PATCH("/:id", h.Update)
	admin.DELETE("/:id", h.Delete)
	admin.POST("/:id/publish", h.Publish)
	admin.POST("/:id/archive", h.Archive)
}

func registerPhaseDefs(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewPhaseDefHandler(q)
	// Nested under /contests/:id/phase-defs
	api.GET("/contests/:id/phase-defs", h.List)
	admin := api.Group("/contests/:id/phase-defs", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("", h.Create)
	admin.PATCH("/:def_id", h.Update)
	admin.DELETE("/:def_id", h.Delete)
}

func registerTasks(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	h := handlers.NewTaskHandler(q)
	api.GET("/contests/:id/tasks", h.ListByContest)
	api.GET("/tasks/:id", h.Get)
	admin := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("/contests/:id/tasks", h.Create)
	admin.DELETE("/tasks/:id", h.Delete)
}

func registerEvaluationSets(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager, s3 *storage.S3) {
	h := handlers.NewEvaluationSetHandler(q, s3)
	api.GET("/tasks/:task_id/evaluation-sets", h.ListByTask)
	api.GET("/evaluation-sets/:id", h.Get)
	api.GET("/evaluation-sets/:id/assets", h.ListAssets)
	admin := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("/tasks/:task_id/evaluation-sets", h.Create)
	jury := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin", "jury"))
	jury.POST("/evaluation-sets/:id/assets:initiate", h.InitiateAssets)
	jury.POST("/evaluation-sets/:id/assets/complete", h.CompleteAssets)
}

func registerPhases(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager, s3 *storage.S3) {
	h := handlers.NewPhaseHandler(q, s3)
	api.GET("/phases/:id", h.Get)
	api.GET("/tasks/:id/phases", h.ListByTask)
	admin := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin"))
	admin.POST("/tasks/:id/phases", h.Create)
	admin.DELETE("/phases/:id", h.Delete)
	jury := api.Group("", mw.JWTAuth(jwtMgr), mw.RequireRole("admin", "jury"))
	jury.POST("/phases/:id/freeze", h.Freeze)
	jury.POST("/phases/:id/unfreeze", h.Unfreeze)
}

func registerEntries(api *echo.Group, q *db.Queries, jwtMgr *security.JWTManager) {
	eh := handlers.NewEntryHandler(q)
	emh := handlers.NewEntryMemberHandler(q)
	auth := mw.JWTAuth(jwtMgr)

	api.POST("/contests/:id/entries", eh.Create, auth)
	api.GET("/contests/:id/entries", eh.List, auth)
	api.GET("/entries/:id", eh.Get, auth)
	api.DELETE("/entries/:id", eh.Delete, auth)
	api.GET("/entries/:id/members", emh.List, auth)
	api.POST("/entries/:id/members", emh.Add, auth)
	api.DELETE("/entries/:id/members/:user_id", emh.Remove, auth)

	jury := api.Group("", auth, mw.RequireRole("admin", "jury"))
	jury.POST("/entries/:id/approve", eh.Approve)
	jury.POST("/entries/:id/disqualify", eh.Disqualify)
}
