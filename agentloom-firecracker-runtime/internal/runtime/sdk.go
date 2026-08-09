package runtime

import (
	"context"

	firecracker "github.com/firecracker-microvm/firecracker-go-sdk"
)

const FirecrackerSDKCommit = "6fb280e993d4516ee6d5d20238572fe8752bc7ca"

type Machine = firecracker.Machine
type MachineConfig = firecracker.Config
type MachineOption = firecracker.Opt

func NewMachine(
	ctx context.Context,
	config MachineConfig,
	options ...MachineOption,
) (*Machine, error) {
	return firecracker.NewMachine(ctx, config, options...)
}
