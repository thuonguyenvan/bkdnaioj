package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	mw "github.com/mank1/olpai-backend/internal/http/middleware"
)

// newTestContext creates an Echo context and response recorder for handler tests.
func newTestContext(method, path, body string) (echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return c, rec
}

// setAuthContext sets user ID and role on an Echo context, simulating JWT auth.
func setAuthContext(c echo.Context, userID uuid.UUID, role string) {
	c.Set(mw.CtxUserID, userID)
	c.Set(mw.CtxRole, role)
}

// parseBody decodes the JSON response body into a generic map.
func parseBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to parse response body: %v", err)
	}
	return result
}
