package dto

// User update endpoints DTOs.

type UpdateProfileRequest struct {
	FullName  *string `json:"full_name,omitempty" validate:"omitempty,min=2,max=255"`
	StudentID *string `json:"student_id,omitempty" validate:"omitempty,max=64"`
	AvatarURL *string `json:"avatar_url,omitempty" validate:"omitempty,url,max=500"`
}
