package guest

import (
	"context"
	"crypto/subtle"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const (
	mmdsAddress       = "http://169.254.169.254"
	defaultNodeSocket = "/run/agentloom/agent.sock"
	defaultNodeEntry  = "/opt/agentloom-sandbox/dist/server.js"
)

type Metadata struct {
	Token            string `json:"token"`
	SessionID        string `json:"sessionId"`
	GuestIP          string `json:"guestIp"`
	Gateway          string `json:"gateway"`
	ArtifactDigest   string `json:"artifactDigest"`
	GuestAPIVersion  string `json:"guestApiVersion"`
	TLSCertificate   string `json:"tlsCertificate"`
	TLSPrivateKey    string `json:"tlsPrivateKey"`
	CallbackRelayURL string `json:"callbackRelayUrl"`
}

type Config struct {
	ListenAddress string
	NodeSocket    string
	NodeEntry     string
	Logger        *slog.Logger
	DevMode       bool
}

type Server struct {
	config      Config
	metadata    Metadata
	proxy       *httputil.ReverseProxy
	certificate *tls.Certificate
	runtime     *RuntimeAPI
}

func NewServer(config Config, metadata Metadata) (*Server, error) {
	if metadata.Token == "" {
		return nil, errors.New("guest bearer token is required")
	}
	if config.ListenAddress == "" {
		config.ListenAddress = ":8443"
	}
	if config.NodeSocket == "" {
		config.NodeSocket = defaultNodeSocket
	}
	if config.NodeEntry == "" {
		config.NodeEntry = defaultNodeEntry
	}
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	var certificate *tls.Certificate
	if metadata.TLSCertificate != "" || metadata.TLSPrivateKey != "" {
		parsed, err := tls.X509KeyPair([]byte(metadata.TLSCertificate), []byte(metadata.TLSPrivateKey))
		if err != nil {
			return nil, fmt.Errorf("parse guest TLS identity: %w", err)
		}
		certificate = &parsed
	}

	backend, _ := url.Parse("http://agentloom-node")
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "unix", config.NodeSocket)
		},
		DisableCompression: true,
		ForceAttemptHTTP2:  false,
	}
	proxy := httputil.NewSingleHostReverseProxy(backend)
	proxy.Transport = transport
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(response http.ResponseWriter, request *http.Request, err error) {
		config.Logger.Warn("node runtime unavailable", "path", request.URL.Path, "error", err)
		http.Error(response, "guest runtime unavailable", http.StatusServiceUnavailable)
	}
	return &Server{config: config, metadata: metadata, proxy: proxy, certificate: certificate, runtime: NewRuntimeAPI()}, nil
}

func (server *Server) Handler() http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		provided := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
		if len(provided) != len(server.metadata.Token) ||
			subtle.ConstantTimeCompare([]byte(provided), []byte(server.metadata.Token)) != 1 {
			response.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(response, "unauthorized", http.StatusUnauthorized)
			return
		}
		request.Header.Del("Authorization")
		if strings.HasPrefix(request.URL.Path, "/v1/runtime/") {
			server.runtime.ServeHTTP(response, request)
			return
		}
		if request.Method == http.MethodGet && request.URL.Path == "/health" {
			connection, err := net.DialTimeout("unix", server.config.NodeSocket, 500*time.Millisecond)
			if err != nil {
				http.Error(response, "guest runtime unavailable", http.StatusServiceUnavailable)
				return
			}
			_ = connection.Close()
			response.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(response).Encode(map[string]string{
				"status": "ok", "guestApiVersion": server.metadata.GuestAPIVersion,
				"artifactDigest": server.metadata.ArtifactDigest,
			})
			return
		}
		server.proxy.ServeHTTP(response, request)
	})
}

