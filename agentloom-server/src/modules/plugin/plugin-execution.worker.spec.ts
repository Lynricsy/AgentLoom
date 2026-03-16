import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorageService } from '../../infrastructure/storage/storage.service';
import type { PluginSandboxService, SandboxConfig } from './plugin-sandbox.service';
import type { PluginService } from './plugin.service';
import {
  PluginExecutionWorker,
  type PluginExecutionJobData,
} from './plugin-execution.worker';
import {
  PluginExecutionTimeoutException,
  PluginNotFoundException,
  PluginPermissionDeniedException,
  PluginResourceExhaustedException,
} from './plugin.exceptions';

const mocks = vi.hoisted(() => ({
  createMockPluginService: () => ({
    findActiveByPluginId: vi.fn(),
  }),
  createMockSandboxService: () => ({
    execute: vi.fn(),
    buildSandboxConfig: vi.fn(),
  }),
  createMockStorageService: () => ({
    download: vi.fn(),
  }),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const createPluginRecord = (overrides?: Record<string, unknown>) => ({
  id: '44444444-4444-4444-4444-444444444444',
  pluginId: 'com.example.test',
  name: 'Test Plugin',
  version: '1.0.0',
  status: 'active',
  manifest: {
    id: 'com.example.test',
    name: 'Test Plugin',
    version: '1.0.0',
    wasmEntry: 'processText',
  },
  wasmBundleUrl: 'tenants/t1/plugins/com.example.test/1.0.0/plugin.wasm',
  ...overrides,
});

const createJob = (
  overrides?: Partial<PluginExecutionJobData>,
): Job<PluginExecutionJobData> =>
  ({
    id: 'job-1',
    data: {
      tenantId: TENANT_ID,
      executionId: '22222222-2222-2222-2222-222222222222',
      stepId: '33333333-3333-3333-3333-333333333333',
      pluginId: 'com.example.test',
      nodeType: 'text-processor',
      inputs: { text: 'hello' },
      config: {},
      ...overrides,
    },
    attemptsMade: 0,
  }) as unknown as Job<PluginExecutionJobData>;

describe('PluginExecutionWorker', () => {
  let worker: PluginExecutionWorker;
  let pluginService: ReturnType<typeof mocks.createMockPluginService>;
  let sandboxService: ReturnType<typeof mocks.createMockSandboxService>;
  let storageService: ReturnType<typeof mocks.createMockStorageService>;

  beforeEach(() => {
    pluginService = mocks.createMockPluginService();
    sandboxService = mocks.createMockSandboxService();
    storageService = mocks.createMockStorageService();

    worker = new PluginExecutionWorker(
      pluginService as unknown as PluginService,
      sandboxService as unknown as PluginSandboxService,
      storageService as unknown as StorageService,
    );

    vi.restoreAllMocks();
  });

  describe('process', () => {
    it('应执行完整的插件 WASM 工作流', async () => {
      const plugin = createPluginRecord();
      pluginService.findActiveByPluginId.mockResolvedValue(plugin);
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('fake-wasm-bytes')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({
        timeoutMs: 30_000,
        maxMemoryPages: 4096,
      });
      sandboxService.execute.mockResolvedValue({
        success: true,
        output: { result: 'ok' },
        executionTimeMs: 150,
      });

      const result = await worker.process(createJob());

      expect(result.status).toBe('completed');
      expect(result.outputs).toEqual({ result: 'ok' });
      expect(result.executionTimeMs).toBe(150);

      expect(pluginService.findActiveByPluginId).toHaveBeenCalledWith(
        'com.example.test',
        undefined,
        TENANT_ID,
      );
      expect(storageService.download).toHaveBeenCalledWith(
        'tenants/t1/plugins/com.example.test/1.0.0/plugin.wasm',
      );
      expect(sandboxService.buildSandboxConfig).toHaveBeenCalledWith(
        plugin.manifest,
      );
      expect(sandboxService.execute).toHaveBeenCalledWith(
        expect.any(Buffer),
        'processText',
        { nodeType: 'text-processor', inputs: { text: 'hello' }, config: {} },
        expect.objectContaining({ timeoutMs: 30_000, maxMemoryPages: 4096 }),
        'com.example.test',
      );
    });

    it('插件无 wasmBundleUrl 时应返回跳过结果', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord({ wasmBundleUrl: null }),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('completed');
      expect(result.outputs).toEqual({});
      expect(result.message).toContain('com.example.test');
      expect(result.message).toContain('跳过执行');
      expect(storageService.download).not.toHaveBeenCalled();
      expect(sandboxService.execute).not.toHaveBeenCalled();
    });

    it('插件未找到时应抛出 PluginNotFoundException', async () => {
      pluginService.findActiveByPluginId.mockRejectedValue(
        new PluginNotFoundException('com.example.test'),
      );

      await expect(worker.process(createJob())).rejects.toThrow(
        PluginNotFoundException,
      );
    });

    it('WASM 下载失败时应抛出错误', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
      storageService.download.mockRejectedValue(new Error('MinIO 连接失败'));

      await expect(worker.process(createJob())).rejects.toThrow(
        '无法下载插件 "com.example.test" 的 WASM bundle',
      );
    });

    it('沙箱执行超时时应传播 PluginExecutionTimeoutException', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginExecutionTimeoutException('com.example.test'),
      );

      await expect(worker.process(createJob())).rejects.toThrow(
        PluginExecutionTimeoutException,
      );
    });

    it('沙箱内存超限时应传播 PluginResourceExhaustedException', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginResourceExhaustedException('com.example.test'),
      );

      await expect(worker.process(createJob())).rejects.toThrow(
        PluginResourceExhaustedException,
      );
    });

    it('沙箱权限拒绝时应传播 PluginPermissionDeniedException', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginPermissionDeniedException('com.example.test', 'evil.com'),
      );

      await expect(worker.process(createJob())).rejects.toThrow(
        PluginPermissionDeniedException,
      );
    });

    it('执行失败时应返回 failed 状态', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockResolvedValue({
        success: false,
        output: { error: 'plugin returned error' },
        executionTimeMs: 50,
      });

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.outputs).toEqual({ error: 'plugin returned error' });
    });

    describe('函数名解析', () => {
      beforeEach(() => {
        storageService.download.mockResolvedValue(
          Readable.from([Buffer.from('wasm')]),
        );
        sandboxService.buildSandboxConfig.mockReturnValue({});
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: {},
          executionTimeMs: 10,
        });
      });

      it('config.functionName 优先级最高', async () => {
        pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());

        await worker.process(
          createJob({ config: { functionName: 'customFunc' } }),
        );

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          'customFunc',
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      });

      it('无 config.functionName 时使用 manifest.wasmEntry', async () => {
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord({
            manifest: {
              id: 'com.example.test',
              wasmEntry: 'manifestEntry',
            },
          }),
        );

        await worker.process(createJob());

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          'manifestEntry',
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      });

      it('无 wasmEntry 时回退到 nodeType', async () => {
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord({
            manifest: { id: 'com.example.test' },
          }),
        );

        await worker.process(createJob({ nodeType: 'data-transform' }));

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          'data-transform',
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      });

      it('nodeType 为空时回退到 run', async () => {
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord({
            manifest: { id: 'com.example.test' },
          }),
        );

        await worker.process(createJob({ nodeType: '' }));

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          'run',
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      });
    });

    describe('config 覆盖', () => {
      beforeEach(() => {
        pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
        storageService.download.mockResolvedValue(
          Readable.from([Buffer.from('wasm')]),
        );
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: {},
          executionTimeMs: 10,
        });
      });

      it('应从 config 提取 timeoutMs 覆盖', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          timeoutMs: 30_000,
          maxMemoryPages: 4096,
        });

        await worker.process(createJob({ config: { timeoutMs: 5000 } }));

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ timeoutMs: 5000 }),
          expect.anything(),
        );
      });

      it('应从 config 提取 maxMemoryPages 覆盖', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          timeoutMs: 30_000,
          maxMemoryPages: 4096,
        });

        await worker.process(
          createJob({ config: { maxMemoryPages: 2048 } }),
        );

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ maxMemoryPages: 2048 }),
          expect.anything(),
        );
      });

      it('应从 config 提取 allowedHosts 覆盖', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({});

        await worker.process(
          createJob({
            config: { allowedHosts: ['api.example.com', 'cdn.example.com'] },
          }),
        );

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            allowedHosts: ['api.example.com', 'cdn.example.com'],
          }),
          expect.anything(),
        );
      });

      it('应忽略非法类型的 config 覆盖值', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          timeoutMs: 30_000,
        });

        await worker.process(
          createJob({
            config: { timeoutMs: 'not-a-number', maxMemoryPages: null },
          }),
        );

        const mergedConfig = sandboxService.execute.mock.calls[0][3] as SandboxConfig;
        expect(mergedConfig.timeoutMs).toBe(30_000);
        expect(mergedConfig.maxMemoryPages).toBeUndefined();
      });
    });

    describe('输出标准化', () => {
      beforeEach(() => {
        pluginService.findActiveByPluginId.mockResolvedValue(createPluginRecord());
        storageService.download.mockResolvedValue(
          Readable.from([Buffer.from('wasm')]),
        );
        sandboxService.buildSandboxConfig.mockReturnValue({});
      });

      it('对象输出应直接返回', async () => {
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: { key: 'value', nested: { a: 1 } },
          executionTimeMs: 10,
        });

        const result = await worker.process(createJob());
        expect(result.outputs).toEqual({ key: 'value', nested: { a: 1 } });
      });

      it('字符串输出应包装为 { result }', async () => {
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: 'plain text',
          executionTimeMs: 10,
        });

        const result = await worker.process(createJob());
        expect(result.outputs).toEqual({ result: 'plain text' });
      });

      it('null 输出应返回空对象', async () => {
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: null,
          executionTimeMs: 10,
        });

        const result = await worker.process(createJob());
        expect(result.outputs).toEqual({});
      });

      it('undefined 输出应返回空对象', async () => {
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: undefined,
          executionTimeMs: 10,
        });

        const result = await worker.process(createJob());
        expect(result.outputs).toEqual({});
      });

      it('数组输出应包装为 { result }', async () => {
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: [1, 2, 3],
          executionTimeMs: 10,
        });

        const result = await worker.process(createJob());
        expect(result.outputs).toEqual({ result: [1, 2, 3] });
      });
    });
  });

  describe('onFailed', () => {
    it('应记录结构化错误信息但不抛出异常', () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      const job = createJob();
      const error = new Error('test failure');

      expect(() => worker.onFailed(job, error)).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logMessage = errorSpy.mock.calls[0][0] as string;
      expect(logMessage).toContain('com.example.test');
      expect(logMessage).toContain('test failure');
      expect(logMessage).toContain('text-processor');
    });
  });
});
