package main

import (
	"log"
	"os"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/guest"
)

func main() {
	if err := guest.RunMain(); err != nil {
		log.Printf("agentloom-guestd failed: %v", err)
		os.Exit(1)
	}
}
