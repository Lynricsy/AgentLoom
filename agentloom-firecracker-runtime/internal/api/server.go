package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type ServerConfig struct {
	GuestClient          *http.Client
	CallbackAllowedHosts []string
	CallbackGateway      string
}

type Server struct {
	manager         *manager.Manager
	logger          *slog.Logger
	mux             *http.ServeMux
	guestClient     *http.Client
	callbackClient  *http.Client
	callbacks       *callbackRegistry
	callbackGateway string
}

type VMResponse struct {
	RuntimeHandle  string                `json:"runtimeHandle"`
	State          manager.State         `json:"state"`
	Resources      manager.Resources     `json:"resources"`
	LifecycleMode  manager.LifecycleMode `json:"lifecycleMode"`
	ArtifactDigest string                `json:"artifactDigest"`
	CreatedAt      time.Time             `json:"createdAt"`
	UpdatedAt      time.Time             `json:"updatedAt"`
}

type problem struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Detail    string `json:"detail"`
	RequestID string `json:"requestId"`
}

func NewServer(runtimeManager *manager.Manager, config ServerConfig, logger *slog.Logger) (*Server, error) {
	if runtimeManager == nil || config.GuestClient == nil || config.CallbackGateway == "" {
		return nil, errors.New("runtime manager, guest client, and callback gateway are required")
	}
	callbacks, err := newCallbackRegistry(config.CallbackAllowedHosts)
	if err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	server := &Server{
		manager: runtimeManager, logger: logger, mux: http.NewServeMux(), guestClient: config.GuestClient,
		callbackClient: callbackHTTPClient(), callbacks: callbacks, callbackGateway: config.CallbackGateway,
	}
	server.mux.HandleFunc("GET /healthz", server.health)
	server.mux.HandleFunc("GET /readyz", server.health)
	server.mux.HandleFunc("GET /metrics", server.metrics)
	server.mux.HandleFunc("POST /v1/vms", server.create)
	server.mux.HandleFunc("GET /v1/vms/{id}", server.inspect)
	server.mux.HandleFunc("POST /v1/vms/{action}", server.action)
	server.mux.HandleFunc("DELETE /v1/vms/{id}", server.delete)
	server.mux.HandleFunc("/v1/vms/{id}/guest/{path...}", server.guestProxy)
	return server, nil
}

func (server *Server) Handler() http.Handler {
	return server.requestID(server.mux)
}

func (server *Server) requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requestID := request.Header.Get("X-Request-ID")
		if len(requestID) < 8 || len(requestID) > 128 {
			value := make([]byte, 16)
			_, _ = rand.Read(value)
			requestID = hex.EncodeToString(value)
		}
		response.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(response, request.WithContext(context.WithValue(request.Context(), requestIDKey{}, requestID)))
	})
}

type requestIDKey struct{}

func (server *Server) health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Server) metrics(response http.ResponseWriter, _ *http.Request) {
	snapshot := server.manager.Capacity()
	response.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = fmt.Fprintf(response, "agentloom_firecracker_vms %d\nagentloom_firecracker_vms_limit %d\nagentloom_firecracker_vcpu %.3f\nagentloom_firecracker_memory_mib %d\nagentloom_firecracker_disk_gib %d\n", snapshot.VMsUsed, snapshot.VMsLimit, snapshot.VCPUUsed, snapshot.MemoryMiBUsed, snapshot.DiskGiBUsed)
}

func (server *Server) create(response http.ResponseWriter, request *http.Request) {
	var input manager.CreateRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 1024*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		server.writeError(response, request, fmt.Errorf("%w: %v", manager.ErrInvalid, err))
		return
	}
	if decoder.Decode(&struct{}{}) == nil {
		server.writeError(response, request, fmt.Errorf("%w: multiple JSON values", manager.ErrInvalid))
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 60*time.Second)
	defer cancel()
	metadata, err := server.manager.Create(ctx, input)
	if err != nil {
		server.writeError(response, request, err)
		return
	}
	writeJSON(response, http.StatusCreated, vmResponse(metadata))
}

