import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { Job } from 'bullmq';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../database/database.module';
import type { StorageService } from '../../infrastructure/storage/storage.service';
import type {
  PluginSandboxService,
  SandboxConfig,
} from './plugin-sandbox.service';
import type { PluginUsageService } from './plugin-usage.service';
import type { PluginService, PluginUsageSourceContext } from './plugin.service';
import {
  PluginExecutionWorker,
  type PluginExecutionJobData,
} from './plugin-execution.worker';
import {
  PluginExecutionTimeoutException,
  PluginInactiveException,
  PluginNotFoundException,
  PluginPermissionDeniedException,
  PluginResourceExhaustedException,
  PluginSandboxException,
} from './plugin.exceptions';

const mocks = vi.hoisted(() => ({
  createMockPluginService: () => ({
    findActiveByPluginId: vi.fn(),
    resolveUsageSourceContext: vi.fn(),
  }),
  createMockSandboxService: () => ({
    execute: vi.fn(),
    buildSandboxConfig: vi.fn(),
  }),
  createMockStorageService: () => ({
    download: vi.fn(),
  }),
  createMockPluginUsageService: () => ({
    recordUsage: vi.fn().mockResolvedValue({ id: 'usage-record-id' }),
  }),
  createMockStepStateMachine: () => ({
    updateStepStatus: vi.fn().mockResolvedValue({ id: 'step-id' }),
  }),
  createMockNodeScheduler: () => ({
    onNodeCompleted: vi.fn().mockResolvedValue(undefined),
    onNodeFailed: vi.fn().mockResolvedValue(undefined),
  }),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SOURCE_TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOURCE_ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOURCE_PLUGIN_DB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SOURCE_LISTING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const createUsageSourceContext = (
  overrides: Partial<PluginUsageSourceContext> = {},
): PluginUsageSourceContext => ({
  ...createUsageSourceContextBase(),
  ...overrides,
});

const createUsageSourceContextBase = (): PluginUsageSourceContext => ({
  sourceTenantId: SOURCE_TENANT_ID,
  sourceOrgId: SOURCE_ORG_ID,
  sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
  sourcePluginId: 'com.publisher.plugin',
  sourceListingId: SOURCE_LISTING_ID,
  pricingModel: 'per_execution' as const,
  billingAmount: '0.25000000' as string | null,
  currency: 'USD' as const,
});

const createPluginRecord = (overrides?: Record<string, unknown>) => ({
  id: '44444444-4444-4444-4444-444444444444',
  pluginId: 'com.example.test',
  name: 'Test Plugin',
  version: '1.0.0',
  status: 'active',
  manifest: {
    id: 'com.example.test',
    wasmEntry: 'dist/plugin.wasm',
    permissions: ['network:outbound'],
    sandbox: {
      allowedHosts: ['api.example.com', 'cdn.example.com'],
    },
  },
  metadata: {},
  wasmBundleUrl: 'tenants/t1/plugins/com.example.test/1.0.0/plugin.wasm',
  ...overrides,
});

const createGeneratedPrivatePluginRecord = (
  overrides?: Record<string, unknown>,
) =>
  createPluginRecord({
    pluginId: 'com.agentloom.generated.app-1.tool-guided-intake-analysis',
    manifest: {
      id: 'com.agentloom.generated.app-1.tool-guided-intake-analysis',
      permissions: [],
    },
    metadata: {
      source: 'generated-app-private-plugin',
      activationScope: 'tenant-private',
      toolId: 'tool-guided-intake-analysis',
    },
    wasmBundleUrl: null,
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
  let pluginUsageService: ReturnType<typeof mocks.createMockPluginUsageService>;
  let stepStateMachine: ReturnType<typeof mocks.createMockStepStateMachine>;
  let nodeScheduler: ReturnType<typeof mocks.createMockNodeScheduler>;
  let moduleRef: { get: ReturnType<typeof vi.fn> };
  let db: { transaction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    pluginService = mocks.createMockPluginService();
    sandboxService = mocks.createMockSandboxService();
    storageService = mocks.createMockStorageService();
    pluginUsageService = mocks.createMockPluginUsageService();
    stepStateMachine = mocks.createMockStepStateMachine();
    nodeScheduler = mocks.createMockNodeScheduler();
    moduleRef = {
      get: vi.fn((token: unknown) => {
        const tokenName =
          typeof token === 'function' ? token.name : String(token);

        if (tokenName === 'StepStateMachineService') {
          return stepStateMachine;
        }

        if (tokenName === 'NodeSchedulerService') {
          return nodeScheduler;
        }

        throw new Error(`Unexpected moduleRef token: ${tokenName}`);
      }),
    };
    db = {
      transaction: vi.fn(async (callback) =>
        callback({
          execute: vi.fn().mockResolvedValue(undefined),
        }),
      ),
    };

    worker = new PluginExecutionWorker(
      db as unknown as DrizzleDB,
      pluginService as unknown as PluginService,
      sandboxService as unknown as PluginSandboxService,
      storageService as unknown as StorageService,
      pluginUsageService as unknown as PluginUsageService,
      moduleRef as unknown as ModuleRef,
    );

    pluginService.resolveUsageSourceContext.mockResolvedValue(
      createUsageSourceContext(),
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
        allowedHosts: ['api.example.com', 'cdn.example.com'],
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
      expect(sandboxService.execute).toHaveBeenCalledWith(
        expect.any(Buffer),
        'execute',
        { nodeType: 'text-processor', inputs: { text: 'hello' }, config: {} },
        expect.objectContaining({
          timeoutMs: 30_000,
          maxMemoryPages: 4096,
          allowedHosts: ['api.example.com', 'cdn.example.com'],
        }),
        'com.example.test',
      );
      expect(pluginService.resolveUsageSourceContext).toHaveBeenCalledWith(
        plugin,
      );
    });

    it('成功执行后应记录插件使用量', async () => {
      const plugin = createPluginRecord();
      pluginService.findActiveByPluginId.mockResolvedValue(plugin);
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockResolvedValue({
        success: true,
        output: { result: 'ok' },
        executionTimeMs: 150,
      });

      const job = createJob();

      await worker.process(job);

      expect(pluginService.resolveUsageSourceContext).toHaveBeenCalledWith(
        plugin,
      );
      expect(pluginUsageService.recordUsage).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        pluginDbId: plugin.id,
        pluginId: plugin.pluginId,
        executionId: job.data.executionId,
        stepId: job.data.stepId,
        executionDurationMs: '150',
        sourceTenantId: SOURCE_TENANT_ID,
        sourceOrgId: SOURCE_ORG_ID,
        sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
        sourcePluginId: 'com.publisher.plugin',
        sourceListingId: SOURCE_LISTING_ID,
        billingAmount: '0.25000000',
        currency: 'USD',
        executedBy: null,
        inputTokens: null,
        outputTokens: null,
        metadata: {
          nodeType: 'text-processor',
          pricingModel: 'per_execution',
        },
      });
    });

    it('免费插件成功执行时应记录 null billingAmount', async () => {
      const plugin = createPluginRecord();
      const freeSourceContext: PluginUsageSourceContext = {
        sourceTenantId: SOURCE_TENANT_ID,
        sourceOrgId: SOURCE_ORG_ID,
        sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
        sourcePluginId: 'com.publisher.plugin',
        sourceListingId: null,
        pricingModel: 'free',
        billingAmount: null,
        currency: 'USD',
      };

      pluginService.findActiveByPluginId.mockResolvedValue(plugin);
      pluginService.resolveUsageSourceContext.mockResolvedValue(
        freeSourceContext,
      );
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockResolvedValue({
        success: true,
        output: { result: 'ok' },
        executionTimeMs: 80,
      });

      const job = createJob();

      await worker.process(job);

      expect(pluginUsageService.recordUsage).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        pluginDbId: plugin.id,
        pluginId: plugin.pluginId,
        executionId: job.data.executionId,
        stepId: job.data.stepId,
        executionDurationMs: '80',
        sourceTenantId: SOURCE_TENANT_ID,
        sourceOrgId: SOURCE_ORG_ID,
        sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
        sourcePluginId: 'com.publisher.plugin',
        sourceListingId: null,
        billingAmount: null,
        currency: 'USD',
        executedBy: null,
        inputTokens: null,
        outputTokens: null,
        metadata: {
          nodeType: 'text-processor',
          pricingModel: 'free',
        },
      });
    });

    it('记录使用量失败时不应影响执行成功', async () => {
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});

      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockResolvedValue({
        success: true,
        output: { result: 'ok' },
        executionTimeMs: 150,
      });
      pluginUsageService.recordUsage.mockRejectedValueOnce(
        new Error('usage failed'),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('completed');
      expect(result.outputs).toEqual({ result: 'ok' });
      expect(pluginService.resolveUsageSourceContext).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          'Failed to record plugin usage: usage failed',
          { jobId: 'job-1' },
        );
      });
    });

    it('执行抛错时应收口为 failed 结果且不记录插件使用量', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginSandboxException('com.example.test', 'sandbox crashed'),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('sandbox crashed');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        TENANT_ID,
      );
      expect(pluginUsageService.recordUsage).not.toHaveBeenCalled();
    });

    it('Generated App 私有插件无 wasmBundleUrl 时应走受控 fallback', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createGeneratedPrivatePluginRecord(),
      );

      const result = await worker.process(
        createJob({
          pluginId: 'com.agentloom.generated.app-1.tool-guided-intake-analysis',
          nodeType: 'tool-guided-intake-analysis',
          inputs: {
            input: {
              chiefComplaint: '头痛三天',
              duration: '3 天',
            },
          },
        }),
      );

      expect(result.status).toBe('completed');
      expect(result.outputs.analysis).toEqual(
        expect.objectContaining({
          riskLevel: expect.any(String),
          score: expect.any(Number),
          generatedPrivatePlugin: true,
          nodeType: 'tool-guided-intake-analysis',
        }),
      );
      expect(result.outputs['analysis-out']).toEqual(result.outputs.analysis);
      expect(result.message).toContain('deterministic fallback');
      expect(storageService.download).not.toHaveBeenCalled();
      expect(sandboxService.execute).not.toHaveBeenCalled();
      expect(stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        '33333333-3333-3333-3333-333333333333',
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            analysis: expect.any(Object),
            'exec-out': { triggered: true },
          }),
          checkpointData: expect.objectContaining({
            runtime: 'generated-private-deterministic',
          }),
        }),
      );
      expect(nodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        TENANT_ID,
      );
    });

    it('Generated App 私有插件有 wasmBundleUrl 时应调用沙箱且不走 fallback', async () => {
      const plugin = createGeneratedPrivatePluginRecord({
        wasmBundleUrl:
          'generated-apps/app-1/plugins/tool-guided-intake-analysis.wasm',
        manifest: {
          id: 'com.agentloom.generated.app-1.tool-guided-intake-analysis',
          wasmEntry: 'dist/plugin.wasm',
          permissions: [],
          sandbox: {
            allowedHosts: [],
            timeoutMs: 3000,
            maxMemoryPages: 256,
          },
        },
      });
      pluginService.findActiveByPluginId.mockResolvedValue(plugin);
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('generated-private-wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({
        timeoutMs: 30_000,
        maxMemoryPages: 4096,
        allowedHosts: [],
      });
      sandboxService.execute.mockResolvedValue({
        success: true,
        output: {
          analysis: {
            riskLevel: 'follow-up',
            score: 42,
            generatedPrivatePlugin: true,
            runtime: 'wasm-extism',
          },
          'analysis-out': {
            riskLevel: 'follow-up',
            score: 42,
            generatedPrivatePlugin: true,
            runtime: 'wasm-extism',
          },
        },
        executionTimeMs: 21,
      });

      const result = await worker.process(
        createJob({
          pluginId: 'com.agentloom.generated.app-1.tool-guided-intake-analysis',
          nodeType: 'tool-guided-intake-analysis',
          inputs: { input: { chiefComplaint: '头痛三天' } },
          config: { mode: 'screening' },
        }),
      );

      expect(result.status).toBe('completed');
      expect(result.outputs.analysis).toEqual(
        expect.objectContaining({
          riskLevel: 'follow-up',
          runtime: 'wasm-extism',
        }),
      );
      expect(result.message).toBeUndefined();
      expect(storageService.download).toHaveBeenCalledWith(
        'generated-apps/app-1/plugins/tool-guided-intake-analysis.wasm',
      );
      expect(sandboxService.execute).toHaveBeenCalledWith(
        expect.any(Buffer),
        'execute',
        {
          nodeType: 'tool-guided-intake-analysis',
          inputs: { input: { chiefComplaint: '头痛三天' } },
          config: { mode: 'screening' },
        },
        expect.objectContaining({
          timeoutMs: 30_000,
          maxMemoryPages: 4096,
          allowedHosts: [],
        }),
        'com.agentloom.generated.app-1.tool-guided-intake-analysis',
      );
      expect(pluginService.resolveUsageSourceContext).toHaveBeenCalledWith(
        plugin,
      );
      expect(stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        '33333333-3333-3333-3333-333333333333',
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            analysis: expect.any(Object),
            'exec-out': { triggered: true },
          }),
          checkpointData: expect.objectContaining({
            runtime: 'wasm-extism',
          }),
        }),
      );
    });

    it('Generated App 私有插件无 wasmBundleUrl 但 metadata guard 不匹配时应 fail-closed', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createGeneratedPrivatePluginRecord({
          metadata: {
            source: 'generated-app-private-plugin',
            activationScope: 'tenant-private',
            toolId: 'tool-other',
          },
        }),
      );

      const result = await worker.process(
        createJob({
          pluginId: 'com.agentloom.generated.app-1.tool-guided-intake-analysis',
          nodeType: 'tool-guided-intake-analysis',
          inputs: { input: { chiefComplaint: '头痛三天' } },
        }),
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('无 WASM bundle');
      expect(storageService.download).not.toHaveBeenCalled();
      expect(sandboxService.execute).not.toHaveBeenCalled();
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        TENANT_ID,
      );
    });

    it('普通插件无 wasmBundleUrl 时应 fail-closed', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord({ wasmBundleUrl: null }),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('无 WASM bundle');

      expect(storageService.download).not.toHaveBeenCalled();
      expect(sandboxService.execute).not.toHaveBeenCalled();
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        TENANT_ID,
      );
    });

    it('插件未找到时应收口为 failed 结果', async () => {
      pluginService.findActiveByPluginId.mockRejectedValue(
        new PluginNotFoundException('com.example.test'),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('com.example.test');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalled();
    });

    it('插件未激活时应收口为 failed 结果', async () => {
      pluginService.findActiveByPluginId.mockRejectedValue(
        new PluginInactiveException('plugin-record-id'),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('plugin-record-id');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalled();
    });

    it('WASM 下载失败时应收口为 failed 结果', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
      storageService.download.mockRejectedValue(new Error('MinIO 连接失败'));

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('MinIO 连接失败');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalled();
    });

    it('沙箱执行超时时应收口为 failed 结果', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginExecutionTimeoutException('com.example.test', 30_000),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('com.example.test');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalled();
    });

    it('沙箱内存超限时应收口为 failed 结果', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginResourceExhaustedException('com.example.test', '内存'),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('内存');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalled();
    });

    it('沙箱权限拒绝时应收口为 failed 结果', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('wasm')]),
      );
      sandboxService.buildSandboxConfig.mockReturnValue({});
      sandboxService.execute.mockRejectedValue(
        new PluginPermissionDeniedException('com.example.test', 'evil.com'),
      );

      const result = await worker.process(createJob());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('evil.com');
      expect(nodeScheduler.onNodeFailed).toHaveBeenCalled();
    });

    it('执行失败时应返回 failed 状态', async () => {
      pluginService.findActiveByPluginId.mockResolvedValue(
        createPluginRecord(),
      );
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
      expect(pluginService.resolveUsageSourceContext).not.toHaveBeenCalled();
      expect(pluginUsageService.recordUsage).not.toHaveBeenCalled();
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
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord(),
        );

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

      it('无自定义 functionName 时回退到 execute', async () => {
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord(),
        );

        await worker.process(createJob());

        expect(sandboxService.execute).toHaveBeenCalledWith(
          expect.any(Buffer),
          'execute',
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      });
    });

    describe('config 收紧', () => {
      beforeEach(() => {
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord(),
        );
        storageService.download.mockResolvedValue(
          Readable.from([Buffer.from('wasm')]),
        );
        sandboxService.execute.mockResolvedValue({
          success: true,
          output: {},
          executionTimeMs: 10,
        });
      });

      it('应允许 runtime config 收紧 timeoutMs', async () => {
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

      it('不应允许 runtime config 放宽 timeoutMs', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({ timeoutMs: 5000 });

        await worker.process(createJob({ config: { timeoutMs: 30_000 } }));

        const mergedConfig = sandboxService.execute.mock
          .calls[0][3] as SandboxConfig;
        expect(mergedConfig.timeoutMs).toBe(5000);
      });

      it('应允许 runtime config 收紧 maxMemoryPages', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          maxMemoryPages: 4096,
        });

        await worker.process(createJob({ config: { maxMemoryPages: 2048 } }));

        const mergedConfig = sandboxService.execute.mock
          .calls[0][3] as SandboxConfig;
        expect(mergedConfig.maxMemoryPages).toBe(2048);
      });

      it('不应允许 runtime config 放宽 maxMemoryPages', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          maxMemoryPages: 1024,
        });

        await worker.process(createJob({ config: { maxMemoryPages: 4096 } }));

        const mergedConfig = sandboxService.execute.mock
          .calls[0][3] as SandboxConfig;
        expect(mergedConfig.maxMemoryPages).toBe(1024);
      });

      it('runtime allowedHosts 只能收紧 manifest 白名单', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          allowedHosts: ['api.example.com', 'cdn.example.com'],
        });

        await worker.process(
          createJob({
            config: { allowedHosts: ['api.example.com', 'evil.example.com'] },
          }),
        );

        const mergedConfig = sandboxService.execute.mock
          .calls[0][3] as SandboxConfig;
        expect(mergedConfig.allowedHosts).toEqual(['api.example.com']);
      });

      it('manifest 未开放网络时 runtime 也不能扩张 allowedHosts', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({ allowedHosts: [] });

        await worker.process(
          createJob({ config: { allowedHosts: ['api.example.com'] } }),
        );

        const mergedConfig = sandboxService.execute.mock
          .calls[0][3] as SandboxConfig;
        expect(mergedConfig.allowedHosts).toEqual([]);
      });

      it('应忽略非法类型的 runtime 覆盖值', async () => {
        sandboxService.buildSandboxConfig.mockReturnValue({
          timeoutMs: 30_000,
          maxMemoryPages: 4096,
          allowedHosts: ['api.example.com'],
        });

        await worker.process(
          createJob({
            config: {
              timeoutMs: 'not-a-number',
              maxMemoryPages: null,
              allowedHosts: [1, 'api.example.com'],
            } as unknown as Record<string, unknown>,
          }),
        );

        const mergedConfig = sandboxService.execute.mock
          .calls[0][3] as SandboxConfig;
        expect(mergedConfig.timeoutMs).toBe(30_000);
        expect(mergedConfig.maxMemoryPages).toBe(4096);
        expect(mergedConfig.allowedHosts).toEqual(['api.example.com']);
      });
    });

    describe('输出标准化', () => {
      beforeEach(() => {
        pluginService.findActiveByPluginId.mockResolvedValue(
          createPluginRecord(),
        );
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

    it('job 缺失时也应安全记录错误', () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      expect(() =>
        worker.onFailed(undefined, new Error('missing job')),
      ).not.toThrow();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logMessage = errorSpy.mock.calls[0][0] as string;
      expect(logMessage).toContain('missing job');
    });
  });
});
