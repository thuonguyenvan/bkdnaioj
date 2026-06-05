package dto

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
)

// PgTime converts a pgtype.Timestamptz to *time.Time (nil if not valid).
func PgTime(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

// PgTimeVal converts a pgtype.Timestamptz to time.Time (zero if not valid).
func PgTimeVal(t pgtype.Timestamptz) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return t.Time
}

// UserToResponse maps db.User to dto.UserResponse.
func UserToResponse(u db.User) UserResponse {
	return UserResponse{
		ID:        u.ID,
		Email:     u.Email,
		FullName:  u.FullName,
		Username:  u.Username,
		Role:      string(u.Role),
		StudentID: u.StudentID,
		AvatarURL: u.AvatarUrl,
		CreatedAt: PgTimeVal(u.CreatedAt),
		LastVisit: PgTime(u.LastVisit),
	}
}
