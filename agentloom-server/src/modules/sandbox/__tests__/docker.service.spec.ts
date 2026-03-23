import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  SandboxCreationException,
  SandboxDestroyException,
} from '../sandbox.exceptions';
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
    },
  }),
  logs: vi.fn(),
  stats: vi.fn(),
  getArchive: vi.fn(),
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
  }),
} as unknown as PiConfigGeneratorService;

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

describe('DockerService', () => {
  delete process.env.ACP_TEST_FAKE_RUNTIME;
  const service = new DockerService(mockPiConfigGenerator);

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
  });

  describe('getSessionUrl', () => {
    it('应返回容器的 session 创建端点', async () => {
      const url = await service.getSessionUrl('container-abc123');

      expect(url).toBe('http://127.0.0.1:49123/v1/session');
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

  describe('createContainer with pi-config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      vi.clearAllMocks();
      mockDocker.createContainer.mockResolvedValue(mockContainer);
      mockContainer.start.mockResolvedValue(undefined);
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('piContext 未提供时不应挂载 /config 或注入环境变量', async () => {
      await service.createContainer('session-no-pi', DEFAULT_CONFIG);

      const callArgs = mockDocker.createContainer.mock.calls[0]![0];
      expect(callArgs.Env).toBeUndefined();
      expect(callArgs.HostConfig.Binds).toEqual([
        'sandbox-session-no-pi-workspace:/workspace',
      ]);
      expect(callArgs.HostConfig.ExtraHosts).toBeUndefined();
    });

    it('piConfigInput 提供时应生成配置文件并 bind-mount 到 /config', async () => {
      const piContext = {
        piConfigInput: { systemPrompt: 'You are a coding agent' },
        conversationId: 'conv-123',
      };
      process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic';
      process.env.APP_PORT = '4000';

      await service.createContainer('session-pi', DEFAULT_CONFIG, piContext);

      expect(mockPiConfigGenerator.generateConfigBundle).toHaveBeenCalledWith(
        piContext.piConfigInput,
      );

      const callArgs = mockDocker.createContainer.mock.calls[0]![0];

      expect(callArgs.Env).toContain('PI_CODING_AGENT_DIR=/config');
      expect(callArgs.Env).toContain('ANTHROPIC_API_KEY=sk-test-anthropic');
      expect(callArgs.Env).toEqual(
        expect.arrayContaining([
          expect.stringContaining('PERMISSION_CALLBACK_URL=http://host.docker.internal:4000/api/v1/agent-conversations/conv-123/tool-permission'),
        ]),
      );

      const binds: string[] = callArgs.HostConfig.Binds;
      expect(binds).toHaveLength(2);
      expect(binds[0]).toBe('sandbox-session-pi-workspace:/workspace');
      expect(binds[1]).toMatch(/sandbox-pi-config-session-pi-.*:\/config:ro/);

      expect(callArgs.HostConfig.ExtraHosts).toEqual([
        'host.docker.internal:host-gateway',
      ]);

      const tmpDir = binds[1]!.split(':')[0]!;
      expect(fs.existsSync(path.join(tmpDir, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'models.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'system-prompt.md'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('APP_PORT 未设置时应使用默认端口 3000', async () => {
      delete process.env.APP_PORT;
      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
        conversationId: 'conv-456',
      };

      await service.createContainer('session-port', DEFAULT_CONFIG, piContext);

      const callArgs = mockDocker.createContainer.mock.calls[0]![0];
      expect(callArgs.Env).toEqual(
        expect.arrayContaining([
          'PERMISSION_CALLBACK_URL=http://host.docker.internal:3000/api/v1/agent-conversations/conv-456/tool-permission',
        ]),
      );

      const binds: string[] = callArgs.HostConfig.Binds;
      const tmpDir = binds[1]!.split(':')[0]!;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('conversationId 未提供时不应注入 PERMISSION_CALLBACK_URL', async () => {
      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
      };

      await service.createContainer('session-no-conv', DEFAULT_CONFIG, piContext);

      const callArgs = mockDocker.createContainer.mock.calls[0]![0];
      const permUrlEntry = (callArgs.Env as string[]).find((e: string) =>
        e.startsWith('PERMISSION_CALLBACK_URL='),
      );
      expect(permUrlEntry).toBeUndefined();

      const binds: string[] = callArgs.HostConfig.Binds;
      const tmpDir = binds[1]!.split(':')[0]!;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('仅注入存在的 LLM API 密钥到容器环境', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai';
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
      };

      await service.createContainer('session-keys', DEFAULT_CONFIG, piContext);

      const callArgs = mockDocker.createContainer.mock.calls[0]![0];
      const env: string[] = callArgs.Env;
      expect(env).toContain('OPENAI_API_KEY=sk-openai');
      expect(env.find((e: string) => e.startsWith('ANTHROPIC_API_KEY='))).toBeUndefined();
      expect(env.find((e: string) => e.startsWith('GOOGLE_API_KEY='))).toBeUndefined();

      const binds: string[] = callArgs.HostConfig.Binds;
      const tmpDir = binds[1]!.split(':')[0]!;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('ACP_TEST_FAKE_RUNTIME=1 时应跳过 pi-config 生成', async () => {
      process.env.ACP_TEST_FAKE_RUNTIME = '1';
      const fakeService = new DockerService(mockPiConfigGenerator);

      const piContext = {
        piConfigInput: { systemPrompt: 'test' },
        conversationId: 'conv-fake',
      };

      await fakeService.createContainer('session-fake', DEFAULT_CONFIG, piContext);

      expect(mockPiConfigGenerator.generateConfigBundle).not.toHaveBeenCalled();

      const callArgs = mockDocker.createContainer.mock.calls[0]![0];
      expect(callArgs.Env).toBeUndefined();
      expect(callArgs.HostConfig.Binds).toEqual([
        'sandbox-session-fake-workspace:/workspace',
      ]);
      expect(callArgs.HostConfig.ExtraHosts).toBeUndefined();

      delete process.env.ACP_TEST_FAKE_RUNTIME;
    });
  });
});
