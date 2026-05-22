package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mank1/olpai-backend/db"
)

type CreateContestRequest struct {
	Slug              string           `json:"slug" validate:"required,min=2,max=120"`
	Title             string           `json:"title" validate:"required,min=2,max=500"`
	Description       *string          `json:"description,omitempty"`
	BannerURL         *string          `json:"banner_url,omitempty"`
	EntryPolicy       string           `json:"entry_policy" validate:"required,oneof=individual team both"`
	RegistrationStart *time.Time       `json:"registration_start,omitempty"`
	RegistrationEnd   *time.Time       `json:"registration_end,omitempty"`
	StartTime         time.Time        `json:"start_time" validate:"required"`
	EndTime           time.Time        `json:"end_time" validate:"required"`
	Visibility        string           `json:"visibility" validate:"required,oneof=public private"`
	RulesJSON         *json.RawMessage `json:"rules_json,omitempty"`
	MaxTeamSize       int32            `json:"max_team_size" validate:"required,gt=0"`
	RequireApproval   bool             `json:"require_approval"`
	ScaleScores       bool             `json:"scale_scores"`
}

type UpdateContestRequest struct {
	Title             *string          `json:"title,omitempty"`
	Description       *string          `json:"description,omitempty"`
	BannerURL         *string          `json:"banner_url,omitempty"`
	EntryPolicy       *string          `json:"entry_policy,omitempty" validate:"omitempty,oneof=individual team both"`
	RegistrationStart *time.Time       `json:"registration_start,omitempty"`
	RegistrationEnd   *time.Time       `json:"registration_end,omitempty"`
	StartTime         *time.Time       `json:"start_time,omitempty"`
	EndTime           *time.Time       `json:"end_time,omitempty"`
	Visibility        *string          `json:"visibility,omitempty" validate:"omitempty,oneof=public private"`
	RulesJSON         *json.RawMessage `json:"rules_json,omitempty"`
	MaxTeamSize       *int32           `json:"max_team_size,omitempty" validate:"omitempty,gt=0"`
	RequireApproval   *bool            `json:"require_approval,omitempty"`
	ScaleScores       *bool            `json:"scale_scores,omitempty"`
}

type ContestResponse struct {
	ID                uuid.UUID       `json:"id"`
	Slug              string          `json:"slug"`
	Title             string          `json:"title"`
	Description       *string         `json:"description,omitempty"`
	BannerURL         *string         `json:"banner_url,omitempty"`
	Status            string          `json:"status"`
	EntryPolicy       string          `json:"entry_policy"`
	RegistrationStart *time.Time      `json:"registration_start,omitempty"`
	RegistrationEnd   *time.Time      `json:"registration_end,omitempty"`
	StartTime         time.Time       `json:"start_time"`
	EndTime           time.Time       `json:"end_time"`
	Visibility        string          `json:"visibility"`
	RulesJSON         json.RawMessage `json:"rules_json"`
	MaxTeamSize       int32           `json:"max_team_size"`
	RequireApproval   bool            `json:"require_approval"`
	ScaleScores       bool            `json:"scale_scores"`
	CreatedAt         time.Time       `json:"created_at"`
}

func ContestToResponse(c db.Contest) ContestResponse {
	return ContestResponse{
		ID:                c.ID,
		Slug:              c.Slug,
		Title:             c.Title,
		Description:       c.Description,
		BannerURL:         c.BannerUrl,
		Status:            string(c.Status),
		EntryPolicy:       string(c.EntryPolicy),
		RegistrationStart: PgTime(c.RegistrationStart),
		RegistrationEnd:   PgTime(c.RegistrationEnd),
		StartTime:         PgTimeVal(c.StartTime),
		EndTime:           PgTimeVal(c.EndTime),
		Visibility:        string(c.Visibility),
		RulesJSON:         c.RulesJson,
		MaxTeamSize:       c.MaxTeamSize,
		RequireApproval:   c.RequireApproval,
		ScaleScores:       c.ScaleScores,
		CreatedAt:         PgTimeVal(c.CreatedAt),
	}
}

// ToPgTimestamptz converts a *time.Time to pgtype.Timestamptz for sqlc.
func ToPgTimestamptz(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

func ToPgTimestamptzVal(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func ToPgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}
