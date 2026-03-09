import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { Readable } from 'node:stream';

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

    // Docker 多路复用流格式：
    //   字节 0:   流类型 (1=stdout, 2=stderr)
    //   字节 1-3: 填充 (0x00)
    //   字节 4-7: 载荷长度 (big-endian uint32)
    //   字节 8+:  载荷数据
    // TCP 分片可能将一个帧拆分到多个 chunk，或一个 chunk 包含多个帧
    const HEADER_SIZE = 8;
    let buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= HEADER_SIZE) {
        const payloadSize = buffer.readUInt32BE(4);
        const frameSize = HEADER_SIZE + payloadSize;

        if (buffer.length < frameSize) {
          break;
        }

        const streamType = buffer.readUInt8(0);
        const payload = buffer
          .subarray(HEADER_SIZE, frameSize)
          .toString('utf-8')
          .trimEnd();

        buffer = buffer.subarray(frameSize);

        if (!payload) continue;

        const level = streamType === 2 ? 'stderr' : 'stdout';
        callback(level, payload);
      }
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
    const baseUrl = await this.getContainerBaseUrl(containerId);
    return `${baseUrl}/v1/prompt`;
  }

  async getSessionUrl(containerId: string): Promise<string> {
    const baseUrl = await this.getContainerBaseUrl(containerId);
    return `${baseUrl}/v1/session`;
  }

  async getArchive(containerId: string, path: string): Promise<Readable> {
    const container = this.docker.getContainer(containerId);
    const stream = await container.getArchive({ path });
    return stream as unknown as Readable;
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
}
