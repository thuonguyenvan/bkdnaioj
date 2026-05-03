package handlers

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mank1/olpai-backend/db"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
	"github.com/stretchr/testify/assert"
)

func TestTicketHandler_Create_Success(t *testing.T) {
	userID := uuid.New()
	entryID := uuid.New()
	mock := &db.MockQuerier{
		CreateTicketFunc: func(ctx context.Context, arg db.CreateTicketParams) (db.Ticket, error) {
			return db.Ticket{
				ID: uuid.New(), ContestEntryID: entryID,
				Category: "upload", Subject: "Upload failed", Description: "Details",
				CreatedBy: userID,
			}, nil
		},
	}
	h := NewTicketHandler(mock)
	body := fmt.Sprintf(`{"contest_entry_id":"%s","category":"upload","subject":"Upload failed","description":"Details"}`, entryID)
	c, rec := newTestContext("POST", "/api/v1/tickets", body)
	setAuthContext(c, userID, "contestant")

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestTicketHandler_Create_ValidationError(t *testing.T) {
	mock := &db.MockQuerier{}
	h := NewTicketHandler(mock)
	// Missing subject
	body := fmt.Sprintf(`{"contest_entry_id":"%s","category":"upload","description":"Details"}`, uuid.New())
	c, _ := newTestContext("POST", "/api/v1/tickets", body)
	setAuthContext(c, uuid.New(), "contestant")

	err := h.Create(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, err.(*mw.AppError).Status)
}

func TestTicketHandler_ListMine_Success(t *testing.T) {
	userID := uuid.New()
	mock := &db.MockQuerier{
		ListTicketsByUserFunc: func(ctx context.Context, uid uuid.UUID) ([]db.Ticket, error) {
			return []db.Ticket{{ID: uuid.New(), CreatedBy: uid}}, nil
		},
	}
	h := NewTicketHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/tickets/me", "")
	setAuthContext(c, userID, "contestant")

	err := h.ListMine(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTicketHandler_ListAll_Success(t *testing.T) {
	mock := &db.MockQuerier{
		ListTicketsAllFunc: func(ctx context.Context, arg db.ListTicketsAllParams) ([]db.Ticket, error) {
			return []db.Ticket{{ID: uuid.New()}}, nil
		},
	}
	h := NewTicketHandler(mock)
	c, rec := newTestContext("GET", "/api/v1/tickets", "")

	err := h.ListAll(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTicketHandler_Update_Success(t *testing.T) {
	ticketID := uuid.New()
	mock := &db.MockQuerier{
		UpdateTicketFunc: func(ctx context.Context, arg db.UpdateTicketParams) (db.Ticket, error) {
			return db.Ticket{ID: ticketID, Subject: "Updated"}, nil
		},
	}
	h := NewTicketHandler(mock)
	body := `{"status":"in_progress"}`
	c, rec := newTestContext("PATCH", "/api/v1/tickets/"+ticketID.String(), body)
	c.SetParamNames("id")
	c.SetParamValues(ticketID.String())

	err := h.Update(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTicketHandler_Update_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		UpdateTicketFunc: func(ctx context.Context, arg db.UpdateTicketParams) (db.Ticket, error) {
			return db.Ticket{}, pgx.ErrNoRows
		},
	}
	h := NewTicketHandler(mock)
	body := `{"status":"in_progress"}`
	c, _ := newTestContext("PATCH", "/api/v1/tickets/"+uuid.New().String(), body)
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.Update(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}

func TestTicketHandler_Resolve_Success(t *testing.T) {
	ticketID := uuid.New()
	mock := &db.MockQuerier{
		ResolveTicketFunc: func(ctx context.Context, id uuid.UUID) (db.Ticket, error) {
			return db.Ticket{ID: ticketID}, nil
		},
	}
	h := NewTicketHandler(mock)
	c, rec := newTestContext("POST", "/api/v1/tickets/"+ticketID.String()+"/resolve", "")
	c.SetParamNames("id")
	c.SetParamValues(ticketID.String())

	err := h.Resolve(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTicketHandler_Resolve_NotFound(t *testing.T) {
	mock := &db.MockQuerier{
		ResolveTicketFunc: func(ctx context.Context, id uuid.UUID) (db.Ticket, error) {
			return db.Ticket{}, pgx.ErrNoRows
		},
	}
	h := NewTicketHandler(mock)
	c, _ := newTestContext("POST", "/api/v1/tickets/"+uuid.New().String()+"/resolve", "")
	c.SetParamNames("id")
	c.SetParamValues(uuid.New().String())

	err := h.Resolve(c)
	assert.Error(t, err)
	assert.Equal(t, http.StatusNotFound, err.(*mw.AppError).Status)
}
