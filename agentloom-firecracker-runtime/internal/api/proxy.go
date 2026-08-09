package api

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type callbackEntry struct {
	VMID          string
	Kind          string
	Upstream      string
	UpstreamToken string
	ExpiresAt     time.Time
}

type callbackRegistry struct {
	mutex        sync.Mutex
	entries      map[string]callbackEntry
	allowedHosts map[string]bool
	maxEntries   int
}

func newCallbackRegistry(allowedHosts []string) (*callbackRegistry, error) {
	hosts := make(map[string]bool, len(allowedHosts))
	for _, host := range allowedHosts {
		host = strings.TrimSpace(host)
		if host != "" {
			hosts[host] = true
		}
	}
	if len(hosts) == 0 {
		return nil, errors.New("callback upstream allowlist is required")
	}
	return &callbackRegistry{entries: make(map[string]callbackEntry), allowedHosts: hosts, maxEntries: 10000}, nil
}

func (registry *callbackRegistry) register(vmid, kind, upstream, upstreamToken string) (string, error) {
	parsed, err := url.Parse(upstream)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.Hostname() == "" {
		return "", errors.New("callback URL is invalid")
	}
	if !registry.allowedHosts[parsed.Hostname()] {
		return "", errors.New("callback URL host is not allowed")
	}
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	opaque := hex.EncodeToString(value)
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	now := time.Now()
	for key, entry := range registry.entries {
		if now.After(entry.ExpiresAt) {
			delete(registry.entries, key)
		}
	}
	if len(registry.entries) >= registry.maxEntries {
		return "", errors.New("callback registry capacity exhausted")
	}
	registry.entries[opaque] = callbackEntry{VMID: vmid, Kind: kind, Upstream: parsed.String(), UpstreamToken: upstreamToken, ExpiresAt: now.Add(24 * time.Hour)}
	return opaque, nil
}

func (registry *callbackRegistry) lookup(opaque string) (callbackEntry, bool) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	entry, ok := registry.entries[opaque]
	if !ok || time.Now().After(entry.ExpiresAt) {
		delete(registry.entries, opaque)
		return callbackEntry{}, false
	}
	return entry, true
}

func (server *Server) guestProxy(response http.ResponseWriter, request *http.Request) {
	metadata, token, err := server.manager.GuestAccess(request.PathValue("id"))
	if err != nil {
		server.writeError(response, request, err)
		return
	}
	guestPath := "/" + strings.TrimPrefix(request.PathValue("path"), "/")
	body := request.Body
	if request.Method == http.MethodPost && (guestPath == "/v1/session" || guestPath == "/v1/prompt") {
		content, readErr := io.ReadAll(io.LimitReader(request.Body, 1024*1024+1))
		if readErr != nil || len(content) > 1024*1024 {
			server.writeError(response, request, fmt.Errorf("%w: guest request body is invalid", manager.ErrInvalid))
			return
		}
		rewritten, rewriteErr := server.rewriteCallbacks(metadata, guestPath, content)
		if rewriteErr != nil {
			server.writeError(response, request, fmt.Errorf("%w: %v", manager.ErrInvalid, rewriteErr))
			return
		}
		body = io.NopCloser(bytes.NewReader(rewritten))
	}
	endpoint := "https://" + net.JoinHostPort(metadata.GuestIP, "8443") + guestPath
	if request.URL.RawQuery != "" {
		endpoint += "?" + request.URL.RawQuery
	}
	upstreamRequest, err := http.NewRequestWithContext(request.Context(), request.Method, endpoint, body)
	if err != nil {
		server.writeError(response, request, err)
		return
	}
	copyRequestHeaders(upstreamRequest.Header, request.Header)
	upstreamRequest.Header.Set("Authorization", "Bearer "+token)
	upstreamRequest.ContentLength = -1
	upstreamResponse, err := server.guestClient.Do(upstreamRequest)
	if err != nil {
		server.writeError(response, request, &manager.OperationError{Kind: manager.ErrUnavailable, Op: "guest proxy", Err: err})
		return
	}
	defer upstreamResponse.Body.Close()
	copyResponseHeaders(response.Header(), upstreamResponse.Header)
	response.WriteHeader(upstreamResponse.StatusCode)
	_, _ = io.Copy(response, upstreamResponse.Body)
}

