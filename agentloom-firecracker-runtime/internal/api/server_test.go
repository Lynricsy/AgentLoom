package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

func TestNewServerRegistersActionRoutesWithoutPanic(t *testing.T) {
	server, err := NewServer(
		&manager.Manager{},
		ServerConfig{
			GuestClient:          http.DefaultClient,
			CallbackAllowedHosts: []string{"server"},
			CallbackGateway:      "127.0.0.1:18080",
		},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/vms/runtime:unknown", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unexpected status: %d", response.Code)
	}
}
