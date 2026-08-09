package guest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGuestBearerAuthentication(t *testing.T) {
	t.Parallel()

	server, err := NewServer(Config{NodeSocket: "/tmp/non-existent-agentloom.sock"}, Metadata{Token: "secret-token"})
	if err != nil {
		t.Fatal(err)
	}

	unauthorized := httptest.NewRecorder()
	server.Handler().ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/health", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthorized.Code)
	}

	authorizedRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	authorizedRequest.Header.Set("Authorization", "Bearer secret-token")
	authorized := httptest.NewRecorder()
	server.Handler().ServeHTTP(authorized, authorizedRequest)
	if authorized.Code != http.StatusServiceUnavailable {
		t.Fatalf("authorized request should reach unavailable backend, got %d", authorized.Code)
	}
}

func TestLoadMetadataDevModeRequiresExplicitToken(t *testing.T) {
	t.Parallel()

	if _, err := LoadMetadata(context.Background(), nil, true, ""); err == nil {
		t.Fatal("expected missing dev token to fail")
	}
	metadata, err := LoadMetadata(context.Background(), nil, true, "dev-token")
	if err != nil {
		t.Fatal(err)
	}
	if metadata.Token != "dev-token" || metadata.GuestAPIVersion != "v1" {
		t.Fatalf("unexpected metadata: %+v", metadata)
	}
}
