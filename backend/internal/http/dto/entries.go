package dto

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
)

type CreateEntryRequest struct {
	EntryType     string      `json:"entry_type" validate:"required,oneof=individual team"`
	EntryMode     string      `json:"entry_mode" validate:"required,oneof=official virtual practice"`
	UserID        *uuid.UUID  `json:"user_id,omitempty"`
	TeamID        *uuid.UUID  `json:"team_id,omitempty"`
	DisplayName   string      `json:"display_name" validate:"required,min=1,max=255"`
	StartAt       *time.Time  `json:"start_at,omitempty"`
	EndAt         *time.Time  `json:"end_at,omitempty"`
	LineupUserIDs []uuid.UUID `json:"lineup_user_ids,omitempty"`
}

type EntryResponse struct {
	ID           uuid.UUID  `json:"id"`
	ContestID    uuid.UUID  `json:"contest_id"`
	EntryType    string     `json:"entry_type"`
	EntryMode    string     `json:"entry_mode"`
	UserID       *uuid.UUID `json:"user_id,omitempty"`
	TeamID       *uuid.UUID `json:"team_id,omitempty"`
	DisplayName  string     `json:"display_name"`
	Status       string     `json:"status"`
	RegisteredBy uuid.UUID  `json:"registered_by"`
	ApprovedBy   *uuid.UUID `json:"approved_by,omitempty"`
	ApprovedAt   *time.Time `json:"approved_at,omitempty"`
	StartAt      *time.Time `json:"start_at,omitempty"`
	EndAt        *time.Time `json:"end_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type EntryMemberResponse struct {
	UserID   uuid.UUID `json:"user_id"`
	Email    string    `json:"email"`
	FullName string    `json:"full_name"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type AddEntryMemberRequest struct {
	UserID uuid.UUID `json:"user_id" validate:"required"`
	Role   string    `json:"role" validate:"required,oneof=leader member"`
}

func EntryToResponse(e db.ContestEntry) EntryResponse {
	r := EntryResponse{
		ID: e.ID, ContestID: e.ContestID,
		EntryType: string(e.EntryType), EntryMode: string(e.EntryMode),
		DisplayName: e.DisplayName, Status: string(e.Status),
		RegisteredBy: e.RegisteredBy,
		ApprovedAt:   PgTime(e.ApprovedAt),
		StartAt:      PgTime(e.StartAt),
		EndAt:        PgTime(e.EndAt),
		CreatedAt:    PgTimeVal(e.CreatedAt),
	}
	if e.UserID.Valid {
		uid := uuid.UUID(e.UserID.Bytes)
		r.UserID = &uid
	}
	if e.TeamID.Valid {
		tid := uuid.UUID(e.TeamID.Bytes)
		r.TeamID = &tid
	}
	if e.ApprovedBy.Valid {
		aid := uuid.UUID(e.ApprovedBy.Bytes)
		r.ApprovedBy = &aid
	}
	return r
}

func EntryMemberToResponse(m db.ListEntryMembersRow) EntryMemberResponse {
	return EntryMemberResponse{
		UserID: m.UserID, Email: m.Email, FullName: m.FullName,
		Role: string(m.Role), JoinedAt: PgTimeVal(m.JoinedAt),
	}
}

// UUIDToPgUUID converts *uuid.UUID to pgtype.UUID for sqlc nullable fields.
func UUIDToPgUUID(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}
