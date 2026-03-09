import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { SandboxCreationException, SandboxDestroyException } from '../sandbox.exceptions';

const mockContainer = {
  id: 'container-abc123',
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  inspect: vi.fn().mockResolvedValue({
    State: { Running: true },
    NetworkSettings: {
      Ports: {
        '8080/tcp': [{ HostPort: '49123' }],
      },
    },
  }),
  logs: vi.fn(),
  stats: vi.fn(),
};

const mockDocker = {
  createContainer: vi.fn().mockResolvedValue(mockContainer),
  getContainer: vi.fn().mockReturnValue(mockContainer),
};

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(function () {
    return mockDocker;
  }),
}));

import type { SandboxConfig } from '../../../database/schema';
import { DockerService } from '../docker.service';

const DEFAULT_CONFIG: SandboxConfig = {
  cpu: 2,
  memory: 1024,
  disk: 5,
  timeout: 4,
};

describe('DockerService', () => {
  const service = new DockerService();

  describe('createContainer', () => {
    it('应使用正确的资源映射创建并启动容器', async () => {
      const result = await service.createContainer('session-1', DEFAULT_CONFIG);

      expect(result.containerId).toBe('container-abc123');
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          ExposedPorts: { '8080/tcp': {} },
          Healthcheck: expect.objectContaining({
            Interval: 30_000_000_000,
            Retries: 3,
            StartPeriod: 5_000_000_000,
            Timeout: 5_000_000_000,
          }),
          Image: 'agentloom/sandbox:latest',
          name: 'sandbox-session-1',
          Labels: { 'agentloom.session': 'session-1' },
          HostConfig: expect.objectContaining({
            PortBindings: { '8080/tcp': [{ HostPort: '0' }] },
            NanoCpus: 2e9,
            Memory: 1024 * 1024 * 1024,
            StorageOpt: { size: '5G' },
          }),
        }),
      );
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('创建失败时应抛出 SandboxCreationException', async () => {
      mockDocker.createContainer.mockRejectedValueOnce(
        new Error('image not found'),
      );

      await expect(
        service.createContainer('session-fail', DEFAULT_CONFIG),
      ).rejects.toThrow(SandboxCreationException);
    });
  });

  describe('stopContainer', () => {
    it('应使用 10 秒超时执行 graceful stop', async () => {
      mockContainer.stop.mockResolvedValueOnce(undefined);

      await service.stopContainer('container-abc123');

      expect(mockDocker.getContainer).toHaveBeenCalledWith('container-abc123');
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
    });

    it('容器已停止时应优雅处理', async () => {
      mockContainer.stop.mockRejectedValueOnce(
        new Error('container already stopped'),
      );

      await expect(
        service.stopContainer('container-abc123'),
      ).resolves.toBeUndefined();
    });
  });

  describe('removeContainer', () => {
    it('应强制删除容器及卷', async () => {
      mockContainer.remove.mockResolvedValueOnce(undefined);

      await service.removeContainer('container-abc123');

      expect(mockContainer.remove).toHaveBeenCalledWith({
        v: true,
        force: true,
      });
    });

    it('容器不存在时应优雅处理', async () => {
      mockContainer.remove.mockRejectedValueOnce(
        new Error('no such container'),
      );

      await expect(
        service.removeContainer('container-abc123'),
      ).resolves.toBeUndefined();
    });

    it('其他错误应抛出 SandboxDestroyException', async () => {
      mockContainer.remove.mockRejectedValueOnce(
        new Error('permission denied'),
      );

      await expect(
        service.removeContainer('container-abc123'),
      ).rejects.toThrow(SandboxDestroyException);
    });
  });

  describe('attachLogs', () => {
    it('应通过 header 字节区分 stdout 和 stderr', async () => {
      const emitter = new EventEmitter();
      mockContainer.logs.mockResolvedValueOnce(emitter);

      const logs: { level: string; message: string }[] = [];
      await service.attachLogs('container-abc123', (level, message) => {
        logs.push({ level, message });
      });

      const stdoutPayload = Buffer.from('hello stdout');
      const stdoutChunk = Buffer.alloc(8 + stdoutPayload.length);
      stdoutChunk.writeUInt8(1, 0);
      stdoutPayload.copy(stdoutChunk, 8);
      emitter.emit('data', stdoutChunk);

      const stderrPayload = Buffer.from('err msg');
      const stderrChunk = Buffer.alloc(8 + stderrPayload.length);
      stderrChunk.writeUInt8(2, 0);
      stderrPayload.copy(stderrChunk, 8);
      emitter.emit('data', stderrChunk);

      expect(logs).toEqual([
        { level: 'stdout', message: 'hello stdout' },
        { level: 'stderr', message: 'err msg' },
      ]);
    });

    it('空 payload 不应触发回调', async () => {
      const emitter = new EventEmitter();
      mockContainer.logs.mockResolvedValueOnce(emitter);

      const logs: { level: string; message: string }[] = [];
      await service.attachLogs('container-abc123', (level, message) => {
        logs.push({ level, message });
      });

      const emptyChunk = Buffer.alloc(8);
      emptyChunk.writeUInt8(1, 0);
      emitter.emit('data', emptyChunk);

      expect(logs).toHaveLength(0);
    });
  });

  describe('healthCheck', () => {
    it('容器运行中时应返回 true', async () => {
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: true },
      });

      const result = await service.healthCheck('container-abc123');
      expect(result).toBe(true);
    });

    it('health 状态 unhealthy 时应返回 false', async () => {
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: true, Health: { Status: 'unhealthy' } },
      });

      const result = await service.healthCheck('container-abc123');
      expect(result).toBe(false);
    });

    it('inspect 失败时应返回 false', async () => {
      mockContainer.inspect.mockRejectedValueOnce(
        new Error('no such container'),
      );

      const result = await service.healthCheck('container-abc123');
      expect(result).toBe(false);
    });
  });

  describe('getPromptUrl', () => {
    it('应解析容器暴露的 agent HTTP 端口', async () => {
      const url = await service.getPromptUrl('container-abc123');

      expect(url).toBe('http://127.0.0.1:49123/v1/prompt');
    });
  });

  describe('getContainerStats', () => {
    it('应正确计算 CPU 百分比和内存使用量', async () => {
      mockContainer.stats.mockResolvedValueOnce({
        cpu_stats: {
          cpu_usage: { total_usage: 200_000_000 },
          system_cpu_usage: 1_000_000_000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100_000_000 },
          system_cpu_usage: 500_000_000,
        },
        memory_stats: {
          usage: 256 * 1024 * 1024,
          limit: 1024 * 1024 * 1024,
        },
      });

      const result = await service.getContainerStats('container-abc123');

      expect(result.cpuPercent).toBe(40);
      expect(result.memoryUsageMb).toBe(256);
      expect(result.memoryLimitMb).toBe(1024);
    });
  });
});
