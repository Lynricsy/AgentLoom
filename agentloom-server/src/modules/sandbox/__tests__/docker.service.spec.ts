import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  SandboxCreationException,
  SandboxDestroyException,
} from '../sandbox.exceptions';
import type { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import type { PiConfigGeneratorService } from '../pi-config-generator.service';

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
      Networks: {
        'agentloom-app': {
          IPAddress: '172.18.2.10',
        },
      },
    },
  }),
  logs: vi.fn(),
  stats: vi.fn(),
  getArchive: vi.fn(),
  putArchive: vi.fn(),
  exec: vi.fn(),
};

const mockExec = {
  id: 'exec-abc123',
  start: vi.fn().mockResolvedValue(new PassThrough()),
  inspect: vi.fn(),
};

const mockDocker = {
  createContainer: vi.fn().mockResolvedValue(mockContainer),
  getContainer: vi.fn().mockReturnValue(mockContainer),
  getExec: vi.fn().mockReturnValue(mockExec),
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

const mockPiConfigGenerator = {
  generateConfigBundle: vi.fn().mockReturnValue({
    settings: '{"model":"claude-sonnet-4-20250514"}',
    models: '{"models":[]}',
    systemPrompt: '# System Prompt',
    skills: {},
  }),
} as unknown as PiConfigGeneratorService;

const mockDecryptionBoundaryService = {
  decryptConfiguredApiKey: vi.fn(),
} as unknown as DecryptionBoundaryService;

function createDockerMultiplexedFrame(
  streamType: number,
  message: string,
): Buffer {
  const payload = Buffer.from(message);
  const frame = Buffer.alloc(8 + payload.length);
  frame.writeUInt8(streamType, 0);
  frame.writeUInt32BE(payload.length, 4);
  payload.copy(frame, 8);
  return frame;
}

function createExecInspectInfo(
  overrides: Partial<{
    ContainerID: string;
    ExitCode: number | null;
    ID: string;
    Pid: number;
    Running: boolean;
  }> = {},
) {
  return {
    CanRemove: false,
    DetachKeys: 'ctrl-c',
    ID: 'exec-abc123',
    Running: true,
    ExitCode: null,
    ProcessConfig: {
      privileged: false,
      user: 'sandbox',
      tty: false,
      entrypoint: 'python',
      arguments: ['-c', 'print("hello")'],
    },
    OpenStdin: false,
    OpenStderr: true,
    OpenStdout: true,
    ContainerID: 'container-abc123',
    Pid: 4321,
    ...overrides,
  };
}

async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return await new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', reject);
    stream.resume();
  });
}

