package runtime

import (
	"context"
	"errors"
	"testing"
	"time"

	firecracker "github.com/firecracker-microvm/firecracker-go-sdk"
	"github.com/sirupsen/logrus"
)

type cancellationMachine struct {
	startContextSeen chan struct{}
	shutdownErr      error
	shutdownDeadline time.Time
}

func (machine *cancellationMachine) Start(ctx context.Context) error {
	close(machine.startContextSeen)
	<-ctx.Done()
	return ctx.Err()
}

func (machine *cancellationMachine) Shutdown(ctx context.Context) error {
	machine.shutdownErr = ctx.Err()
	machine.shutdownDeadline, _ = ctx.Deadline()
	return nil
}

func TestInjectedMachineFactoryPropagatesCancellationAndUsesCleanupContext(t *testing.T) {
	machine := &cancellationMachine{startContextSeen: make(chan struct{})}
	factoryContext := make(chan context.Context, 1)
	launcher := &FirecrackerLauncher{
		logger: logrus.New().WithField("component", "test"),
		machineFactory: func(ctx context.Context, _ firecracker.Config, _ []byte, _ *logrus.Entry) (machineLifecycle, error) {
			factoryContext <- ctx
			return machine, nil
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	created, err := launcher.newMachine(ctx, firecracker.Config{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { result <- startMachine(ctx, created) }()
	<-machine.startContextSeen
	cancel()
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
	if received := <-factoryContext; received != ctx {
		t.Fatal("factory did not receive caller context")
	}
	if machine.shutdownErr != nil {
		t.Fatal("cleanup used the canceled launch context")
	}
	if machine.shutdownDeadline.IsZero() || time.Until(machine.shutdownDeadline) > 5*time.Second {
		t.Fatal("cleanup context is not bounded")
	}
}
