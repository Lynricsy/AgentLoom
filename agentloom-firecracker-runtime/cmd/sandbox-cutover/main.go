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
	if len(os.Args) != 2 || os.Args[1] != "export" {
		return errors.New("usage: sandbox-cutover export")
	}
	if os.Getenv("APP_SANDBOX_MAINTENANCE_MODE") != "true" {
		return errors.New("APP_SANDBOX_MAINTENANCE_MODE=true is required for cutover export")
	}

	databaseURL := firstNonEmpty(os.Getenv("APP_DATABASE_URL"), os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return errors.New("APP_DATABASE_URL is required")
	}
	minioEndpoint := strings.TrimSpace(os.Getenv("APP_MINIO_ENDPOINT"))
	if minioEndpoint == "" {
		return errors.New("APP_MINIO_ENDPOINT is required")
	}
	if _, _, err := net.SplitHostPort(minioEndpoint); err != nil {
		port := firstNonEmpty(os.Getenv("APP_MINIO_PORT"), "9000")
		minioEndpoint = net.JoinHostPort(minioEndpoint, port)
	}
	secure, err := strconv.ParseBool(firstNonEmpty(os.Getenv("APP_MINIO_USE_SSL"), "false"))
	if err != nil {
		return fmt.Errorf("parse APP_MINIO_USE_SSL: %w", err)
	}
	bucket := firstNonEmpty(os.Getenv("APP_MINIO_BUCKET"), "agentloom-documents")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	repository, err := cutover.NewPostgresRepository(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("connect postgres: %w", err)
	}
	defer repository.Close()

	runtime, err := cutover.NewDockerRuntime()
	if err != nil {
		return fmt.Errorf("connect docker: %w", err)
	}
	defer runtime.Close()

	store, err := cutover.NewMinIOStore(
		minioEndpoint,
		os.Getenv("APP_MINIO_ACCESS_KEY"),
		os.Getenv("APP_MINIO_SECRET_KEY"),
		bucket,
		secure,
	)
	if err != nil {
		return fmt.Errorf("connect minio: %w", err)
	}

	exporter := cutover.Exporter{
		Runtime:     runtime,
		Store:       store,
		Repository:  repository,
		StopTimeout: 10 * time.Second,
	}
	if err := exporter.ExportAll(ctx); err != nil {
		return err
	}
	log.Print("sandbox workspace export completed")
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
