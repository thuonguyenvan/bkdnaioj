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
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}
