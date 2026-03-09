import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';

import type { SandboxConfig } from '../../database/schema';
import {
  SandboxCreationException,
  SandboxDestroyException,
} from './sandbox.exceptions';

export interface ContainerStats {
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
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

@Injectable()
export class DockerService {
  private readonly docker: Docker;
  private readonly logger = new Logger(DockerService.name);

  constructor() {
    this.docker = new Docker();
  }

  async createContainer(
    sessionId: string,
    config: SandboxConfig,
  ): Promise<{ containerId: string }> {
    try {
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
        name: `sandbox-${sessionId}`,
        Labels: { 'agentloom.session': sessionId },
        HostConfig: {
          PortBindings: {
            [SANDBOX_AGENT_PORT]: [{ HostPort: '0' }],
          },
          NanoCpus: config.cpu * CPU_CORE_TO_NANO,
          Memory: config.memory * MB_TO_BYTES,
          StorageOpt: { size: `${config.disk}G` },
          Binds: [`sandbox-${sessionId}-workspace:/workspace`],
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

    stream.on('data', (chunk: Buffer) => {
      const header = chunk.readUInt8(0);
      const payload = chunk.subarray(8).toString('utf-8').trimEnd();
      if (!payload) return;

      const level = header === 2 ? 'stderr' : 'stdout';
      callback(level, payload);
    });

    stream.on('error', (err: Error) => {
      this.logger.error(`Log stream error for ${containerId}`, err.stack);
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
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const hostPort = info.NetworkSettings.Ports?.[SANDBOX_AGENT_PORT]?.[0]?.HostPort;

    if (!hostPort) {
      throw new SandboxCreationException(
        `Sandbox agent port is not published for container ${containerId}`,
      );
    }

    return `http://127.0.0.1:${hostPort}/v1/prompt`;
  }

  async getArchive(containerId: string, path: string): Promise<Buffer> {
    const container = this.docker.getContainer(containerId);
    const stream = await container.getArchive({ path });

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
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
}