function inspectTarArchive(archiveBuffer: Buffer): {
  entries: string[];
  readEntry: (entry: string) => string;
  cleanup: () => void;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-service-spec-'));
  const archivePath = path.join(tmpDir, 'config.tar');
  fs.writeFileSync(archivePath, archiveBuffer);

  const listResult = spawnSync('tar', ['-tf', archivePath], {
    encoding: 'utf-8',
  });
  if (listResult.status !== 0) {
    throw new Error(listResult.stderr || 'Failed to inspect tar archive');
  }

  const entries = listResult.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^\.\/?/, ''));

  return {
    entries,
    readEntry(entry: string): string {
      const entryCandidates = [`./${entry}`, entry];
      for (const candidate of entryCandidates) {
        const extractResult = spawnSync(
          'tar',
          ['-xOf', archivePath, candidate],
          {
            encoding: 'utf-8',
          },
        );
        if (extractResult.status === 0) {
          return extractResult.stdout;
        }
      }

      throw new Error(`Failed to read ${entry} from tar archive`);
    },
    cleanup(): void {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe('DockerService', () => {
  delete process.env.ACP_TEST_FAKE_RUNTIME;
  const service = new DockerService(
    mockPiConfigGenerator,
    mockDecryptionBoundaryService,
  );

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

    it('宿主不支持 StorageOpt.size 时应降级重试且继续创建容器', async () => {
      vi.clearAllMocks();
      mockContainer.start.mockResolvedValue(undefined);
      mockDocker.createContainer
        .mockRejectedValueOnce(
          new Error(
            "(HTTP code 500) server error - --storage-opt is supported only for overlay over xfs with 'pquota' mount option ",
          ),
        )
        .mockResolvedValueOnce(mockContainer);

      const result = await service.createContainer(
        'session-storage-fallback',
        DEFAULT_CONFIG,
      );

      expect(result.containerId).toBe('container-abc123');
      expect(mockDocker.createContainer).toHaveBeenCalledTimes(2);

      const firstCall = mockDocker.createContainer.mock.calls[0][0];
      const secondCall = mockDocker.createContainer.mock.calls[1][0];

      expect(firstCall.HostConfig.StorageOpt).toEqual({ size: '5G' });
      expect(secondCall.HostConfig.StorageOpt).toBeUndefined();
      expect(secondCall.HostConfig.Binds).toEqual([
        'sandbox-session-storage-fallback-workspace:/workspace',
      ]);
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

    it('配置 APP_DOCKER_SANDBOX_NETWORK 时应将 sandbox 加入指定网络', async () => {
      const previous = process.env.APP_DOCKER_SANDBOX_NETWORK;
      process.env.APP_DOCKER_SANDBOX_NETWORK = 'agentloom-app';

      try {
        await service.createContainer('session-networked', DEFAULT_CONFIG);

        expect(mockDocker.createContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            HostConfig: expect.objectContaining({
              NetworkMode: 'agentloom-app',
            }),
          }),
        );
      } finally {
        if (previous === undefined) {
          delete process.env.APP_DOCKER_SANDBOX_NETWORK;
        } else {
          process.env.APP_DOCKER_SANDBOX_NETWORK = previous;
        }
      }
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

  describe('startContainer', () => {
    it('应启动已停止容器', async () => {
      mockContainer.start.mockResolvedValueOnce(undefined);
      const startCallCount = mockContainer.start.mock.calls.length;

      await service.startContainer('container-abc123');

      expect(mockDocker.getContainer).toHaveBeenCalledWith('container-abc123');
      expect(mockContainer.start.mock.calls.length).toBe(startCallCount + 1);
    });

    it('容器已运行时应优雅处理', async () => {
      mockContainer.start.mockRejectedValueOnce(
        new Error('container already running'),
      );

      await expect(
        service.startContainer('container-abc123'),
      ).resolves.toBeUndefined();
    });

    it('其他错误应抛出 SandboxCreationException', async () => {
      mockContainer.start.mockRejectedValueOnce(new Error('permission denied'));

      await expect(service.startContainer('container-abc123')).rejects.toThrow(
        SandboxCreationException,
      );
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

      await expect(service.removeContainer('container-abc123')).rejects.toThrow(
        SandboxDestroyException,
      );
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
      stdoutChunk.writeUInt32BE(stdoutPayload.length, 4);
      stdoutPayload.copy(stdoutChunk, 8);
      emitter.emit('data', stdoutChunk);

      const stderrPayload = Buffer.from('err msg');
      const stderrChunk = Buffer.alloc(8 + stderrPayload.length);
      stderrChunk.writeUInt8(2, 0);
      stderrChunk.writeUInt32BE(stderrPayload.length, 4);
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
      emptyChunk.writeUInt32BE(0, 4);
      emitter.emit('data', emptyChunk);

      expect(logs).toHaveLength(0);
    });

    it('单个 chunk 包含多帧时应正确解析所有帧', async () => {
      const emitter = new EventEmitter();
      mockContainer.logs.mockResolvedValueOnce(emitter);

      const logs: { level: string; message: string }[] = [];
      await service.attachLogs('container-abc123', (level, message) => {
        logs.push({ level, message });
      });

      // 构建包含两帧的单个 chunk
      const payload1 = Buffer.from('frame-one');
      const payload2 = Buffer.from('frame-two');
      const combined = Buffer.alloc(8 + payload1.length + 8 + payload2.length);
      // 第一帧 (stdout)
      combined.writeUInt8(1, 0);
      combined.writeUInt32BE(payload1.length, 4);
      payload1.copy(combined, 8);
      // 第二帧 (stderr)
      const offset2 = 8 + payload1.length;
      combined.writeUInt8(2, offset2);
      combined.writeUInt32BE(payload2.length, offset2 + 4);
      payload2.copy(combined, offset2 + 8);

      emitter.emit('data', combined);

      expect(logs).toEqual([
        { level: 'stdout', message: 'frame-one' },
        { level: 'stderr', message: 'frame-two' },
      ]);
    });

    it('帧跨越 chunk 边界时应正确累积并解析', async () => {
      const emitter = new EventEmitter();
      mockContainer.logs.mockResolvedValueOnce(emitter);

      const logs: { level: string; message: string }[] = [];
      await service.attachLogs('container-abc123', (level, message) => {
        logs.push({ level, message });
      });

      // 构建完整帧然后在中间拆分
      const payload = Buffer.from('cross-boundary');
      const fullFrame = Buffer.alloc(8 + payload.length);
      fullFrame.writeUInt8(1, 0);
      fullFrame.writeUInt32BE(payload.length, 4);
      payload.copy(fullFrame, 8);

      // 在 header 中间拆分 (前4字节 / 后4字节+payload)
      const chunk1 = fullFrame.subarray(0, 4);
      const chunk2 = fullFrame.subarray(4);

      emitter.emit('data', chunk1);
      expect(logs).toHaveLength(0); // 不完整的 header，不应触发

      emitter.emit('data', chunk2);
      expect(logs).toEqual([{ level: 'stdout', message: 'cross-boundary' }]);
    });
  });

  describe('createExec', () => {
    it('应创建并启动非交互式 exec', async () => {
      const execStream = new PassThrough();
      mockContainer.exec.mockResolvedValueOnce(mockExec);
      mockExec.start.mockResolvedValueOnce(execStream);

      const result = await service.createExec('container-abc123', {
        command: 'python',
        args: ['-c', 'print("hello")'],
        cwd: '/workspace/demo',
      });

      expect(result).toEqual({ execId: 'exec-abc123' });
      expect(mockDocker.getContainer).toHaveBeenCalledWith('container-abc123');
      expect(mockContainer.exec).toHaveBeenCalledWith({
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['python', '-c', 'print("hello")'],
        Tty: false,
        WorkingDir: '/workspace/demo',
      });
      expect(mockExec.start).toHaveBeenCalledWith({
        Detach: false,
        Tty: false,
      });
    });

    it('创建 exec 失败时应抛出 SandboxCreationException', async () => {
      mockContainer.exec.mockRejectedValueOnce(new Error('exec create failed'));

      await expect(
        service.createExec('container-abc123', {
          command: 'python',
        }),
      ).rejects.toThrow(SandboxCreationException);
    });
  });

  describe('attachExecOutput', () => {
    it('应通过 header 字节区分 exec stdout 和 stderr', async () => {
      const execStream = new PassThrough();
      mockContainer.exec.mockResolvedValueOnce(mockExec);
      mockExec.start.mockResolvedValueOnce(execStream);

      const { execId } = await service.createExec('container-abc123', {
        command: 'python',
      });

      const logs: { level: string; message: string }[] = [];
      await service.attachExecOutput(execId, (level, message) => {
        logs.push({ level, message });
      });

      execStream.write(createDockerMultiplexedFrame(1, 'hello stdout'));
      execStream.write(createDockerMultiplexedFrame(2, 'err msg'));

      expect(logs).toEqual([
        { level: 'stdout', message: 'hello stdout' },
        { level: 'stderr', message: 'err msg' },
      ]);
    });
  });

  describe('waitForExecExit', () => {
    it('应轮询 exec inspect 直到进程退出', async () => {
      vi.useFakeTimers();
      mockExec.inspect
        .mockResolvedValueOnce(createExecInspectInfo({ Running: true }))
        .mockResolvedValueOnce(
          createExecInspectInfo({
            ExitCode: 0,
            Running: false,
          }),
        );

      const waitPromise = service.waitForExecExit('exec-abc123');
      await vi.advanceTimersByTimeAsync(100);

      await expect(waitPromise).resolves.toEqual({
        exitCode: 0,
        pid: 4321,
        running: false,
      });

      vi.useRealTimers();
    });
  });

  describe('killExec', () => {
    it('应通过非交互式 kill exec 终止目标进程', async () => {
      const killStream = new PassThrough();
      const killExec = {
        id: 'exec-kill-001',
        start: vi.fn().mockResolvedValue(killStream),
      };

      mockExec.inspect.mockResolvedValueOnce(
        createExecInspectInfo({
          ContainerID: 'container-abc123',
          Pid: 9876,
          Running: true,
        }),
      );
      mockContainer.exec.mockResolvedValueOnce(killExec);

      await service.killExec('exec-abc123');

      expect(mockDocker.getExec).toHaveBeenCalledWith('exec-abc123');
      expect(mockContainer.exec).toHaveBeenCalledWith({
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['kill', '-TERM', '9876'],
        Tty: false,
      });
      expect(killExec.start).toHaveBeenCalledWith({
        Detach: false,
        Tty: false,
      });
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

    it('配置 APP_DOCKER_SANDBOX_NETWORK 时应优先返回同网络容器 IP', async () => {
      const previous = process.env.APP_DOCKER_SANDBOX_NETWORK;
      process.env.APP_DOCKER_SANDBOX_NETWORK = 'agentloom-app';

      try {
        const url = await service.getPromptUrl('container-abc123');

        expect(url).toBe('http://172.18.2.10:8080/v1/prompt');
      } finally {
        if (previous === undefined) {
          delete process.env.APP_DOCKER_SANDBOX_NETWORK;
        } else {
          process.env.APP_DOCKER_SANDBOX_NETWORK = previous;
        }
      }
    });
  });

  describe('getSessionUrl', () => {
    it('应返回容器的 session 创建端点', async () => {
      const url = await service.getSessionUrl('container-abc123');

      expect(url).toBe('http://127.0.0.1:49123/v1/session');
    });

    it('配置 APP_DOCKER_SANDBOX_NETWORK 时应优先返回同网络容器 IP', async () => {
      const previous = process.env.APP_DOCKER_SANDBOX_NETWORK;
      process.env.APP_DOCKER_SANDBOX_NETWORK = 'agentloom-app';

      try {
        const url = await service.getSessionUrl('container-abc123');

        expect(url).toBe('http://172.18.2.10:8080/v1/session');
      } finally {
        if (previous === undefined) {
          delete process.env.APP_DOCKER_SANDBOX_NETWORK;
        } else {
          process.env.APP_DOCKER_SANDBOX_NETWORK = previous;
        }
      }
    });
  });

  describe('getArchive', () => {
    it('应返回 Readable 流', async () => {
      const fakeStream = new Readable({
        read() {
          this.push(null);
        },
      });
      mockContainer.getArchive.mockResolvedValueOnce(fakeStream);

      const result = await service.getArchive(
        'container-abc123',
        '/workspace/',
      );

      expect(result).toBeInstanceOf(Readable);
      expect(mockContainer.getArchive).toHaveBeenCalledWith({
        path: '/workspace/',
      });
    });
  });

  describe('getContainerStats', () => {
    it('应正确计算 CPU 百分比、内存使用量和工作区磁盘占用', async () => {
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
      const createExecSpy = vi
        .spyOn(service, 'createExec')
        .mockResolvedValueOnce({ execId: 'exec-disk-1' });
      const attachExecOutputSpy = vi
        .spyOn(service, 'attachExecOutput')
        .mockImplementationOnce(async (_execId, callback) => {
          callback('stdout', '4096\n');
        });
      const waitForExecExitSpy = vi
        .spyOn(service, 'waitForExecExit')
        .mockResolvedValueOnce({
          exitCode: 0,
          pid: 4321,
          running: false,
        });

      const result = await service.getContainerStats('container-abc123');

      expect(result.cpuPercent).toBe(40);
      expect(result.memoryUsageMb).toBe(256);
      expect(result.memoryLimitMb).toBe(1024);
      expect(result.diskUsage).toBe(4096);
      expect(createExecSpy).toHaveBeenCalledWith('container-abc123', {
        command: 'sh',
        args: ['-lc', expect.stringContaining('find /workspace')],
      });
      expect(attachExecOutputSpy).toHaveBeenCalledWith(
        'exec-disk-1',
        expect.any(Function),
      );
      expect(waitForExecExitSpy).toHaveBeenCalledWith('exec-disk-1');
    });

    it('磁盘占用采集失败时仍应返回 CPU 和内存统计', async () => {
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
      mockContainer.exec.mockRejectedValueOnce(new Error('exec create failed'));

      const result = await service.getContainerStats('container-abc123');

      expect(result.cpuPercent).toBe(40);
      expect(result.memoryUsageMb).toBe(256);
      expect(result.memoryLimitMb).toBe(1024);
      expect(result.diskUsage).toBeUndefined();
    });
  });

  describe('createContainer with pi-config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      vi.clearAllMocks();
      mockDocker.createContainer.mockResolvedValue(mockContainer);
      mockContainer.start.mockResolvedValue(undefined);
      mockContainer.putArchive.mockImplementation(async (stream: Readable) => {
        await readStreamToBuffer(stream);
      });
      mockDecryptionBoundaryService.decryptConfiguredApiKey = vi.fn();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('piContext 未提供时不应挂载 /config 或注入环境变量', async () => {
      await service.createContainer('session-no-pi', DEFAULT_CONFIG);

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      expect(callArgs.Env).toBeUndefined();
      expect(callArgs.HostConfig.Binds).toEqual([
        'sandbox-session-no-pi-workspace:/workspace',
      ]);
      expect(callArgs.HostConfig.ExtraHosts).toBeUndefined();
    });

    it('piConfigInput 提供时应在容器启动前写入 /config', async () => {
      const piContext = {
        piConfigInput: { systemPrompt: 'You are a coding agent' },
        conversationId: 'conv-123',
      };
      process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic';
      process.env.APP_PORT = '4000';
      let uploadedArchive: Buffer | undefined;
      mockContainer.putArchive.mockImplementationOnce(
        async (stream: Readable) => {
          uploadedArchive = await readStreamToBuffer(stream);
        },
      );

      await service.createContainer('session-pi', DEFAULT_CONFIG, piContext);

      expect(mockPiConfigGenerator.generateConfigBundle).toHaveBeenCalledWith(
        piContext.piConfigInput,
      );

      const callArgs = mockDocker.createContainer.mock.calls[0][0];

      expect(callArgs.Env).toContain('PI_CODING_AGENT_DIR=/config');
      expect(callArgs.Env).toContain('ANTHROPIC_API_KEY=sk-test-anthropic');
      expect(
        (callArgs.Env as string[]).find((entry: string) =>
          entry.startsWith('PERMISSION_CALLBACK_URL='),
        ),
      ).toBeUndefined();
      expect(callArgs.HostConfig.Binds).toEqual([
        'sandbox-session-pi-workspace:/workspace',
      ]);
      expect(mockContainer.putArchive).toHaveBeenCalledWith(expect.anything(), {
        path: '/',
      });
      expect(mockContainer.putArchive.mock.invocationCallOrder[0]).toBeLessThan(
        mockContainer.start.mock.invocationCallOrder[0],
      );

      const archive = inspectTarArchive(uploadedArchive ?? Buffer.alloc(0));
      try {
        expect(archive.entries).toEqual(
          expect.arrayContaining([
            'config/settings.json',
            'config/models.json',
            'config/system-prompt.md',
            'config/mcp-servers.json',
          ]),
        );
        expect(archive.readEntry('config/settings.json')).toBe(
          '{"model":"claude-sonnet-4-20250514"}',
        );
        expect(archive.readEntry('config/models.json')).toBe('{"models":[]}');
        expect(archive.readEntry('config/system-prompt.md')).toBe(
          '# System Prompt',
        );
      } finally {
        archive.cleanup();
      }
    });

    it('conversationId 提供时默认也不注入 PERMISSION_CALLBACK_URL', async () => {
      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
        conversationId: 'conv-456',
      };

      await service.createContainer('session-port', DEFAULT_CONFIG, piContext);

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      expect(
        (callArgs.Env as string[]).find((entry: string) =>
          entry.startsWith('PERMISSION_CALLBACK_URL='),
        ),
      ).toBeUndefined();
      expect(callArgs.HostConfig).not.toMatchObject({
        ExtraHosts: expect.anything(),
      });
      expect(mockContainer.putArchive).toHaveBeenCalledWith(expect.anything(), {
        path: '/',
      });
    });

    it('conversationId 未提供时不应注入 PERMISSION_CALLBACK_URL', async () => {
      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
      };

      await service.createContainer(
        'session-no-conv',
        DEFAULT_CONFIG,
        piContext,
      );

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      const permUrlEntry = (callArgs.Env as string[]).find((e: string) =>
        e.startsWith('PERMISSION_CALLBACK_URL='),
      );
      expect(permUrlEntry).toBeUndefined();
      expect(mockContainer.putArchive).toHaveBeenCalledWith(expect.anything(), {
        path: '/',
      });
    });

    it('仅注入存在的 LLM API 密钥到容器环境', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai';
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
      };

      await service.createContainer('session-keys', DEFAULT_CONFIG, piContext);

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      const env: string[] = callArgs.Env;
      expect(env).toContain('OPENAI_API_KEY=sk-openai');
      expect(
        env.find((e: string) => e.startsWith('ANTHROPIC_API_KEY=')),
      ).toBeUndefined();
      expect(
        env.find((e: string) => e.startsWith('GOOGLE_API_KEY=')),
      ).toBeUndefined();
      expect(mockContainer.putArchive).toHaveBeenCalledWith(expect.anything(), {
        path: '/',
      });
    });

    it('存在模型配置时应解密并覆盖对应 provider 的容器 API Key', async () => {
      mockDecryptionBoundaryService.decryptConfiguredApiKey = vi
        .fn()
        .mockResolvedValue('sk-private-cloud');
      process.env.PRIVATE_CLOUD_API_KEY = 'sk-inherited';

      const piContext = {
        piConfigInput: {
          systemPrompt: 'test',
          modelConfig: {
            provider: 'private_cloud',
            model: 'claude-opus-4-6',
            apiBaseUrl: 'https://models.example.test/v1',
            apiKeyId: 'api-key-123',
            organizationId: 'org-123',
            tenantId: 'tenant-123',
            authMethod: 'api_key',
          },
        },
      };

      await service.createContainer(
        'session-private-cloud',
        DEFAULT_CONFIG,
        piContext,
      );

      expect(
        mockDecryptionBoundaryService.decryptConfiguredApiKey,
      ).toHaveBeenCalledWith(
        {
          apiKeyId: 'api-key-123',
          organizationId: 'org-123',
          tenantId: 'tenant-123',
          provider: 'private_cloud',
        },
        'DockerService',
      );

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      expect(callArgs.Env).toContain('PRIVATE_CLOUD_API_KEY=sk-private-cloud');
      expect(mockContainer.putArchive).toHaveBeenCalledWith(expect.anything(), {
        path: '/',
      });
    });

    it('private_cloud 非 api_key 鉴权时应移除继承的 provider API Key', async () => {
      process.env.PRIVATE_CLOUD_API_KEY = 'sk-inherited';

      const piContext = {
        piConfigInput: {
          systemPrompt: 'test',
          modelConfig: {
            provider: 'private_cloud',
            model: 'claude-opus-4-6',
            apiBaseUrl: 'https://models.example.test/v1',
            organizationId: 'org-123',
            tenantId: 'tenant-123',
            authMethod: 'none',
          },
        },
      };

      await service.createContainer(
        'session-private-cloud-no-auth',
        DEFAULT_CONFIG,
        piContext,
      );

      expect(
        mockDecryptionBoundaryService.decryptConfiguredApiKey,
      ).not.toHaveBeenCalled();

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      expect(
        (callArgs.Env as string[]).find((entry: string) =>
          entry.startsWith('PRIVATE_CLOUD_API_KEY='),
        ),
      ).toBeUndefined();
      expect(mockContainer.putArchive).toHaveBeenCalledWith(expect.anything(), {
        path: '/',
      });
    });

    it('ACP_TEST_FAKE_RUNTIME=1 时应跳过 pi-config 生成', async () => {
      process.env.ACP_TEST_FAKE_RUNTIME = '1';
      const fakeService = new DockerService(
        mockPiConfigGenerator,
        mockDecryptionBoundaryService,
      );

      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
        conversationId: 'conv-fake',
      };

      await fakeService.createContainer(
        'session-fake',
        DEFAULT_CONFIG,
        piContext,
      );

      expect(mockPiConfigGenerator.generateConfigBundle).not.toHaveBeenCalled();

      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      expect(callArgs.Env).toBeUndefined();
      expect(callArgs.HostConfig.Binds).toEqual([
        'sandbox-session-fake-workspace:/workspace',
      ]);
      expect(callArgs.HostConfig.ExtraHosts).toBeUndefined();
      expect(mockContainer.putArchive).not.toHaveBeenCalled();

      delete process.env.ACP_TEST_FAKE_RUNTIME;
    });

    it('piConfigInput 包含 skills 时应一并打包 skill 目录和文件', async () => {
      mockPiConfigGenerator.generateConfigBundle = vi.fn().mockReturnValue({
        settings: '{}',
        models: '{}',
        systemPrompt: 'prompt',
        skills: {
          'code-review': {
            'SKILL.md': '---\nname: code-review\n---\n\nReview code.',
            'examples.md': '# Examples',
          },
          testing: {
            'SKILL.md': '---\nname: testing\n---\n\nWrite tests.',
          },
        },
      });

      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
        conversationId: 'conv-skills',
      };
      let uploadedArchive: Buffer | undefined;
      mockContainer.putArchive.mockImplementationOnce(
        async (stream: Readable) => {
          uploadedArchive = await readStreamToBuffer(stream);
        },
      );

      await service.createContainer(
        'session-skills',
        DEFAULT_CONFIG,
        piContext,
      );

      const archive = inspectTarArchive(uploadedArchive ?? Buffer.alloc(0));
      try {
        expect(archive.entries).toEqual(
          expect.arrayContaining([
            'config/skills/code-review/SKILL.md',
            'config/skills/code-review/examples.md',
            'config/skills/testing/SKILL.md',
          ]),
        );
        expect(
          archive.readEntry('config/skills/code-review/SKILL.md'),
        ).toContain('Review code.');
        expect(archive.readEntry('config/skills/code-review/examples.md')).toBe(
          '# Examples',
        );
      } finally {
        archive.cleanup();
      }
    });
  });
});
