import type { Readable } from 'node:stream';
import type { RequestInit } from 'undici';

import type { SandboxConfig } from '../../database/schema';
import type { PiConfigInput } from './pi-config-generator.service';

export const SANDBOX_RUNTIME_DRIVER = Symbol('SANDBOX_RUNTIME_DRIVER');

export interface RuntimeStats {
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  diskUsage?: number;
  diskTotal?: number;
}

export interface RuntimeProcess {
  pid: number;
  cpuPercent: number;
  memoryPercent: number;
  state: string;
  elapsed: string;
  executable: string;
  command: string;
}

export interface RuntimeExecCreateOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: string[];
}

export interface RuntimeExecHandle {
  execId: string;
}

export interface RuntimeExecExitInfo {
  running: boolean;
  exitCode: number | null;
  pid: number | null;
}

export interface CreateRuntimePiContext {
  piConfigInput?: PiConfigInput;
  conversationId?: string;
}

export interface DeleteRuntimeOptions {
  removeVolumes?: boolean;
}

export interface SandboxRuntimeDriver {
  createRuntime(
    sessionId: string,
    config: SandboxConfig,
    piContext?: CreateRuntimePiContext,
  ): Promise<{ runtimeHandle: string }>;
  startRuntime(runtimeHandle: string): Promise<void>;
  stopRuntime(runtimeHandle: string): Promise<void>;
  deleteRuntime(
    runtimeHandle: string,
    options?: DeleteRuntimeOptions,
  ): Promise<void>;
  healthCheck(runtimeHandle: string): Promise<boolean>;
  inspectRuntime(runtimeHandle: string): Promise<{ state: string }>;
  requestGuest(
    runtimeHandle: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response>;
  attachLogs(
    runtimeHandle: string,
    callback: (level: string, message: string) => void,
  ): Promise<void>;
  getArchive(runtimeHandle: string, path: string): Promise<Readable>;
  putArchive(
    runtimeHandle: string,
    stream: Readable,
    path: string,
  ): Promise<void>;
  readTextFile(
    runtimeHandle: string,
    path: string,
    maxBytes: number,
  ): Promise<Buffer>;
  validateTextFileWrite(
    runtimeHandle: string,
    path: string,
    maxBytes: number,
  ): Promise<void>;
  writeTextFile(
    runtimeHandle: string,
    path: string,
    content: string,
    maxBytes: number,
  ): Promise<void>;
  createExec(
    runtimeHandle: string,
    options: RuntimeExecCreateOptions,
  ): Promise<RuntimeExecHandle>;
  attachExecOutput(
    execId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void>;
  waitForExecExit(execId: string): Promise<RuntimeExecExitInfo>;
  killExec(execId: string, signal?: string): Promise<void>;
  getRuntimeStats(runtimeHandle: string): Promise<RuntimeStats>;
  listRuntimeProcesses(runtimeHandle: string): Promise<RuntimeProcess[]>;
}
