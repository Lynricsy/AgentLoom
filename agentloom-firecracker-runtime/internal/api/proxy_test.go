package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

// D-10 回归：relay 的回调令牌头名必须与 guest / server 契约一致。
func TestCallbackTokenHeaderMatchesGuestAndServerContract(t *testing.T) {
	if callbackTokenHeader != "x-agentloom-sandbox-session-token" {
		t.Fatalf("callback token header drifted from the guest/server contract: %q", callbackTokenHeader)
	}
}

func TestCallbackTokenAuthorizedAcceptsContractHeader(t *testing.T) {
	opaque := strings.Repeat("a", 64)
	request := httptest.NewRequest(http.MethodPost, "/v1/callbacks/tools/"+opaque, nil)
	request.Header.Set(callbackTokenHeader, opaque)

	if !callbackTokenAuthorized(request, opaque) {
		t.Fatal("inbound callback carrying the contract header must be authorized")
	}
}

func TestCallbackTokenAuthorizedRejectsLegacyAndWrongTokens(t *testing.T) {
	opaque := strings.Repeat("a", 64)

	legacy := httptest.NewRequest(http.MethodPost, "/v1/callbacks/tools/"+opaque, nil)
	legacy.Header.Set("X-AgentLoom-Callback-Token", opaque)
	if callbackTokenAuthorized(legacy, opaque) {
		t.Fatal("legacy header name must not authorize the callback")
	}

	wrong := httptest.NewRequest(http.MethodPost, "/v1/callbacks/tools/"+opaque, nil)
	wrong.Header.Set(callbackTokenHeader, strings.Repeat("b", 64))
	if callbackTokenAuthorized(wrong, opaque) {
		t.Fatal("mismatched token must not authorize the callback")
	}

	missing := httptest.NewRequest(http.MethodPost, "/v1/callbacks/tools/"+opaque, nil)
	if callbackTokenAuthorized(missing, opaque) {
		t.Fatal("missing token must not authorize the callback")
	}
}

func TestApplyCallbackTokenForwardsUnderContractHeader(t *testing.T) {
	upstream := httptest.NewRequest(http.MethodPost, "http://worker:3000/api/v1/tools", nil)
	applyCallbackToken(upstream.Header, "upstream-secret")

	if got := upstream.Header.Get("x-agentloom-sandbox-session-token"); got != "upstream-secret" {
		t.Fatalf("upstream request lost the contract header, got %q", got)
	}
	if upstream.Header.Get("X-AgentLoom-Callback-Token") != "" {
		t.Fatal("upstream request must not carry the legacy header name")
	}
}

func TestRewriteCallbacksUsesOpaqueRelayAndPreservesUpstreamSecretOnlyInManager(t *testing.T) {
	registry, err := newCallbackRegistry([]string{"worker"})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{callbacks: registry, callbackGateway: "172.30.0.1"}
	metadata := manager.Metadata{SessionID: "11111111-1111-4111-8111-111111111111"}
	content := []byte(`{"sessionId":"session","remoteToolExecution":{"sessionId":"session","callbackUrl":"http://worker:3000/api/v1/tools","callbackToken":"upstream-secret","tools":[]}}`)
	rewritten, err := server.rewriteCallbacks(metadata, "/v1/session", content)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(rewritten), "upstream-secret") || strings.Contains(string(rewritten), "worker:3000") {
		t.Fatalf("upstream secret leaked to guest: %s", rewritten)
	}
	var document map[string]any
	if err := json.Unmarshal(rewritten, &document); err != nil {
		t.Fatal(err)
	}
	remote := document["remoteToolExecution"].(map[string]any)
	opaque := remote["callbackToken"].(string)
	if len(opaque) != 64 || remote["callbackUrl"] != "http://172.30.0.1:18080/v1/callbacks/tools/"+opaque {
		t.Fatalf("unexpected relay config: %+v", remote)
	}
	entry, ok := registry.lookup(opaque)
	if !ok || entry.UpstreamToken != "upstream-secret" || entry.Upstream != "http://worker:3000/api/v1/tools" {
		t.Fatalf("upstream mapping lost: %+v", entry)
	}
}

func TestRewriteCallbacksRejectsUnapprovedUpstream(t *testing.T) {
	registry, err := newCallbackRegistry([]string{"worker"})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{callbacks: registry, callbackGateway: "172.30.0.1"}
	content := []byte(`{"permissionCallbackUrl":"http://169.254.169.254/latest/meta-data"}`)
	if _, err := server.rewriteCallbacks(manager.Metadata{SessionID: "id"}, "/v1/prompt", content); err == nil {
		t.Fatal("expected SSRF target rejection")
	}
}

func TestVMResponseOmitsHostRuntimeImplementationDetails(t *testing.T) {
	encoded, err := json.Marshal(vmResponse(manager.Metadata{SessionID: "id", PID: 42, DiskPath: "/secret/disk", APISocketPath: "/secret/socket", GuestIP: "172.30.0.2"}))
	if err != nil {
		t.Fatal(err)
	}
	value := string(encoded)
	for _, forbidden := range []string{"pid", "diskPath", "apiSocketPath", "guestIp", "/secret"} {
		if strings.Contains(value, forbidden) {
			t.Fatalf("response exposed %q: %s", forbidden, value)
		}
	}
}
