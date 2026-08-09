package cutover

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const legacyDockerAPIVersion = "v1.41"

type DockerRuntime struct {
	client *http.Client
}

func NewDockerRuntime() (*DockerRuntime, error) {
	dockerHost := strings.TrimSpace(os.Getenv("DOCKER_HOST"))
	if dockerHost == "" {
		dockerHost = "unix:///var/run/docker.sock"
	}
	parsed, err := url.Parse(dockerHost)
	if err != nil {
		return nil, fmt.Errorf("parse DOCKER_HOST: %w", err)
	}
	if parsed.Scheme != "unix" || parsed.Path == "" {
		return nil, fmt.Errorf("sandbox cutover only supports a local unix DOCKER_HOST")
	}

	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, "unix", parsed.Path)
		},
		DisableCompression: true,
	}
	return &DockerRuntime{
		client: &http.Client{Transport: transport},
	}, nil
}

func (runtime *DockerRuntime) Close() error {
	runtime.client.CloseIdleConnections()
	return nil
}

func (runtime *DockerRuntime) Stop(ctx context.Context, containerID string, timeout time.Duration) error {
	seconds := int(timeout.Round(time.Second) / time.Second)
	endpoint := fmt.Sprintf(
		"http://docker/%s/containers/%s/stop?t=%s",
		legacyDockerAPIVersion,
		url.PathEscape(containerID),
		strconv.Itoa(seconds),
	)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return err
	}
	response, err := runtime.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusNotModified {
		return nil
	}
	return dockerAPIError(response)
}
func (runtime *DockerRuntime) Start(ctx context.Context, containerID string) error {
	response, err := runtime.do(ctx, http.MethodPost, fmt.Sprintf(
		"http://docker/%s/containers/%s/start",
		legacyDockerAPIVersion,
		url.PathEscape(containerID),
	), nil, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusNotModified {
		return nil
	}
	return dockerAPIError(response)
}

func (runtime *DockerRuntime) PutWorkspaceArchive(
	ctx context.Context,
	containerID string,
	archive io.Reader,
) error {
	response, err := runtime.do(ctx, http.MethodPut, fmt.Sprintf(
		"http://docker/%s/containers/%s/archive?path=%s",
		legacyDockerAPIVersion,
		url.PathEscape(containerID),
		url.QueryEscape("/"),
	), archive, "application/x-tar")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dockerAPIError(response)
	}
	return nil
}

func (runtime *DockerRuntime) ClearWorkspace(ctx context.Context, containerID string) error {
	payload := strings.NewReader(`{"AttachStdout":true,"AttachStderr":true,"Cmd":["/bin/sh","-c","find /workspace -mindepth 1 -delete"]}`)
	response, err := runtime.do(ctx, http.MethodPost, fmt.Sprintf(
		"http://docker/%s/containers/%s/exec",
		legacyDockerAPIVersion,
		url.PathEscape(containerID),
	), payload, "application/json")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		return dockerAPIError(response)
	}
	var created struct {
		ID string `json:"Id"`
	}
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		return err
	}
	startPayload := strings.NewReader(`{"Detach":false,"Tty":false}`)
	start, err := runtime.do(ctx, http.MethodPost, fmt.Sprintf(
		"http://docker/%s/exec/%s/start",
		legacyDockerAPIVersion,
		url.PathEscape(created.ID),
	), startPayload, "application/json")
	if err != nil {
		return err
	}
	defer start.Body.Close()
	if start.StatusCode != http.StatusOK {
		return dockerAPIError(start)
	}
	if _, err := io.Copy(io.Discard, start.Body); err != nil {
		return err
	}
	inspect, err := runtime.do(ctx, http.MethodGet, fmt.Sprintf(
		"http://docker/%s/exec/%s/json",
		legacyDockerAPIVersion,
		url.PathEscape(created.ID),
	), nil, "")
	if err != nil {
		return err
	}
	defer inspect.Body.Close()
	if inspect.StatusCode != http.StatusOK {
		return dockerAPIError(inspect)
	}
	var result struct {
		Running  bool `json:"Running"`
		ExitCode int  `json:"ExitCode"`
	}
	if err := json.NewDecoder(inspect.Body).Decode(&result); err != nil {
		return err
	}
	if result.Running || result.ExitCode != 0 {
		return fmt.Errorf("legacy workspace cleanup failed: running=%t exitCode=%d", result.Running, result.ExitCode)
	}
	return nil
}

func (runtime *DockerRuntime) DeleteContainer(ctx context.Context, containerID string) error {
	response, err := runtime.do(ctx, http.MethodDelete, fmt.Sprintf(
		"http://docker/%s/containers/%s?v=1&force=0",
		legacyDockerAPIVersion,
		url.PathEscape(containerID),
	), nil, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusNotFound {
		return nil
	}
	return dockerAPIError(response)
}

func (runtime *DockerRuntime) DeleteVolume(ctx context.Context, volumeName string) error {
	response, err := runtime.do(ctx, http.MethodDelete, fmt.Sprintf(
		"http://docker/%s/volumes/%s",
		legacyDockerAPIVersion,
		url.PathEscape(volumeName),
	), nil, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusNotFound {
		return nil
	}
	return dockerAPIError(response)
}

func (runtime *DockerRuntime) do(
	ctx context.Context,
	method string,
	endpoint string,
	body io.Reader,
	contentType string,
) (*http.Response, error) {
	var requestBody io.Reader
	if body != nil {
		requestBody = io.NopCloser(struct{ io.Reader }{body})
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, requestBody)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	return runtime.client.Do(request)
}

func (runtime *DockerRuntime) WorkspaceArchive(ctx context.Context, containerID string) (io.ReadCloser, error) {
	endpoint := fmt.Sprintf(
		"http://docker/%s/containers/%s/archive?path=%s",
		legacyDockerAPIVersion,
		url.PathEscape(containerID),
		url.QueryEscape("/workspace"),
	)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	response, err := runtime.client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		defer response.Body.Close()
		return nil, dockerAPIError(response)
	}
	return response.Body, nil
}

func dockerAPIError(response *http.Response) error {
	message, readErr := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if readErr != nil {
		return fmt.Errorf("docker API returned %s (read error: %v)", response.Status, readErr)
	}
	return fmt.Errorf("docker API returned %s: %s", response.Status, strings.TrimSpace(string(message)))
}