func (server *Server) rewriteCallbacks(metadata manager.Metadata, path string, content []byte) ([]byte, error) {
	var document map[string]any
	if err := json.Unmarshal(content, &document); err != nil {
		return nil, err
	}
	gatewayBase := "http://" + net.JoinHostPort(server.callbackGateway, "18080") + "/v1/callbacks"
	if path == "/v1/prompt" {
		if upstream, ok := document["permissionCallbackUrl"].(string); ok && upstream != "" {
			opaque, err := server.callbacks.register(metadata.SessionID, "permission", upstream, "")
			if err != nil {
				return nil, err
			}
			document["permissionCallbackUrl"] = gatewayBase + "/permission/" + opaque
		}
	}
	if path == "/v1/session" {
		if remote, ok := document["remoteToolExecution"].(map[string]any); ok {
			upstream, _ := remote["callbackUrl"].(string)
			upstreamToken, _ := remote["callbackToken"].(string)
			if upstream != "" && upstreamToken != "" {
				opaque, err := server.callbacks.register(metadata.SessionID, "tools", upstream, upstreamToken)
				if err != nil {
					return nil, err
				}
				remote["callbackUrl"] = gatewayBase + "/tools/" + opaque
				remote["callbackToken"] = opaque
			}
		}
	}
	return json.Marshal(document)
}

func (server *Server) CallbackHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/callbacks/{kind}/{opaque}", server.callback)
	return http.MaxBytesHandler(mux, 1024*1024)
}

func (server *Server) callback(response http.ResponseWriter, request *http.Request) {
	kind, opaque := request.PathValue("kind"), request.PathValue("opaque")
	entry, ok := server.callbacks.lookup(opaque)
	if !ok || entry.Kind != kind {
		http.Error(response, "callback not found", http.StatusNotFound)
		return
	}
	metadata, _, err := server.manager.GuestAccess(entry.VMID)
	if err != nil {
		http.Error(response, "runtime unavailable", http.StatusServiceUnavailable)
		return
	}
	remoteIP, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil || remoteIP != metadata.GuestIP {
		http.Error(response, "forbidden", http.StatusForbidden)
		return
	}
	if kind == "tools" {
		provided := request.Header.Get("X-AgentLoom-Callback-Token")
		if len(provided) != len(opaque) || subtle.ConstantTimeCompare([]byte(provided), []byte(opaque)) != 1 {
			http.Error(response, "forbidden", http.StatusForbidden)
			return
		}
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, 1024*1024+1))
	if err != nil || len(body) > 1024*1024 {
		http.Error(response, "invalid callback body", http.StatusBadRequest)
		return
	}
	upstreamRequest, err := http.NewRequestWithContext(request.Context(), http.MethodPost, entry.Upstream, bytes.NewReader(body))
	if err != nil {
		http.Error(response, "invalid callback target", http.StatusBadGateway)
		return
	}
	upstreamRequest.Header.Set("Content-Type", "application/json")
	if kind == "tools" {
		upstreamRequest.Header.Set("X-AgentLoom-Callback-Token", entry.UpstreamToken)
	}
	upstreamResponse, err := server.callbackClient.Do(upstreamRequest)
	if err != nil {
		http.Error(response, "callback upstream unavailable", http.StatusBadGateway)
		return
	}
	defer upstreamResponse.Body.Close()
	copyResponseHeaders(response.Header(), upstreamResponse.Header)
	response.WriteHeader(upstreamResponse.StatusCode)
	_, _ = io.Copy(response, io.LimitReader(upstreamResponse.Body, 1024*1024))
}

func copyRequestHeaders(target, source http.Header) {
	for name, values := range source {
		if isHopByHop(name) || strings.EqualFold(name, "Authorization") || strings.EqualFold(name, "Host") {
			continue
		}
		for _, value := range values {
			target.Add(name, value)
		}
	}
}

func copyResponseHeaders(target, source http.Header) {
	for name, values := range source {
		if isHopByHop(name) {
			continue
		}
		for _, value := range values {
			target.Add(name, value)
		}
	}
}

func isHopByHop(name string) bool {
	switch strings.ToLower(name) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func callbackHTTPClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:        nil,
			DialContext:  (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			MaxIdleConns: 32, MaxIdleConnsPerHost: 8, IdleConnTimeout: 60 * time.Second,
		},
		Timeout: 35 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return errors.New("callback redirects are disabled")
		},
	}
}
