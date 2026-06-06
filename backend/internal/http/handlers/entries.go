package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/mank1/olpai-backend/db"
	"github.com/mank1/olpai-backend/internal/http/dto"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

type EntryHandler struct {
	q   db.Querier
	val *validator.Validate
}

func NewEntryHandler(q db.Querier) *EntryHandler {
	return &EntryHandler{q: q, val: validator.New()}
}

// POST /api/v1/contests/:id/entries
func (h *EntryHandler) Create(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	var req dto.CreateEntryRequest
	if err := c.Bind(&req); err != nil {
		return mw.ErrBadRequest("invalid request body")
	}
	if err := h.val.Struct(req); err != nil {
		return mw.ErrBadRequest(err.Error())
	}
	// Validate exactly-one participant source
	if (req.UserID == nil) == (req.TeamID == nil) {
		return mw.ErrBadRequest("exactly one of user_id or team_id required")
	}
	if req.EntryType == "individual" && req.UserID == nil {
		return mw.ErrBadRequest("individual entry requires user_id")
	}
	if req.EntryType == "team" && req.TeamID == nil {
		return mw.ErrBadRequest("team entry requires team_id")
	}

	uid := mw.GetUserID(c)
	ctx := c.Request().Context()

	contest, err := h.q.GetContestByID(ctx, contestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("contest not found")
		}
		return mw.ErrInternal("fetch contest failed: " + err.Error())
	}

	// Mode vs timing: official only while upcoming/running; virtual & practice only after the contest ends.
	contestEnded := contest.EndTime.Valid && contest.EndTime.Time.Before(time.Now())
	switch req.EntryMode {
	case "practice":
		if !contestEnded {
			return mw.ErrBadRequest("practice mode is only available after the contest ends")
		}
	case "official":
		if contestEnded {
			return mw.ErrBadRequest("official registration is closed; the contest has ended")
		}
	}

	status := db.EntryStatusApproved
	if contest.RequireApproval {
		status = db.EntryStatusPending
	}

	entry, err := h.q.CreateContestEntry(ctx, db.CreateContestEntryParams{
		ContestID:    contestID,
		EntryType:    db.EntryType(req.EntryType),
		EntryMode:    db.EntryMode(req.EntryMode),
		UserID:       dto.UUIDToPgUUID(req.UserID),
		TeamID:       dto.UUIDToPgUUID(req.TeamID),
		DisplayName:  req.DisplayName,
		Status:       status,
		RegisteredBy: uid,
		StartAt:      dto.ToPgTimestamptz(req.StartAt),
		EndAt:        dto.ToPgTimestamptz(req.EndAt),
	})
	if err != nil {
		return mw.ErrInternal("create entry failed: " + err.Error())
	}

	// Auto-add registering user as lineup leader
	_ = h.q.AddEntryMember(ctx, db.AddEntryMemberParams{
		ContestEntryID: entry.ID, UserID: uid, Role: db.EntryMemberRoleLeader,
	})

	if req.EntryType == "team" && req.TeamID != nil {
		// Add all accepted team members to the lineup automatically
		members, err := h.q.ListTeamMembers(ctx, *req.TeamID)
		if err == nil {
			for _, m := range members {
				if m.UserID == uid || m.Status != "accepted" {
					continue // already added as leader above; skip pending
				}
				role := db.EntryMemberRoleMember
				if m.Role == db.TeamRoleManager {
					role = db.EntryMemberRoleLeader
				}
				_ = h.q.AddEntryMember(ctx, db.AddEntryMemberParams{
					ContestEntryID: entry.ID, UserID: m.UserID, Role: role,
				})
			}
		}
	} else {
		// Individual: add extra lineup members if explicitly provided
		for _, mid := range req.LineupUserIDs {
			if mid != uid {
				_ = h.q.AddEntryMember(ctx, db.AddEntryMemberParams{
					ContestEntryID: entry.ID, UserID: mid, Role: db.EntryMemberRoleMember,
				})
			}
		}
	}

	return c.JSON(http.StatusCreated, dto.EntryToResponse(entry))
}

// GET /api/v1/contests/:id/entries
func (h *EntryHandler) List(c echo.Context) error {
	contestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid contest id")
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var mode *db.EntryMode
	if m := c.QueryParam("entry_mode"); m != "" {
		v := db.EntryMode(m)
		mode = &v
	}
	var status *db.EntryStatus
	if s := c.QueryParam("status"); s != "" {
		v := db.EntryStatus(s)
		status = &v
	}

	entries, err := h.q.ListContestEntries(c.Request().Context(), db.ListContestEntriesParams{
		ContestID: contestID, Limit: int32(limit), Offset: int32(offset),
		EntryMode: mode, Status: status,
	})
	if err != nil {
		return mw.ErrInternal("list entries failed")
	}
	resp := make([]dto.EntryResponse, len(entries))
	for i, e := range entries {
		resp[i] = dto.EntryToResponse(e)
	}
	return c.JSON(http.StatusOK, resp)
}

// GET /api/v1/entries/:id
func (h *EntryHandler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	entry, err := h.q.GetContestEntryByID(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("entry not found")
		}
		return mw.ErrInternal("fetch entry failed")
	}
	return c.JSON(http.StatusOK, dto.EntryToResponse(entry))
}

// DELETE /api/v1/entries/:id
func (h *EntryHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	if err := h.q.DeleteContestEntry(c.Request().Context(), id); err != nil {
		return mw.ErrInternal("delete entry failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// POST /api/v1/entries/:id/approve
func (h *EntryHandler) Approve(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	uid := mw.GetUserID(c)
	entry, err := h.q.ApproveContestEntry(c.Request().Context(), db.ApproveContestEntryParams{
		ID: id, ApprovedBy: dto.ToPgUUID(uid),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("entry not found")
		}
		return mw.ErrInternal("approve failed")
	}
	return c.JSON(http.StatusOK, dto.EntryToResponse(entry))
}

// POST /api/v1/entries/:id/disqualify
func (h *EntryHandler) Disqualify(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return mw.ErrBadRequest("invalid entry id")
	}
	entry, err := h.q.DisqualifyContestEntry(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return mw.ErrNotFound("entry not found")
		}
		return mw.ErrInternal("disqualify failed")
	}
	return c.JSON(http.StatusOK, dto.EntryToResponse(entry))
}