func (server *Server) Run(ctx context.Context) error {
	childErrors := make(chan error, 1)
	go func() {
		childErrors <- superviseNodeRuntime(ctx, server.config)
	}()

	httpServer := &http.Server{
		Addr:              server.config.ListenAddress,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    64 * 1024,
	}
	listener, err := net.Listen("tcp", server.config.ListenAddress)
	if err != nil {
		return err
	}
	if !server.config.DevMode {
		if server.certificate == nil {
			listener.Close()
			return errors.New("guest TLS identity is required")
		}
		listener = tls.NewListener(listener, &tls.Config{MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{*server.certificate}})
	}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- httpServer.Serve(listener)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownCtx)
	case err := <-childErrors:
		return fmt.Errorf("node runtime supervisor: %w", err)
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func superviseNodeRuntime(ctx context.Context, config Config) error {
	backoff := 100 * time.Millisecond
	for {
		command := exec.CommandContext(ctx, "node", config.NodeEntry)
		command.Stdout = os.Stdout
		command.Stderr = os.Stderr
		command.Env = append(os.Environ(),
			"SANDBOX_LISTEN_SOCKET="+config.NodeSocket,
			"SANDBOX_SESSION_ROOT=/run/agentloom/sessions",
			"NODE_ENV=production",
		)
		err := command.Run()
		if ctx.Err() != nil {
			return nil
		}
		config.Logger.Error("node runtime exited", "error", err, "restartDelay", backoff)
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
}

func LoadMetadata(ctx context.Context, client *http.Client, devMode bool, devToken string) (Metadata, error) {
	if devMode {
		if devToken == "" {
			return Metadata{}, errors.New("AGENTLOOM_GUEST_TOKEN is required in dev mode")
		}
		return Metadata{Token: devToken, GuestAPIVersion: "v1"}, nil
	}
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}

	tokenRequest, err := http.NewRequestWithContext(ctx, http.MethodPut, mmdsAddress+"/latest/api/token", nil)
	if err != nil {
		return Metadata{}, err
	}
	tokenRequest.Header.Set("X-metadata-token-ttl-seconds", "21600")
	tokenResponse, err := client.Do(tokenRequest)
	if err != nil {
		return Metadata{}, fmt.Errorf("request MMDSv2 token: %w", err)
	}
	defer tokenResponse.Body.Close()
	if tokenResponse.StatusCode != http.StatusOK {
		return Metadata{}, fmt.Errorf("MMDSv2 token returned %s", tokenResponse.Status)
	}
	tokenContent, err := io.ReadAll(io.LimitReader(tokenResponse.Body, 4096))
	if err != nil {
		return Metadata{}, fmt.Errorf("read MMDSv2 token: %w", err)
	}

	metadataRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, mmdsAddress+"/latest/meta-data/agentloom", nil)
	if err != nil {
		return Metadata{}, err
	}
	metadataRequest.Header.Set("X-metadata-token", strings.TrimSpace(string(tokenContent)))
	metadataResponse, err := client.Do(metadataRequest)
	if err != nil {
		return Metadata{}, fmt.Errorf("request MMDS metadata: %w", err)
	}
	defer metadataResponse.Body.Close()
	if metadataResponse.StatusCode != http.StatusOK {
		return Metadata{}, fmt.Errorf("MMDS metadata returned %s", metadataResponse.Status)
	}
	var metadata Metadata
	if err := json.NewDecoder(metadataResponse.Body).Decode(&metadata); err != nil {
		return Metadata{}, fmt.Errorf("decode MMDS metadata: %w", err)
	}
	if metadata.Token == "" {
		return Metadata{}, errors.New("MMDS metadata omitted guest token")
	}
	return metadata, nil
}

func RunMain() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	devMode := os.Getenv("AGENTLOOM_GUESTD_DEV_MODE") == "true"
	metadata, err := LoadMetadata(ctx, nil, devMode, os.Getenv("AGENTLOOM_GUEST_TOKEN"))
	if err != nil {
		return err
	}
	server, err := NewServer(Config{
		ListenAddress: os.Getenv("AGENTLOOM_GUESTD_LISTEN"),
		NodeSocket:    os.Getenv("SANDBOX_LISTEN_SOCKET"),
		NodeEntry:     os.Getenv("AGENTLOOM_NODE_ENTRY"),
		DevMode:       devMode,
	}, metadata)
	if err != nil {
		return err
	}
	return server.Run(ctx)
}
