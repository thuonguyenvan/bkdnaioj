// Package dto holds request/response structs for API endpoints.
package dto

import (
	"time"

	"github.com/google/uuid"
)

// Auth endpoints DTOs.

type RegisterRequest struct {
	Email     string  `json:"email"      validate:"required,email,max=255"`
	Password  string  `json:"password"   validate:"required,min=8,max=128"`
	FullName  string  `json:"full_name"  validate:"required,min=2,max=255"`
	Username  *string `json:"username,omitempty" validate:"omitempty,min=3,max=60,alphanum"`
	StudentID *string `json:"student_id,omitempty" validate:"omitempty,max=64"`
}

// LoginRequest: email field accepts email OR username
type LoginRequest struct {
	Email    string `json:"email"    validate:"required,max=255"`
	Password string `json:"password" validate:"required"`
}

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

type UserResponse struct {
	ID        uuid.UUID  `json:"id"`
	Email     string     `json:"email"`
	FullName  string     `json:"full_name"`
	Username  *string    `json:"username,omitempty"`
	Role      string     `json:"role"`
	StudentID *string    `json:"student_id,omitempty"`
	AvatarURL *string    `json:"avatar_url,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	LastVisit *time.Time `json:"last_visit,omitempty"`
}

type AuthResponse struct {
	User  UserResponse  `json:"user"`
	Token TokenResponse `json:"token"`
}
