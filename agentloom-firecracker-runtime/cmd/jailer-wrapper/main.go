package main

import (
	"log"
	"os"
	"path/filepath"
	"syscall"
)

func main() {
	arguments := os.Args[1:]
	var executable string
	for index := 0; index+1 < len(arguments); index++ {
		if arguments[index] == "--exec-file" {
			executable = arguments[index+1]
			break
		}
	}
	if executable == "" {
		log.Fatal("jailer wrapper requires --exec-file")
	}
	jailer := filepath.Join(filepath.Dir(executable), "jailer")
	wrappedArguments := append([]string{"jailer", "--new-pid-ns"}, arguments...)
	if err := syscall.Exec(jailer, wrappedArguments, os.Environ()); err != nil {
		log.Fatalf("exec jailer: %v", err)
	}
}