func (server *Server) inspect(response http.ResponseWriter, request *http.Request) {
	metadata, err := server.manager.Inspect(request.PathValue("id"))
	if err != nil {
		server.writeError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, vmResponse(metadata))
}

func (server *Server) action(response http.ResponseWriter, request *http.Request) {
	raw := request.PathValue("action")
	if id, ok := strings.CutSuffix(raw, ":start"); ok {
		request.SetPathValue("id", id)
		server.start(response, request)
		return
	}
	if id, ok := strings.CutSuffix(raw, ":stop"); ok {
		request.SetPathValue("id", id)
		server.stop(response, request)
		return
	}
	server.writeError(
		response,
		request,
		fmt.Errorf("%w: unsupported VM action", manager.ErrInvalid),
	)
}

func (server *Server) start(response http.ResponseWriter, request *http.Request) {
	metadata, err := server.manager.Start(request.Context(), request.PathValue("id"))
	if err != nil {
		server.writeError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, vmResponse(metadata))
}

func (server *Server) stop(response http.ResponseWriter, request *http.Request) {
	metadata, err := server.manager.Stop(request.Context(), request.PathValue("id"))
	if err != nil {
		server.writeError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, vmResponse(metadata))
}

func (server *Server) delete(response http.ResponseWriter, request *http.Request) {
	deleteDisk := true
	if raw := request.URL.Query().Get("deleteDisk"); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			server.writeError(response, request, fmt.Errorf("%w: invalid deleteDisk", manager.ErrInvalid))
			return
		}
		deleteDisk = parsed
	}
	if err := server.manager.Delete(request.Context(), request.PathValue("id"), deleteDisk); err != nil {
		server.writeError(response, request, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func vmResponse(metadata manager.Metadata) VMResponse {
	return VMResponse{
		RuntimeHandle: metadata.SessionID, State: metadata.State, Resources: metadata.Resources,
		LifecycleMode: metadata.LifecycleMode, ArtifactDigest: metadata.ArtifactDigest,
		CreatedAt: metadata.CreatedAt, UpdatedAt: metadata.UpdatedAt,
	}
}

func (server *Server) writeError(response http.ResponseWriter, request *http.Request, err error) {
	status, title, problemType := http.StatusInternalServerError, "Runtime operation failed", "https://agentloom.dev/errors/firecracker-runtime"
	switch {
	case errors.Is(err, manager.ErrInvalid):
		status, title, problemType = http.StatusUnprocessableEntity, "Invalid runtime request", "https://agentloom.dev/errors/invalid-runtime-request"
	case errors.Is(err, manager.ErrNotFound):
		status, title, problemType = http.StatusNotFound, "Runtime not found", "https://agentloom.dev/errors/runtime-not-found"
	case errors.Is(err, manager.ErrConflict):
		status, title, problemType = http.StatusConflict, "Runtime state conflict", "https://agentloom.dev/errors/runtime-conflict"
	case errors.Is(err, manager.ErrCapacity):
		status, title, problemType = http.StatusServiceUnavailable, "Runtime capacity exhausted", "https://agentloom.dev/errors/runtime-capacity"
	case errors.Is(err, manager.ErrUnavailable), errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		status, title, problemType = http.StatusServiceUnavailable, "Runtime unavailable", "https://agentloom.dev/errors/runtime-unavailable"
	}
	requestID, _ := request.Context().Value(requestIDKey{}).(string)
	detail := strings.ReplaceAll(err.Error(), "\n", " ")
	if len(detail) > 512 {
		detail = detail[:512]
	}
	server.logger.Error("runtime request failed", "requestId", requestID, "method", request.Method, "path", request.URL.Path, "status", status, "error", err)
	writeJSON(response, status, problem{Type: problemType, Title: title, Status: status, Detail: detail, RequestID: requestID})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
