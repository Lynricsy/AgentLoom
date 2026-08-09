package cutover

import (
	"context"
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
