package main

import (
	"flag"
	"log"
	"time"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/artifact"
)

func main() {
	root := flag.String("root", "", "artifact root")
	lockPath := flag.String("lock", "", "artifact source lock")
	output := flag.String("output", "", "manifest output path")
	guestdVersion := flag.String("guestd-version", "dev", "guestd version")
	flag.Parse()
	if *root == "" || *lockPath == "" || *output == "" {
		log.Fatal("-root, -lock and -output are required")
	}
	manifest, err := artifact.Build(*root, *lockPath, *guestdVersion, time.Now())
	if err != nil {
		log.Fatal(err)
	}
	if err := artifact.WriteAtomic(*output, manifest); err != nil {
		log.Fatal(err)
	}
}
