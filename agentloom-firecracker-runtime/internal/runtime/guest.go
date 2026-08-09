package runtime

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type HTTPSGuestChecker struct {
	client *http.Client
	port   int
}

func NewHTTPSGuestChecker(tlsConfig *tls.Config, port int) (*HTTPSGuestChecker, error) {
	if tlsConfig == nil || tlsConfig.RootCAs == nil || tlsConfig.InsecureSkipVerify || tlsConfig.ServerName == "" {
		return nil, errors.New("guest TLS must verify a configured CA and server name")
	}
	if port < 1 || port > 65535 {
		return nil, errors.New("invalid guest HTTPS port")
	}
	transport := &http.Transport{
		Proxy:               nil,
		TLSClientConfig:     tlsConfig.Clone(),
		DialContext:         (&net.Dialer{Timeout: 2 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        64,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     90 * time.Second,
	}
	return &HTTPSGuestChecker{client: &http.Client{Transport: transport}, port: port}, nil
}

func (checker *HTTPSGuestChecker) WaitReady(ctx context.Context, metadata manager.Metadata, token string) error {
	if token == "" {
		return errors.New("guest bearer token is required")
	}
	endpoint := "https://" + net.JoinHostPort(metadata.GuestIP, strconv.Itoa(checker.port)) + "/health"
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	var lastError error
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return err
		}
		request.Header.Set("Authorization", "Bearer "+token)
		response, err := checker.client.Do(request)
		if err == nil {
			body, readErr := io.ReadAll(io.LimitReader(response.Body, 4097))
			response.Body.Close()
			if readErr == nil && response.StatusCode == http.StatusOK && len(body) <= 4096 {
				return nil
			}
			lastError = fmt.Errorf("guest health returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
		} else {
			lastError = err
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("guest readiness failed: %w: %v", ctx.Err(), lastError)
		case <-ticker.C:
		}
	}
}

func (checker *HTTPSGuestChecker) Client() *http.Client {
	return checker.client
}
