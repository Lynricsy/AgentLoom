package runtime

import (
	"context"
	"encoding/json"
	"errors"

	firecracker "github.com/firecracker-microvm/firecracker-go-sdk"
	"github.com/sirupsen/logrus"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type MMDSTokenRecoverer struct {
	logger *logrus.Entry
}

func NewMMDSTokenRecoverer() *MMDSTokenRecoverer {
	return &MMDSTokenRecoverer{logger: logrus.New().WithField("component", "mmds-token-recovery")}
}

func (recoverer *MMDSTokenRecoverer) Recover(ctx context.Context, metadata manager.Metadata) (string, error) {
	if metadata.APISocketPath == "" {
		return "", errors.New("Firecracker API socket path is missing")
	}
	response, err := firecracker.NewClient(metadata.APISocketPath, recoverer.logger, false).GetMmds(ctx)
	if err != nil {
		return "", err
	}
	content, err := json.Marshal(response.Payload)
	if err != nil {
		return "", err
	}
	var document struct {
		AgentLoom struct {
			Token string `json:"token"`
		} `json:"agentloom"`
	}
	if err := json.Unmarshal(content, &document); err != nil {
		return "", err
	}
	if len(document.AgentLoom.Token) != 64 {
		return "", errors.New("MMDS guest token is missing or invalid")
	}
	return document.AgentLoom.Token, nil
}
