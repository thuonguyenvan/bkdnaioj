package handlers

import (
	"context"
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

// GET /api/v1/rankings/global?phase=public_test
func (h *LeaderboardHandler) GlobalPhaseRanking(c echo.Context) error {
	ctx := c.Request().Context()
	phaseKey := db.ContestPhaseKey(c.QueryParam("phase"))
	if phaseKey == "" {
		phaseKey = db.ContestPhaseKeyPublicTest
	}
	if !phaseKey.Valid() {
		return mw.ErrBadRequest("invalid phase key")
	}

	if err := h.q.RecomputeGlobalPhaseRanking(ctx, phaseKey); err != nil {
		return mw.ErrInternal("recompute global ranking failed")
	}
	if err := h.q.DeleteStaleGlobalRankings(ctx, phaseKey); err != nil {
		return mw.ErrInternal("delete stale global ranking failed")
	}

	limit, offset := parsePagination(c)
	rows, err := h.q.GetGlobalPhaseRanking(ctx, db.GetGlobalPhaseRankingParams{
		PhaseKey: phaseKey,
		Limit:    int32(limit),
		Offset:   int32(offset),
	})
	if err != nil {
		return mw.ErrInternal("fetch global ranking failed")
	}

	resp := make([]dto.GlobalRankingRow, len(rows))
	for i, r := range rows {
		resp[i] = dto.GlobalRankingRowToResponse(r)
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/phases/:phase_id/leaderboard?entry_mode=official
func (h *LeaderboardHandler) TaskPhaseBoard(c echo.Context) error {
	ctx := c.Request().Context()
	phaseID, err := uuid.Parse(c.Param("phase_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase id")
	}
	if err := h.recomputeTaskPhase(ctx, phaseID); err != nil {
		return err
	}
	limit, offset := parsePagination(c)
	var mode *db.EntryMode
	if m := c.QueryParam("entry_mode"); m != "" {
		v := db.EntryMode(m)
		mode = &v
	}
	rows, err := h.q.GetTaskPhaseLeaderboard(ctx, db.GetTaskPhaseLeaderboardParams{
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
	ctx := c.Request().Context()
	contestID, err := uuid.Parse(c.Param("contest_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	defID, err := uuid.Parse(c.Param("def_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase def id")
	}
	if err := h.q.RecomputeContestPhaseLeaderboard(ctx, db.RecomputeContestPhaseLeaderboardParams{
		ContestPhaseDefID: defID,
		ContestID:         contestID,
	}); err != nil {
		return mw.ErrInternal("recompute contest phase leaderboard failed")
	}
	limit, offset := parsePagination(c)
	var mode *db.EntryMode
	if m := c.QueryParam("entry_mode"); m != "" {
		v := db.EntryMode(m)
		mode = &v
	}
	rows, err := h.q.GetContestPhaseLeaderboard(ctx, db.GetContestPhaseLeaderboardParams{
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

// POST /api/v1/phases/:phase_id/leaderboard/recompute
func (h *LeaderboardHandler) RecomputeTaskPhase(c echo.Context) error {
	ctx := c.Request().Context()
	phaseID, err := uuid.Parse(c.Param("phase_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase id")
	}
	if err := h.recomputeTaskPhase(ctx, phaseID); err != nil {
		return err
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "success"})
}

// POST /api/v1/contests/:id/phase-defs/:def_id/leaderboard/recompute
func (h *LeaderboardHandler) RecomputeContestPhase(c echo.Context) error {
	ctx := c.Request().Context()
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	defID, err := uuid.Parse(c.Param("def_id"))
	if err != nil {
		return mw.ErrBadRequest("invalid phase def id")
	}

	err = h.q.RecomputeContestPhaseLeaderboard(ctx, db.RecomputeContestPhaseLeaderboardParams{
		ContestPhaseDefID: defID,
		ContestID:         contestID,
	})
	if err != nil {
		return mw.ErrInternal("recompute contest phase leaderboard failed")
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "success"})
}

func (h *LeaderboardHandler) recomputeTaskPhase(ctx context.Context, phaseID uuid.UUID) error {
	phase, err := h.q.GetPhaseByID(ctx, phaseID)
	if err != nil {
		return mw.ErrNotFound("phase not found")
	}

	task, err := h.q.GetTaskByID(ctx, phase.TaskID)
	if err != nil {
		return mw.ErrNotFound("task not found")
	}

	if err := h.q.RecomputeTaskPhaseLeaderboard(ctx, db.RecomputeTaskPhaseLeaderboardParams{
		PhaseID:         phaseID,
		LeaderboardMode: phase.LeaderboardMode,
		HigherIsBetter:  task.HigherIsBetter,
	}); err != nil {
		return mw.ErrInternal("recompute task phase leaderboard failed")
	}
	return nil
}

func parsePagination(c echo.Context) (int, int) {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return limit, offset
}
