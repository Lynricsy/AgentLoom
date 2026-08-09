package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/cutover"
)

func main() {
	if err := run(); err != nil {
		log.Printf("sandbox cutover failed: %v", err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) != 2 {
		return errors.New("usage: sandbox-cutover <export|restore|activate|rollback|finalize>")
	}
	command := os.Args[1]
	if command != "export" && command != "restore" && command != "activate" && command != "rollback" && command != "finalize" {
		return errors.New("usage: sandbox-cutover <export|restore|activate|rollback|finalize>")
	}
	if os.Getenv("APP_SANDBOX_MAINTENANCE_MODE") != "true" {
		return errors.New("APP_SANDBOX_MAINTENANCE_MODE=true is required for sandbox cutover")
	}
	required := []string{"APP_REDIS_URL"}
	if command != "activate" {
		required = append(required, "APP_MINIO_ENDPOINT", "APP_MINIO_ACCESS_KEY", "APP_MINIO_SECRET_KEY")
	}
	if command == "restore" || command == "rollback" || command == "finalize" {
		required = append(required, "APP_FIRECRACKER_RUNTIME_URL")
	}
	if err := requireEnvironment(required...); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	repository, err := openRepository(ctx)
	if err != nil {
		return err
	}
	defer repository.Close()
	if err := repository.AssertDrained(ctx); err != nil {
		return err
	}

	queue, err := cutover.NewQueueCleaner(
		requiredEnv("APP_REDIS_URL"),
		os.Getenv("APP_SANDBOX_LIFECYCLE_QUEUE_PREFIX"),
		os.Getenv("APP_AGENT_CONVERSATION_EXECUTION_QUEUE_PREFIX"),
	)
	if err != nil {
		return fmt.Errorf("connect Redis: %w", err)
	}
	defer queue.Close()
	if err := queue.AssertDrained(ctx); err != nil {
		return err
	}

	var store *cutover.MinIOStore
	if command != "activate" {
		store, err = openStore()
		if err != nil {
			return err
		}
	}

	switch command {
	case "export":
		if err := queue.PrepareForExport(ctx); err != nil {
			return fmt.Errorf("pause and clear sandbox lifecycle queue: %w", err)
		}
		legacy, err := cutover.NewDockerRuntime()
		if err != nil {
			return fmt.Errorf("connect Docker migration bridge: %w", err)
		}
		defer legacy.Close()
		exporter := cutover.Exporter{Runtime: legacy, Store: store, Repository: repository, StopTimeout: 10 * time.Second}
		if err := exporter.ExportAll(ctx); err != nil {
			return err
		}
	case "activate":
		migrations, err := repository.ListMigrations(ctx, cutover.StatusVerified)
		if err != nil {
			return err
		}
		if len(migrations) == 0 {
			return errors.New("cannot activate cutover without verified migrations")
		}
		if err := repository.ActivateCutover(ctx); err != nil {
			return err
		}
		if err := queue.Clear(ctx); err != nil {
			return fmt.Errorf("clear legacy lifecycle queue: %w", err)
		}
	case "restore", "rollback", "finalize":
		runtime, err := openRuntime()
		if err != nil {
			return err
		}
		defer runtime.Close()
		orchestrator := cutover.Orchestrator{Repository: repository, Store: store, Runtime: runtime}
		if command == "restore" {
			if err := orchestrator.RestoreAll(ctx); err != nil {
				return err
			}
			break
		}
		legacy, err := cutover.NewDockerRuntime()
		if err != nil {
			return fmt.Errorf("connect Docker migration bridge: %w", err)
		}
		defer legacy.Close()
		orchestrator.Legacy = legacy
		if command == "rollback" {
			if err := orchestrator.RollbackAll(ctx); err != nil {
				return err
			}
			break
		}
		hours, err := strconv.ParseInt(firstNonEmpty(os.Getenv("APP_SANDBOX_ROLLBACK_HOURS"), "168"), 10, 32)
		if err != nil || hours < 0 {
			return errors.New("APP_SANDBOX_ROLLBACK_HOURS must be a non-negative integer")
		}
		if err := orchestrator.FinalizeAll(ctx, time.Duration(hours)*time.Hour); err != nil {
			return err
		}
	}
	log.Printf("sandbox cutover command %s completed", command)
	return nil
}

func openRepository(ctx context.Context) (*cutover.PostgresRepository, error) {
	databaseURL := firstNonEmpty(os.Getenv("APP_DATABASE_URL"), os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return nil, errors.New("APP_DATABASE_URL is required")
	}
	repository, err := cutover.NewPostgresRepository(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect Postgres: %w", err)
	}
	return repository, nil
}

func openStore() (*cutover.MinIOStore, error) {
	endpoint := strings.TrimSpace(requiredEnv("APP_MINIO_ENDPOINT"))
	if _, _, err := net.SplitHostPort(endpoint); err != nil {
		endpoint = net.JoinHostPort(endpoint, firstNonEmpty(os.Getenv("APP_MINIO_PORT"), "9000"))
	}
	secure, err := strconv.ParseBool(firstNonEmpty(os.Getenv("APP_MINIO_USE_SSL"), "false"))
	if err != nil {
		return nil, fmt.Errorf("parse APP_MINIO_USE_SSL: %w", err)
	}
	store, err := cutover.NewMinIOStore(
		endpoint,
		requiredEnv("APP_MINIO_ACCESS_KEY"),
		requiredEnv("APP_MINIO_SECRET_KEY"),
		firstNonEmpty(os.Getenv("APP_MINIO_BUCKET"), "agentloom-documents"),
		secure,
	)
	if err != nil {
		return nil, fmt.Errorf("connect MinIO: %w", err)
	}
	return store, nil
}

func openRuntime() (*cutover.FirecrackerRuntime, error) {
	runtime, err := cutover.NewFirecrackerRuntime(
		requiredEnv("APP_FIRECRACKER_RUNTIME_URL"),
		firstNonEmpty(os.Getenv("APP_FIRECRACKER_RUNTIME_CA"), "/run/secrets/firecracker-client/ca.crt"),
		firstNonEmpty(os.Getenv("APP_FIRECRACKER_RUNTIME_CERT"), "/run/secrets/firecracker-client/tls.crt"),
		firstNonEmpty(os.Getenv("APP_FIRECRACKER_RUNTIME_KEY"), "/run/secrets/firecracker-client/tls.key"),
		firstNonEmpty(os.Getenv("APP_FIRECRACKER_RUNTIME_SERVER_NAME"), "firecracker-runtime"),
	)
	if err != nil {
		return nil, fmt.Errorf("connect Firecracker runtime: %w", err)
	}
	return runtime, nil
}

func requiredEnv(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

func requireEnvironment(names ...string) error {
	for _, name := range names {
		if requiredEnv(name) == "" {
			return fmt.Errorf("%s is required", name)
		}
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
