package dto

import (
	"time"

	"github.com/google/uuid"
	"github.com/mank1/olpai-backend/db"
)

// --- Announcements ---

type CreateAnnouncementRequest struct {
	TaskID   *uuid.UUID `json:"task_id,omitempty"`
	Title    string     `json:"title" validate:"required,min=2,max=500"`
	Content  string     `json:"content" validate:"required"`
	IsPinned bool       `json:"is_pinned"`
	IsPublic bool       `json:"is_public"`
}

type AnnouncementResponse struct {
	ID        uuid.UUID  `json:"id"`
	ContestID *uuid.UUID `json:"contest_id,omitempty"`
	TaskID    *uuid.UUID `json:"task_id,omitempty"`
	Title     string     `json:"title"`
	Content   string     `json:"content"`
	IsPinned  bool       `json:"is_pinned"`
	IsPublic  bool       `json:"is_public"`
	CreatedBy uuid.UUID  `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
}

func AnnouncementToResponse(a db.Announcement) AnnouncementResponse {
	r := AnnouncementResponse{
		ID: a.ID, Title: a.Title,
		Content: a.Content, IsPinned: a.IsPinned, IsPublic: a.IsPublic,
		CreatedBy: a.CreatedBy, CreatedAt: PgTimeVal(a.CreatedAt),
	}
	if a.ContestID.Valid {
		cid := uuid.UUID(a.ContestID.Bytes)
		r.ContestID = &cid
	}
	if a.TaskID.Valid {
		tid := uuid.UUID(a.TaskID.Bytes)
		r.TaskID = &tid
	}
	return r
}

// --- Clarifications ---

type CreateClarificationRequest struct {
	TaskID   *uuid.UUID `json:"task_id,omitempty"`
	PhaseID  *uuid.UUID `json:"phase_id,omitempty"`
	Question string     `json:"question" validate:"required"`
}

type AnswerClarificationRequest struct {
	Answer   string `json:"answer" validate:"required"`
	IsPublic bool   `json:"is_public"`
}

type ClarificationResponse struct {
	ID             uuid.UUID  `json:"id"`
	ContestID      uuid.UUID  `json:"contest_id"`
	TaskID         *uuid.UUID `json:"task_id,omitempty"`
	PhaseID        *uuid.UUID `json:"phase_id,omitempty"`
	ContestEntryID uuid.UUID  `json:"contest_entry_id"`
	Question       string     `json:"question"`
	Answer         *string    `json:"answer,omitempty"`
	IsPublic       bool       `json:"is_public"`
	Status         string     `json:"status"`
	AskedBy        uuid.UUID  `json:"asked_by"`
	AnsweredBy     *uuid.UUID `json:"answered_by,omitempty"`
	AnsweredAt     *time.Time `json:"answered_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

func ClarificationToResponse(c db.Clarification) ClarificationResponse {
	r := ClarificationResponse{
		ID: c.ID, ContestID: c.ContestID, ContestEntryID: c.ContestEntryID,
		Question: c.Question, Answer: c.Answer, IsPublic: c.IsPublic,
		Status: string(c.Status), AskedBy: c.AskedBy,
		AnsweredAt: PgTime(c.AnsweredAt), CreatedAt: PgTimeVal(c.CreatedAt),
	}
	if c.TaskID.Valid {
		v := uuid.UUID(c.TaskID.Bytes)
		r.TaskID = &v
	}
	if c.PhaseID.Valid {
		v := uuid.UUID(c.PhaseID.Bytes)
		r.PhaseID = &v
	}
	if c.AnsweredBy.Valid {
		v := uuid.UUID(c.AnsweredBy.Bytes)
		r.AnsweredBy = &v
	}
	return r
}

// --- Tickets ---

type CreateTicketRequest struct {
	SubmissionID   *uuid.UUID `json:"submission_id,omitempty"`
	ContestEntryID uuid.UUID  `json:"contest_entry_id" validate:"required"`
	Category       string     `json:"category" validate:"required,oneof=upload judge score system"`
	Subject        string     `json:"subject" validate:"required,min=2,max=500"`
	Description    string     `json:"description" validate:"required"`
}

type TicketResponse struct {
	ID             uuid.UUID  `json:"id"`
	SubmissionID   *uuid.UUID `json:"submission_id,omitempty"`
	ContestEntryID uuid.UUID  `json:"contest_entry_id"`
	Category       string     `json:"category"`
	Subject        string     `json:"subject"`
	Description    string     `json:"description"`
	Status         string     `json:"status"`
	Priority       string     `json:"priority"`
	AssignedTo     *uuid.UUID `json:"assigned_to,omitempty"`
	CreatedBy      uuid.UUID  `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	ResolvedAt     *time.Time `json:"resolved_at,omitempty"`
}

func TicketToResponse(t db.Ticket) TicketResponse {
	r := TicketResponse{
		ID: t.ID, ContestEntryID: t.ContestEntryID,
		Category: string(t.Category), Subject: t.Subject,
		Description: t.Description, Status: string(t.Status),
		Priority: string(t.Priority), CreatedBy: t.CreatedBy,
		CreatedAt: PgTimeVal(t.CreatedAt), ResolvedAt: PgTime(t.ResolvedAt),
	}
	if t.SubmissionID.Valid {
		v := uuid.UUID(t.SubmissionID.Bytes)
		r.SubmissionID = &v
	}
	if t.AssignedTo.Valid {
		v := uuid.UUID(t.AssignedTo.Bytes)
		r.AssignedTo = &v
	}
	return r
}
