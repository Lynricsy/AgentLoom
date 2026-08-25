import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginRecord } from '../../../../database/schema';
import type { StorageService } from '../../../../infrastructure/storage/storage.service';
import type { PluginSandboxService } from '../../../plugin/plugin-sandbox.service';
import { PluginNotFoundException } from '../../../plugin/plugin.exceptions';
import type { PluginService } from '../../../plugin/plugin.service';
import type {
  ExtendedRoutingMeta,
  RoutingCandidate,
} from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import { WasmPluginRouter } from '../wasm-plugin.strategy';

const TENANT_ID = 'tenant-1';
const PLUGIN_ID = 'com.example.custom-router';
const WASM_KEY = `tenants/${TENANT_ID}/plugins/${PLUGIN_ID}/1.0.0/plugin.wasm`;
const WASM_BYTES = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

function createCandidate(
  id: string,
  overrides: Partial<RoutingCandidate> = {},
): RoutingCandidate {
  const baseRoutingMeta: ExtendedRoutingMeta = {
    contextWindow: 16_000,
    costs: { input: 0.001, output: 0.002 },
    qualityRank: 80,
    avgLatencyMs: 500,
    maxInputTokens: 16_000,
    eloRating: 1_200,
  };

  return {
    id,
    modelConfigId: `${id}-config`,
    name: `${id}-name`,
    provider: 'openai',
    healthStatus: 'healthy',
    routingMeta: baseRoutingMeta,
    ...overrides,
  };
}

function createContext(
  overrides: Partial<RoutingContext> = {},
): RoutingContext {
  return {
    inputTokenCount: 4_000,
    tenantId: TENANT_ID,
    queryText: '路由测试',
    strategyConfig: { pluginId: PLUGIN_ID },
    ...overrides,
  };
}

function createPluginRecord(
  overrides: Partial<PluginRecord> = {},
): PluginRecord {
  return {
    id: 'plugin-db-id',
    tenantId: TENANT_ID,
    pluginId: PLUGIN_ID,
    version: '1.0.0',
    status: 'active',
    wasmBundleUrl: WASM_KEY,
    ...overrides,
  } as PluginRecord;
}

