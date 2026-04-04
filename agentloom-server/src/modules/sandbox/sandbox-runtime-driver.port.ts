import type { Readable } from 'node:stream';

import type { SandboxConfig } from '../../database/schema';
import type { PiConfigInput } from './pi-config-generator.service';

export const SANDBOX_RUNTIME_DRIVER = Symbol('SANDBOX_RUNTIME_DRIVER');

export interface ContainerStats {
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  diskUsage?: number;
  diskTotal?: number;
}

export interface DockerExecCreateOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: string[];
}

export interface DockerExecHandle {
  execId: string;
}

export interface DockerExecExitInfo {
  running: boolean;
  exitCode: number | null;
  pid: number | null;
}

export interface CreateContainerPiContext {
  piConfigInput?: PiConfigInput;
  conversationId?: string;
}

export interface SandboxRuntimeDriver {
  createContainer(
    sessionId: string,
    config: SandboxConfig,
    piContext?: CreateContainerPiContext,
  ): Promise<{ containerId: string }>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  healthCheck(containerId: string): Promise<boolean>;
  getPromptUrl(containerId: string): Promise<string>;
  getSessionUrl(containerId: string): Promise<string>;
  attachLogs(
    containerId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void>;
  getArchive(containerId: string, path: string): Promise<Readable>;
  putArchive(
    containerId: string,
    stream: Readable,
    path: string,
  ): Promise<void>;
  getWorkspaceHostPath(containerId: string): Promise<string>;
  createExec(
    containerId: string,
    options: DockerExecCreateOptions,
  ): Promise<DockerExecHandle>;
  attachExecOutput(
    execId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void>;
  waitForExecExit(execId: string): Promise<DockerExecExitInfo>;
  killExec(execId: string, signal?: string): Promise<void>;
  getContainerStats(containerId: string): Promise<ContainerStats>;
}
