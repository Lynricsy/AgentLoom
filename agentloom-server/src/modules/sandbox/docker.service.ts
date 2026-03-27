import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';

import type { SandboxConfig } from '../../database/schema';
import type { PiConfigInput } from './pi-config-generator.service';
import { PiConfigGeneratorService } from './pi-config-generator.service';
import {
  SandboxCreationException,
  SandboxDestroyException,
} from './sandbox.exceptions';

export interface ContainerStats {
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
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

/** 创建容器时可选的 pi-coding-agent 配置上下文 */
export interface CreateContainerPiContext {
  /** pi-config 生成所需的输入 */
  piConfigInput?: PiConfigInput;
  /** Agent 对话 ID，用于构建 PERMISSION_CALLBACK_URL */
  conversationId?: string;
}

interface FakeExecRecord {
  readonly child: ReturnType<typeof spawn>;
  readonly outputs: Array<{ level: string; message: string }>;
  callback?: (level: string, message: string) => void;
  exitInfo: DockerExecExitInfo;
}

const SANDBOX_IMAGE = 'agentloom/sandbox:latest';
const SANDBOX_AGENT_PORT = '8080/tcp';
const STOP_TIMEOUT_SECONDS = 10;
const MB_TO_BYTES = 1024 * 1024;
const CPU_CORE_TO_NANO = 1e9;
const HEALTHCHECK_INTERVAL_NS = 30 * 1_000_000_000;
const HEALTHCHECK_START_PERIOD_NS = 5 * 1_000_000_000;
const HEALTHCHECK_TIMEOUT_NS = 5 * 1_000_000_000;
const HEALTHCHECK_RETRIES = 3;
const DOCKER_STREAM_HEADER_SIZE = 8;
const EXEC_INSPECT_POLL_INTERVAL_MS = 50;

@Injectable()
export class DockerService {
  private readonly docker: Docker;
  private readonly execStreams = new Map<string, NodeJS.ReadableStream>();
  private readonly fakeExecs = new Map<string, FakeExecRecord>();
  private readonly useFakeExecRuntime: boolean;
  private readonly logger = new Logger(DockerService.name);

  constructor(private readonly piConfigGenerator: PiConfigGeneratorService) {
    this.docker = new Docker();
    this.useFakeExecRuntime = process.env.ACP_TEST_FAKE_RUNTIME === '1';
  }

