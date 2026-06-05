// Package middleware provides Echo middlewares for error handling, auth, and authz.
package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// AppError is the standard API error shape.
type AppError struct {
	Code    string `json:"error"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
	Status  int    `json:"-"`
}

func (e *AppError) Error() string { return e.Message }

// Common errors (reuse instead of allocating each time).
func ErrBadRequest(msg string) *AppError {
	return &AppError{Code: "VALIDATION_ERROR", Message: msg, Status: http.StatusBadRequest}
}
func ErrUnauthorized(msg string) *AppError {
	return &AppError{Code: "UNAUTHORIZED", Message: msg, Status: http.StatusUnauthorized}
}
func ErrForbidden(msg string) *AppError {
	return &AppError{Code: "FORBIDDEN", Message: msg, Status: http.StatusForbidden}
}
func ErrNotFound(msg string) *AppError {
	return &AppError{Code: "NOT_FOUND", Message: msg, Status: http.StatusNotFound}
}
func ErrConflict(msg string) *AppError {
	return &AppError{Code: "CONFLICT", Message: msg, Status: http.StatusConflict}
}
func ErrInternal(msg string) *AppError {
	return &AppError{Code: "INTERNAL_ERROR", Message: msg, Status: http.StatusInternalServerError}
}
func ErrTooManyRequests(msg string) *AppError {
	return &AppError{Code: "RATE_LIMITED", Message: msg, Status: http.StatusTooManyRequests}
}

// ErrorHandler is a custom Echo error handler that renders AppError as JSON.
func ErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}
	if ae, ok := err.(*AppError); ok {
		_ = c.JSON(ae.Status, ae)
		return
	}
	if he, ok := err.(*echo.HTTPError); ok {
		_ = c.JSON(he.Code, &AppError{
			Code:    http.StatusText(he.Code),
			Message: he.Error(),
			Status:  he.Code,
		})
		return
	}
	_ = c.JSON(http.StatusInternalServerError, &AppError{
		Code: "INTERNAL_ERROR", Message: "internal server error",
	})
}
