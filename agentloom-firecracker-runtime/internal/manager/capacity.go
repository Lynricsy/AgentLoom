package manager

import (
	"fmt"
	"math"
	"sync"
)

type CapacityConfig struct {
	MaxVMs    int
	VCPU      float64
	MemoryMiB int64
	DiskGiB   int64
}

type CapacitySnapshot struct {
	VMsUsed        int     `json:"vmsUsed"`
	VMsLimit       int     `json:"vmsLimit"`
	VCPUUsed       float64 `json:"vcpuUsed"`
	VCPULimit      float64 `json:"vcpuLimit"`
	MemoryMiBUsed  int64   `json:"memoryMiBUsed"`
	MemoryMiBLimit int64   `json:"memoryMiBLimit"`
	DiskGiBUsed    int64   `json:"diskGiBUsed"`
	DiskGiBLimit   int64   `json:"diskGiBLimit"`
}

type reservation struct {
	resources Resources
	active    bool
}

type Capacity struct {
	mutex    sync.Mutex
	config   CapacityConfig
	reserved map[string]reservation
}

func NewCapacity(config CapacityConfig) (*Capacity, error) {
	if config.MaxVMs < 1 || config.VCPU <= 0 || config.MemoryMiB < 256 || config.DiskGiB < 1 {
		return nil, fmt.Errorf("invalid capacity configuration")
	}
	return &Capacity{config: config, reserved: make(map[string]reservation)}, nil
}

func (capacity *Capacity) Reserve(id string, resources Resources, active bool) error {
	capacity.mutex.Lock()
	defer capacity.mutex.Unlock()
	existing, exists := capacity.reserved[id]
	if exists && existing.resources != resources {
		return ErrConflict
	}
	if exists && existing.active == active {
		return nil
	}

	snapshot := capacity.snapshotLocked()
	if !exists && snapshot.DiskGiBUsed+resources.DiskGiB > capacity.config.DiskGiB {
		return ErrCapacity
	}
	if active && (!exists || !existing.active) {
		if snapshot.VMsUsed+1 > capacity.config.MaxVMs ||
			snapshot.VCPUUsed+resources.CPU > capacity.config.VCPU+1e-9 ||
			snapshot.MemoryMiBUsed+resources.MemoryMiB > capacity.config.MemoryMiB {
			return ErrCapacity
		}
	}
	capacity.reserved[id] = reservation{resources: resources, active: active}
	return nil
}

func (capacity *Capacity) Deactivate(id string) {
	capacity.mutex.Lock()
	defer capacity.mutex.Unlock()
	value, ok := capacity.reserved[id]
	if !ok {
		return
	}
	value.active = false
	capacity.reserved[id] = value
}

func (capacity *Capacity) Delete(id string) {
	capacity.mutex.Lock()
	defer capacity.mutex.Unlock()
	delete(capacity.reserved, id)
}

func (capacity *Capacity) Snapshot() CapacitySnapshot {
	capacity.mutex.Lock()
	defer capacity.mutex.Unlock()
	return capacity.snapshotLocked()
}

func (capacity *Capacity) snapshotLocked() CapacitySnapshot {
	snapshot := CapacitySnapshot{
		VMsLimit:       capacity.config.MaxVMs,
		VCPULimit:      capacity.config.VCPU,
		MemoryMiBLimit: capacity.config.MemoryMiB,
		DiskGiBLimit:   capacity.config.DiskGiB,
	}
	for _, value := range capacity.reserved {
		snapshot.DiskGiBUsed += value.resources.DiskGiB
		if !value.active {
			continue
		}
		snapshot.VMsUsed++
		snapshot.VCPUUsed += value.resources.CPU
		snapshot.MemoryMiBUsed += value.resources.MemoryMiB
	}
	snapshot.VCPUUsed = math.Round(snapshot.VCPUUsed*1000) / 1000
	return snapshot
}