  async createContainer(
    sessionId: string,
    config: SandboxConfig,
    piContext?: CreateContainerPiContext,
  ): Promise<{ containerId: string }> {
    let configTmpDir: string | undefined;

    try {
      const containerEnv: string[] = [];
      const extraBinds: string[] = [];
      const extraHosts: string[] = [];

      if (!this.useFakeExecRuntime && piContext?.piConfigInput) {
        const bundle = this.piConfigGenerator.generateConfigBundle(
          piContext.piConfigInput,
        );

        configTmpDir = fs.mkdtempSync(
          path.join(os.tmpdir(), `sandbox-pi-config-${sessionId}-`),
        );
        fs.writeFileSync(
          path.join(configTmpDir, 'settings.json'),
          bundle.settings,
        );
        fs.writeFileSync(path.join(configTmpDir, 'models.json'), bundle.models);
        fs.writeFileSync(
          path.join(configTmpDir, 'system-prompt.md'),
          bundle.systemPrompt,
        );

        // Write skill directories for pi-mono loadSkills() discovery
        for (const [skillName, skillFiles] of Object.entries(bundle.skills)) {
          const skillDir = path.join(configTmpDir, 'skills', skillName);
          fs.mkdirSync(skillDir, { recursive: true });
          for (const [filename, content] of Object.entries(skillFiles)) {
            fs.writeFileSync(path.join(skillDir, filename), content);
          }
        }

        extraBinds.push(`${configTmpDir}:/config:ro`);
        containerEnv.push('PI_CODING_AGENT_DIR=/config');

        const llmKeyMap: Record<string, string> = {
          ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
          OPENAI_API_KEY: 'OPENAI_API_KEY',
          GOOGLE_API_KEY: 'GOOGLE_API_KEY',
          AZURE_OPENAI_API_KEY: 'AZURE_OPENAI_API_KEY',
          XAI_API_KEY: 'XAI_API_KEY',
          GROQ_API_KEY: 'GROQ_API_KEY',
          OPENROUTER_API_KEY: 'OPENROUTER_API_KEY',
          AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
          AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
          AWS_REGION: 'AWS_REGION',
        };

        for (const [envKey, containerKey] of Object.entries(llmKeyMap)) {
          const val = process.env[envKey];
          if (val) {
            containerEnv.push(`${containerKey}=${val}`);
          }
        }

        const appPort = process.env.APP_PORT ?? '3000';
        if (piContext.conversationId) {
          containerEnv.push(
            `PERMISSION_CALLBACK_URL=http://host.docker.internal:${appPort}/api/v1/agent-conversations/${piContext.conversationId}/tool-permission`,
          );
        }

        extraHosts.push('host.docker.internal:host-gateway');
      }

      const container = await this.docker.createContainer({
        Image: SANDBOX_IMAGE,
        ExposedPorts: { [SANDBOX_AGENT_PORT]: {} },
        Healthcheck: {
          Test: ['CMD-SHELL', 'test -d /workspace || exit 1'],
          Interval: HEALTHCHECK_INTERVAL_NS,
          StartPeriod: HEALTHCHECK_START_PERIOD_NS,
          Timeout: HEALTHCHECK_TIMEOUT_NS,
          Retries: HEALTHCHECK_RETRIES,
        },
        ...(containerEnv.length > 0 ? { Env: containerEnv } : {}),
        name: `sandbox-${sessionId}`,
        Labels: { 'agentloom.session': sessionId },
        HostConfig: {
          PortBindings: {
            [SANDBOX_AGENT_PORT]: [{ HostPort: '0' }],
          },
          NanoCpus: config.cpu * CPU_CORE_TO_NANO,
          Memory: config.memory * MB_TO_BYTES,
          StorageOpt: { size: `${config.disk}G` },
          Binds: [`sandbox-${sessionId}-workspace:/workspace`, ...extraBinds],
          ...(extraHosts.length > 0 ? { ExtraHosts: extraHosts } : {}),
        },
      });

      await container.start();

      return { containerId: container.id };
    } catch (error) {
      this.logger.error(
        `Failed to create container for session ${sessionId}`,
        error instanceof Error ? error.stack : error,
      );
      throw new SandboxCreationException(
        `Container creation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async createExec(
    containerId: string,
    options: DockerExecCreateOptions,
  ): Promise<DockerExecHandle> {
    if (this.useFakeExecRuntime) {
      return this.createFakeExec(options);
    }

    try {
      const container = this.docker.getContainer(containerId);
      const exec = await container.exec({
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Cmd: [options.command, ...(options.args ?? [])],
        Tty: false,
        ...(options.cwd ? { WorkingDir: options.cwd } : {}),
        ...(options.env?.length ? { Env: options.env } : {}),
      });

      const stream = await exec.start({
        Detach: false,
        Tty: false,
      });

      this.trackExecStream(exec.id, stream);

      return { execId: exec.id };
    } catch (error) {
      this.logger.error(
        `Failed to create exec for container ${containerId}`,
        error instanceof Error ? error.stack : error,
      );
      throw new SandboxCreationException(
        `Sandbox exec creation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async attachExecOutput(
    execId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void> {
    if (this.useFakeExecRuntime) {
      const fakeExec = this.fakeExecs.get(execId);

      if (!fakeExec) {
        throw new SandboxCreationException(
          `Sandbox exec stream is unavailable for exec ${execId}`,
        );
      }

      fakeExec.callback = callback;
      for (const output of fakeExec.outputs) {
        callback(output.level, output.message);
      }
      return;
    }

    const stream = this.execStreams.get(execId);

    if (!stream) {
      throw new SandboxCreationException(
        `Sandbox exec stream is unavailable for exec ${execId}`,
      );
    }

    this.attachMultiplexedStream(stream, callback, `exec ${execId}`);
  }

  async waitForExecExit(execId: string): Promise<DockerExecExitInfo> {
    if (this.useFakeExecRuntime) {
      return this.waitForFakeExecExit(execId);
    }

    const exec = this.docker.getExec(execId);

    while (true) {
      const info = await exec.inspect();

      if (!info.Running) {
        return {
          running: false,
          exitCode: info.ExitCode,
          pid: info.Pid ?? null,
        };
      }

      await this.delay(EXEC_INSPECT_POLL_INTERVAL_MS);
    }
  }

  async killExec(execId: string, signal = 'TERM'): Promise<void> {
    if (this.useFakeExecRuntime) {
      await this.killFakeExec(execId, signal);
      return;
    }

    const exec = this.docker.getExec(execId);
    const info = await exec.inspect();

    if (!info.Running || info.Pid <= 0) {
      return;
    }

    const container = this.docker.getContainer(info.ContainerID);
    const killExec = await container.exec({
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['kill', `-${this.normalizeSignal(signal)}`, String(info.Pid)],
      Tty: false,
    });

    await killExec.start({
      Detach: false,
      Tty: false,
    });
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: STOP_TIMEOUT_SECONDS });
    } catch (error) {
      if (this.isContainerNotRunningError(error)) {
        this.logger.warn(`Container ${containerId} already stopped`);
        return;
      }
      throw error;
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ v: true, force: true });
    } catch (error) {
      if (this.isContainerNotFoundError(error)) {
        this.logger.warn(`Container ${containerId} not found, skipping remove`);
        return;
      }
      this.logger.error(
        `Failed to remove container ${containerId}`,
        error instanceof Error ? error.stack : error,
      );
      throw new SandboxDestroyException(
        `Container removal failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async attachLogs(
    containerId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
    });

    this.attachMultiplexedStream(stream, callback, `container ${containerId}`);
  }

  async getArchive(containerId: string, path: string): Promise<Readable> {
    const container = this.docker.getContainer(containerId);
    const stream = await container.getArchive({ path });
    return stream as unknown as Readable;
  }

  async putArchive(
    containerId: string,
    stream: Readable,
    path: string,
  ): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.putArchive(stream, { path });
  }

  async getWorkspaceHostPath(containerId: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const workspaceMount = info.Mounts?.find(
      (mount) => mount.Destination === '/workspace',
    );

    if (!workspaceMount?.Source) {
      throw new SandboxCreationException(
        `Sandbox workspace mount is unavailable for container ${containerId}`,
      );
    }

    return workspaceMount.Source;
  }

  async getContainerStats(containerId: string): Promise<ContainerStats> {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const numCpus = stats.cpu_stats.online_cpus ?? 1;
    const cpuPercent =
      systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsageMb: Math.round(stats.memory_stats.usage / MB_TO_BYTES),
      memoryLimitMb: Math.round(stats.memory_stats.limit / MB_TO_BYTES),
    };
  }

  private trackExecStream(execId: string, stream: NodeJS.ReadableStream): void {
    this.execStreams.set(execId, stream);

    stream.on('close', () => {
      this.execStreams.delete(execId);
    });

    stream.on('end', () => {
      this.execStreams.delete(execId);
    });

    stream.on('error', (error: Error) => {
      this.execStreams.delete(execId);
      this.logger.error(`Exec stream error for ${execId}`, error.stack);
    });
  }

  private attachMultiplexedStream(
    stream: NodeJS.ReadableStream,
    callback: (level: string, message: string) => void,
    streamLabel: string,
  ): void {
    let buffer = Buffer.alloc(0);

    // Docker 多路复用流格式：
    //   字节 0:   流类型 (1=stdout, 2=stderr)
    //   字节 1-3: 填充 (0x00)
    //   字节 4-7: 载荷长度 (big-endian uint32)
    //   字节 8+:  载荷数据
    // TCP 分片可能将一个帧拆分到多个 chunk，或一个 chunk 包含多个帧
    stream.on('data', (chunk: Buffer | string) => {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, chunkBuffer]);

      while (buffer.length >= DOCKER_STREAM_HEADER_SIZE) {
        const payloadSize = buffer.readUInt32BE(4);
        const frameSize = DOCKER_STREAM_HEADER_SIZE + payloadSize;

        if (buffer.length < frameSize) {
          break;
        }

        const streamType = buffer.readUInt8(0);
        const payload = buffer
          .subarray(DOCKER_STREAM_HEADER_SIZE, frameSize)
          .toString('utf-8')
          .trimEnd();

        buffer = buffer.subarray(frameSize);

        if (!payload) continue;

        const level = streamType === 2 ? 'stderr' : 'stdout';
        callback(level, payload);
      }
    });

    stream.on('error', (err: Error) => {
      this.logger.error(`Docker stream error for ${streamLabel}`, err.stack);
    });
  }

  async healthCheck(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      if (!info.State.Running) {
        return false;
      }

      return info.State.Health?.Status
        ? info.State.Health.Status === 'healthy'
        : true;
    } catch {
      return false;
    }
  }

  async getPromptUrl(containerId: string): Promise<string> {
    const baseUrl = await this.getContainerBaseUrl(containerId);
    return `${baseUrl}/v1/prompt`;
  }

  async getSessionUrl(containerId: string): Promise<string> {
    const baseUrl = await this.getContainerBaseUrl(containerId);
    return `${baseUrl}/v1/session`;
  }

  private async getContainerBaseUrl(containerId: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const hostPort =
      info.NetworkSettings.Ports?.[SANDBOX_AGENT_PORT]?.[0]?.HostPort;

    if (!hostPort) {
      throw new SandboxCreationException(
        `Sandbox agent port is not published for container ${containerId}`,
      );
    }

    return `http://127.0.0.1:${hostPort}`;
  }

  private isContainerNotRunningError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('is not running') ||
        error.message.includes('container already stopped'))
    );
  }

  private isContainerNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('no such container') ||
        error.message.includes('is not found'))
    );
  }

  private normalizeSignal(signal: string): string {
    return signal.replaceAll('-', '').toUpperCase();
  }

  private toNodeSignal(signal: string): NodeJS.Signals {
    const normalizedSignal = this.normalizeSignal(signal);
    return `SIG${normalizedSignal}` as NodeJS.Signals;
  }

  private parseExecEnv(envValues?: string[]): NodeJS.ProcessEnv {
    if (!envValues?.length) {
      return { ...process.env };
    }

    const env = { ...process.env };
    for (const entry of envValues) {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = entry.slice(0, separatorIndex);
      const value = entry.slice(separatorIndex + 1);
      env[key] = value;
    }

    return env;
  }

  private async createFakeExec(
    options: DockerExecCreateOptions,
  ): Promise<DockerExecHandle> {
    const execId = randomUUID();
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: this.parseExecEnv(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const fakeExec: FakeExecRecord = {
      child,
      outputs: [],
      exitInfo: {
        running: true,
        exitCode: null,
        pid: child.pid ?? null,
      },
    };
    this.fakeExecs.set(execId, fakeExec);

    const emitOutput = (level: string, chunk: string | Buffer) => {
      const message = chunk.toString();
      if (message.length === 0) {
        return;
      }

      fakeExec.outputs.push({ level, message });
      fakeExec.callback?.(level, message);
    };

    child.stdout.on('data', (chunk) => {
      emitOutput('stdout', chunk);
    });
    child.stderr.on('data', (chunk) => {
      emitOutput('stderr', chunk);
    });
    child.once('exit', (code) => {
      fakeExec.exitInfo = {
        running: false,
        exitCode: code ?? null,
        pid: child.pid ?? null,
      };
    });

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        child.off('spawn', onSpawn);
        child.off('error', onError);
      };

      const onSpawn = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        this.fakeExecs.delete(execId);
        reject(error);
      };

      child.once('spawn', onSpawn);
      child.once('error', onError);
    });

    return { execId };
  }

  private async waitForFakeExecExit(
    execId: string,
  ): Promise<DockerExecExitInfo> {
    const fakeExec = this.fakeExecs.get(execId);

    if (!fakeExec) {
      throw new SandboxCreationException(
        `Sandbox exec stream is unavailable for exec ${execId}`,
      );
    }

    if (!fakeExec.exitInfo.running) {
      return fakeExec.exitInfo;
    }

    await new Promise<void>((resolve, reject) => {
      fakeExec.child.once('exit', () => {
        resolve();
      });
      fakeExec.child.once('error', reject);
    });

    return fakeExec.exitInfo;
  }

  private async killFakeExec(execId: string, signal: string): Promise<void> {
    const fakeExec = this.fakeExecs.get(execId);

    if (!fakeExec || !fakeExec.exitInfo.running) {
      return;
    }

    fakeExec.child.kill(this.toNodeSignal(signal));
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
