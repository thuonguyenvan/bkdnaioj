package dto

import (
	"time"

	"github.com/google/uuid"
)

// Team endpoints DTOs.

type CreateTeamRequest struct {
	Slug string `json:"slug" validate:"required,min=2,max=120"`
	Name string `json:"name" validate:"required,min=2,max=255"`
}

type UpdateTeamRequest struct {
	Name *string `json:"name,omitempty" validate:"omitempty,min=2,max=255"`
}

type AddMemberRequest struct {
	Username string `json:"username" validate:"required,min=1,max=60"`
	Role     string `json:"role" validate:"required,oneof=manager member"`
}

type TeamResponse struct {
	ID        uuid.UUID `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	OwnerID   uuid.UUID `json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
}

type TeamMemberResponse struct {
	UserID   uuid.UUID `json:"user_id"`
	Email    string    `json:"email"`
	FullName string    `json:"full_name"`
	Username *string   `json:"username"`
	Role     string    `json:"role"`
	Status   string    `json:"status"`
	JoinedAt time.Time `json:"joined_at"`
}

type TeamInvitationResponse struct {
	TeamID   uuid.UUID `json:"team_id"`
	TeamName string    `json:"team_name"`
	TeamSlug string    `json:"team_slug"`
	Role     string    `json:"role"`
}
