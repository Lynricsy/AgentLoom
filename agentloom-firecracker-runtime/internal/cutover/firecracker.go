package cutover

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

type FirecrackerRuntime struct {
	baseURL string
	client  *http.Client
}

type runtimeResponse struct {
	RuntimeHandle string `json:"runtimeHandle"`
	State         string `json:"state"`
}

func NewFirecrackerRuntime(baseURL, caPath, certPath, keyPath, serverName string) (*FirecrackerRuntime, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return nil, errors.New("APP_FIRECRACKER_RUNTIME_URL must be an https URL")
	}
	ca, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("read runtime CA: %w", err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(ca) {
		return nil, errors.New("runtime CA contains no certificate")
	}
	certificate, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("load runtime client certificate: %w", err)
	}
	transport := &http.Transport{
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: roots, Certificates: []tls.Certificate{certificate}, ServerName: serverName},
		DisableCompression:    true,
		MaxIdleConns:          4,
		IdleConnTimeout:       30 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
	}
	return &FirecrackerRuntime{baseURL: strings.TrimRight(baseURL, "/"), client: &http.Client{Transport: transport}}, nil
}

func (runtime *FirecrackerRuntime) Close() { runtime.client.CloseIdleConnections() }

func (runtime *FirecrackerRuntime) Create(ctx context.Context, migration MigrationRecord) error {
	body, err := json.Marshal(map[string]any{
		"id":            migration.SessionID,
		"cpu":           migration.CPU,
		"memoryMiB":     migration.MemoryMiB,
		"diskGiB":       migration.DiskGiB,
		"lifecycleMode": "persistent",
		"workspaceId":   migration.WorkspaceID,
	})
	if err != nil {
		return err
	}
	response, err := runtime.request(ctx, http.MethodPost, "/v1/vms", bytes.NewReader(body), "application/json")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK {
		return runtimeError(response)
	}
	var result runtimeResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return err
	}
	if result.RuntimeHandle != migration.SessionID {
		return fmt.Errorf("runtime identity mismatch: handle=%s", result.RuntimeHandle)
	}
	switch result.State {
	case "running":
		return nil
	case "stopped":
		return runtime.Start(ctx, migration.SessionID)
	case "failed":
		if err := runtime.Delete(ctx, migration.SessionID, true); err != nil {
			return err
		}
		return runtime.Create(ctx, migration)
	default:
		return fmt.Errorf("runtime state %s is not restorable", result.State)
	}
}

func (runtime *FirecrackerRuntime) Start(ctx context.Context, id string) error {
	return runtime.expectJSON(ctx, http.MethodPost, "/v1/vms/"+url.PathEscape(id)+":start", http.StatusOK)
}

func (runtime *FirecrackerRuntime) Stop(ctx context.Context, id string) error {
	return runtime.expectJSON(ctx, http.MethodPost, "/v1/vms/"+url.PathEscape(id)+":stop", http.StatusOK)
}

func (runtime *FirecrackerRuntime) Delete(ctx context.Context, id string, deleteDisk bool) error {
	response, err := runtime.request(ctx, http.MethodDelete, fmt.Sprintf("/v1/vms/%s?deleteDisk=%t", url.PathEscape(id), deleteDisk), nil, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		return runtimeError(response)
	}
	return nil
}

func (runtime *FirecrackerRuntime) Restore(ctx context.Context, id string, archive io.Reader) error {
	decoder, err := zstd.NewReader(archive)
	if err != nil {
		return fmt.Errorf("open workspace archive: %w", err)
	}
	defer decoder.Close()
	response, err := runtime.request(ctx, http.MethodPut, "/v1/vms/"+url.PathEscape(id)+"/guest/v1/runtime/archive?path=%2Fworkspace", decoder, "application/x-tar")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		return runtimeError(response)
	}
	return nil
}

func (runtime *FirecrackerRuntime) WorkspaceArchive(ctx context.Context, id string) (io.ReadCloser, error) {
	response, err := runtime.request(ctx, http.MethodGet, "/v1/vms/"+url.PathEscape(id)+"/guest/v1/runtime/archive?path=%2Fworkspace", nil, "")
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		defer response.Body.Close()
		return nil, runtimeError(response)
	}
	return response.Body, nil
}

func (runtime *FirecrackerRuntime) Verify(ctx context.Context, migration MigrationRecord) error {
	archive, err := runtime.WorkspaceArchive(ctx, migration.SessionID)
	if err != nil {
		return err
	}
	defer archive.Close()
	return VerifyWorkspaceArchive(archive, migration)
}

func VerifyWorkspaceArchive(archive io.Reader, migration MigrationRecord) error {
	result, err := BuildWorkspaceArchive(archive, io.Discard, io.Discard)
	if err != nil {
		return err
	}
	if result.ManifestSHA256 != migration.ManifestSHA256 ||
		result.FileCount != migration.FileCount ||
		result.TotalBytes != migration.TotalBytes {
		return fmt.Errorf(
			"guest workspace manifest mismatch: digest=%s files=%d bytes=%d",
			result.ManifestSHA256,
			result.FileCount,
			result.TotalBytes,
		)
	}
	return nil
}

func VerifyObject(reader io.Reader, expectedSHA256 string) ([]byte, error) {
	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(content)
	actual := hex.EncodeToString(digest[:])
	if actual != expectedSHA256 {
		return nil, fmt.Errorf("object checksum mismatch: expected=%s actual=%s", expectedSHA256, actual)
	}
	return content, nil
}

func (runtime *FirecrackerRuntime) expectJSON(ctx context.Context, method, path string, status int) error {
	response, err := runtime.request(ctx, method, path, nil, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != status {
		return runtimeError(response)
	}
	return nil
}

func (runtime *FirecrackerRuntime) request(ctx context.Context, method, path string, body io.Reader, contentType string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, method, runtime.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	return runtime.client.Do(request)
}

func runtimeError(response *http.Response) error {
	content, _ := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	return fmt.Errorf("runtime API returned %s: %s", response.Status, strings.TrimSpace(string(content)))
}