describe('WasmPluginRouter', () => {
  let router: WasmPluginRouter;
  let executeMock: ReturnType<typeof vi.fn>;
  let findPluginMock: ReturnType<typeof vi.fn>;
  let downloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeMock = vi.fn();
    findPluginMock = vi.fn().mockResolvedValue(createPluginRecord());
    downloadMock = vi
      .fn()
      .mockImplementation(async () => Readable.from([WASM_BYTES]));

    router = new WasmPluginRouter(
      { execute: executeMock } as unknown as PluginSandboxService,
      {
        findActiveWasmPluginForRouting: findPluginMock,
      } as unknown as PluginService,
      { download: downloadMock } as unknown as StorageService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('metadata', () => {
    it('name 为 wasm-plugin', () => {
      expect(router.name).toBe('wasm-plugin');
    });

    it('category 为 plugin', () => {
      expect(router.category).toBe('plugin');
    });

    it('requiresEmbedding 为 false', () => {
      expect(router.requiresEmbedding).toBe(false);
    });

    it('configSchema 校验 pluginId 必填且非空', () => {
      expect(
        router.configSchema.safeParse({ pluginId: 'com.example.router' })
          .success,
      ).toBe(true);
      expect(router.configSchema.safeParse({}).success).toBe(false);
      expect(router.configSchema.safeParse({ pluginId: '  ' }).success).toBe(
        false,
      );
    });

    it('configSchema 支持可选 pluginConfig', () => {
      expect(
        router.configSchema.safeParse({
          pluginId: 'com.example.router',
          pluginConfig: { threshold: 0.5 },
        }).success,
      ).toBe(true);
    });
  });

  describe('routeSingle - 成功路径', () => {
    it('按 strategyConfig.pluginId 解析插件并用下载的 buffer 调用沙箱', async () => {
      const candidates = [createCandidate('model-x')];
      const context = createContext({ taskCategory: 'chat' });

      executeMock.mockResolvedValueOnce({
        success: true,
        output: {
          selectedModelId: 'model-x',
          scores: [
            {
              modelId: 'model-x',
              modelName: 'model-x-name',
              provider: 'openai',
              score: 100,
              reasoning: '唯一候选',
            },
          ],
          reasoning: '唯一候选直接选择',
        },
        executionTimeMs: 5,
      });

      const decision = await router.routeSingle(candidates, context);

      expect(findPluginMock).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID);
      expect(downloadMock).toHaveBeenCalledWith(WASM_KEY);

      const [wasmBuf, fnName, inputArg, sandboxConfig, passedPluginId] =
        executeMock.mock.calls[0];
      expect(wasmBuf).toEqual(WASM_BYTES);
      expect(fnName).toBe('route');
      expect(sandboxConfig).toBeUndefined();
      expect(passedPluginId).toBe(PLUGIN_ID);

      const parsedInput = JSON.parse(inputArg as string);
      expect(parsedInput.candidates[0].id).toBe('model-x');
      expect(parsedInput.candidates[0].routingMeta.contextWindow).toBe(16_000);
      expect(parsedInput.context.taskCategory).toBe('chat');
      expect(decision.selectedModelId).toBe('model-x');
      expect(decision.reasoning).toBe('唯一候选直接选择');
    });

    it('strategyConfig.pluginConfig 会转成沙箱 config', async () => {
      executeMock.mockResolvedValueOnce({
        success: true,
        output: {
          selectedModelId: 'model-a',
          scores: [],
          reasoning: '插件决策',
        },
        executionTimeMs: 10,
      });

      await router.routeSingle(
        [createCandidate('model-a')],
        createContext({
          strategyConfig: {
            pluginId: PLUGIN_ID,
            pluginConfig: { model_preference: 'fast', threshold: 0.8 },
          },
        }),
      );

      const [, , , sandboxConfig] = executeMock.mock.calls[0];
      expect(sandboxConfig).toEqual({
        config: { model_preference: 'fast', threshold: '0.8' },
      });
    });
  });

  describe('routeSingle - 错误回退', () => {
    it('缺少 strategyConfig 时回退随机且不解析插件', async () => {
      const candidates = [
        createCandidate('model-a'),
        createCandidate('model-b'),
      ];

      const decision = await router.routeSingle(
        candidates,
        createContext({ strategyConfig: undefined }),
      );

      expect(findPluginMock).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
      expect(candidates.some((c) => c.id === decision.selectedModelId)).toBe(
        true,
      );
      expect(decision.reasoning).toContain('strategyConfig');
    });

    it('插件不存在时回退随机', async () => {
      findPluginMock.mockRejectedValueOnce(
        new PluginNotFoundException(PLUGIN_ID),
      );

      const decision = await router.routeSingle(
        [createCandidate('model-a')],
        createContext(),
      );

      expect(executeMock).not.toHaveBeenCalled();
      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.reasoning).toContain('wasm plugin error');
    });

    it('产物下载失败时回退随机', async () => {
      downloadMock.mockRejectedValueOnce(new Error('minio down'));

      const decision = await router.routeSingle(
        [createCandidate('model-a')],
        createContext(),
      );

      expect(executeMock).not.toHaveBeenCalled();
      expect(decision.reasoning).toContain('minio down');
    });

    it('插件行缺少 wasmBundleUrl 时回退随机', async () => {
      findPluginMock.mockResolvedValueOnce(
        createPluginRecord({ wasmBundleUrl: null }),
      );

      const decision = await router.routeSingle(
        [createCandidate('model-a')],
        createContext(),
      );

      expect(downloadMock).not.toHaveBeenCalled();
      expect(decision.reasoning).toContain('no wasm bundle');
    });

    it('WASM 执行抛错时回退随机', async () => {
      executeMock.mockRejectedValueOnce(new Error('WASM execution crashed'));
      const candidates = [
        createCandidate('model-a'),
        createCandidate('model-b'),
      ];

      const decision = await router.routeSingle(candidates, createContext());

      expect(candidates.some((c) => c.id === decision.selectedModelId)).toBe(
        true,
      );
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
      expect(decision.scores).toHaveLength(candidates.length);
    });

    it('WASM 返回非对象输出时回退随机', async () => {
      executeMock.mockResolvedValueOnce({
        success: true,
        output: 'not valid json object',
        executionTimeMs: 10,
      });

      const decision = await router.routeSingle(
        [createCandidate('model-a')],
        createContext(),
      );

      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
    });

    it('WASM 选择候选外模型时回退随机', async () => {
      executeMock.mockResolvedValueOnce({
        success: true,
        output: {
          selectedModelId: 'nonexistent-model',
          scores: [],
          reasoning: '选择了不存在的模型',
        },
        executionTimeMs: 10,
      });

      const candidates = [
        createCandidate('model-a'),
        createCandidate('model-b'),
      ];
      const decision = await router.routeSingle(candidates, createContext());

      expect(candidates.some((c) => c.id === decision.selectedModelId)).toBe(
        true,
      );
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
    });

    it('WASM 返回 success=false 时回退随机', async () => {
      executeMock.mockResolvedValueOnce({
        success: false,
        output: null,
        executionTimeMs: 10,
      });

      const decision = await router.routeSingle(
        [createCandidate('model-a')],
        createContext(),
      );

      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
    });

    it('WASM 输出缺少 selectedModelId 时回退随机', async () => {
      executeMock.mockResolvedValueOnce({
        success: true,
        output: { scores: [], reasoning: '无选择' },
        executionTimeMs: 10,
      });

      const decision = await router.routeSingle(
        [createCandidate('model-a')],
        createContext(),
      );

      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
    });

    it('回退 scores 为每个候选生成等分评分', async () => {
      const candidates = [
        createCandidate('model-a'),
        createCandidate('model-b'),
        createCandidate('model-c'),
      ];
      executeMock.mockRejectedValueOnce(new Error('crash'));

      const decision = await router.routeSingle(candidates, createContext());

      expect(decision.scores).toHaveLength(3);
      for (const score of decision.scores) {
        expect(score.score).toBe(50);
        expect(score.reasoning).toBeTruthy();
      }
    });
  });
});
