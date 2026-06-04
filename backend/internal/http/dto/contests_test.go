package dto

import (
	"testing"
	"time"

	"github.com/mank1/olpai-backend/db"
	"github.com/stretchr/testify/assert"
)

func TestEffectiveContestStatusUsesScheduleWindow(t *testing.T) {
	now := time.Date(2026, 6, 4, 10, 0, 0, 0, time.UTC)
	start := now.Add(-2 * time.Hour)
	end := now.Add(-1 * time.Hour)

	assert.Equal(t, "ended", effectiveContestStatus(db.ContestStatusRunning, start, end, now))
	assert.Equal(t, "running", effectiveContestStatus(db.ContestStatusRegistrationOpen, now.Add(-1*time.Hour), now.Add(time.Hour), now))
	assert.Equal(t, "draft", effectiveContestStatus(db.ContestStatusDraft, start, end, now))
	assert.Equal(t, "archived", effectiveContestStatus(db.ContestStatusArchived, start, end, now))
}
