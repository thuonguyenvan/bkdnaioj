package handlers

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type LeaderboardHandler struct {
	q db.Querier
}

func NewLeaderboardHandler(q db.Querier) *LeaderboardHandler {
	return &LeaderboardHandler{q: q}
}

// GET /api/v1/phases/:phase_id/leaderboard?entry_mode=official
func (h *LeaderboardHandler) TaskPhaseBoard(c echo.Context) error {
	phaseID, err := uuid.Parse(c.Param("phase_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase id")
	}
	limit, offset := parsePagination(c)
	var mode *db.EntryMode
	if m := c.QueryParam("entry_mode"); m != "" {
		v := db.EntryMode(m)
		mode = &v
	}
	rows, err := h.q.GetTaskPhaseLeaderboard(c.Request().Context(), db.GetTaskPhaseLeaderboardParams{
		PhaseID: phaseID, Limit: int32(limit), Offset: int32(offset), EntryMode: mode,
	})
	if err != nil {
		return mw.ErrInternal("fetch leaderboard failed")
	}
	resp := make([]dto.LeaderboardRow, len(rows))
	for i, r := range rows {
		resp[i] = dto.TaskPhaseRowToResponse(r)
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/contests/:contest_id/phase-defs/:def_id/leaderboard?entry_mode=official
func (h *LeaderboardHandler) ContestPhaseBoard(c echo.Context) error {
	defID, err := uuid.Parse(c.Param("def_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase def id")
	}
	limit, offset := parsePagination(c)
	var mode *db.EntryMode
	if m := c.QueryParam("entry_mode"); m != "" {
		v := db.EntryMode(m)
		mode = &v
	}
	rows, err := h.q.GetContestPhaseLeaderboard(c.Request().Context(), db.GetContestPhaseLeaderboardParams{
		ContestPhaseDefID: defID, Limit: int32(limit), Offset: int32(offset), EntryMode: mode,
	})
	if err != nil {
		return mw.ErrInternal("fetch leaderboard failed")
	}
	resp := make([]dto.LeaderboardRow, len(rows))
	for i, r := range rows {
		resp[i] = dto.ContestPhaseRowToResponse(r)
	}
	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/phases/:phase_id/leaderboard/recompute (stub)
func (h *LeaderboardHandler) RecomputeTaskPhase(c echo.Context) error {
	// Stub: actual recompute requires Redis Streams bridge (Phase 5)
	return c.JSON(http.StatusOK, map[string]string{"status": "recompute queued (stub)"})
}

// POST /api/v1/contests/:id/phase-defs/:def_id/leaderboard/recompute (stub)
func (h *LeaderboardHandler) RecomputeContestPhase(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "recompute queued (stub)"})
}

func parsePagination(c echo.Context) (int, int) {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return limit, offset
}
