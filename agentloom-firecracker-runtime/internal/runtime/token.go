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
		Latest struct {
			Metadata struct {
				AgentLoom string `json:"agentloom"`
			} `json:"meta-data"`
		} `json:"latest"`
	}
	if err := json.Unmarshal(content, &document); err != nil {
		return "", err
	}
	var payload struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal([]byte(document.Latest.Metadata.AgentLoom), &payload); err != nil {
		return "", err
	}
	if len(payload.Token) != 64 {
		return "", errors.New("MMDS guest token is missing or invalid")
	}
	return payload.Token, nil
}
