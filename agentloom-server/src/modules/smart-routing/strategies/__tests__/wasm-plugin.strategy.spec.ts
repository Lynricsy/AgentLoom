import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginSandboxService } from '../../../plugin/plugin-sandbox.service';
import type {
  ExtendedRoutingMeta,
  RoutingCandidate,
} from '../../core/routing-candidate';
import type { RoutingContext } from '../../core/routing-context';
import { WasmPluginRouter } from '../wasm-plugin.strategy';

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
    tenantId: 'tenant-1',
    queryText: '路由测试',
    ...overrides,
  };
}

function createMockSandboxService(): {
  service: PluginSandboxService;
  executeMock: ReturnType<typeof vi.fn>;
} {
  const executeMock = vi.fn();

  return {
    service: { execute: executeMock } as unknown as PluginSandboxService,
    executeMock,
  };
}

describe('WasmPluginRouter', () => {
  let router: WasmPluginRouter;
  let executeMock: ReturnType<typeof vi.fn>;

  const wasmBuffer = new Uint8Array([0, 1, 2, 3]);
  const pluginId = 'com.example.custom-router';

  beforeEach(() => {
    const mock = createMockSandboxService();
    executeMock = mock.executeMock;
    router = new WasmPluginRouter(mock.service, wasmBuffer, {
      pluginId,
    });
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

    it('configSchema 校验 pluginId 必填', () => {
      const valid = router.configSchema.safeParse({
        pluginId: 'com.example.router',
      });
      expect(valid.success).toBe(true);

      const invalid = router.configSchema.safeParse({});
      expect(invalid.success).toBe(false);
    });

    it('configSchema 支持可选 pluginConfig', () => {
      const result = router.configSchema.safeParse({
        pluginId: 'com.example.router',
        pluginConfig: { threshold: 0.5 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('routeSingle - 成功路径', () => {
    it('将候选和上下文序列化为 JSON 传入 PluginSandboxService', async () => {
      const candidates = [
        createCandidate('model-a'),
        createCandidate('model-b'),
      ];
      const context = createContext();

      executeMock.mockResolvedValueOnce({
        success: true,
        output: {
          selectedModelId: 'model-a',
          scores: [
            {
              modelId: 'model-a',
              modelName: 'model-a-name',
              provider: 'openai',
              score: 90,
              reasoning: '最佳匹配',
            },
            {
              modelId: 'model-b',
              modelName: 'model-b-name',
              provider: 'openai',
              score: 60,
              reasoning: '备选',
            },
          ],
          reasoning: '基于插件自定义逻辑选择 model-a',
        },
        executionTimeMs: 15,
      });

      const decision = await router.routeSingle(candidates, context);

      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.scores).toHaveLength(2);
      expect(decision.reasoning).toBe('基于插件自定义逻辑选择 model-a');
    });

    it('正确传入序列化的 candidates 和 context 到 execute()', async () => {
      const candidates = [createCandidate('model-x')];
      const context = createContext({
        queryText: '测试序列化',
        taskCategory: 'chat',
        historicalMetrics: {
          'model-x': {
            successRate: 0.95,
            avgLatencyMs: 200,
            avgTokenUsage: 1500,
          },
        },
      });

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

      await router.routeSingle(candidates, context);

      expect(executeMock).toHaveBeenCalledTimes(1);
      const [wasmBuf, fnName, inputArg, _sandboxConfig, pId] =
        executeMock.mock.calls[0];
      expect(wasmBuf).toBe(wasmBuffer);
      expect(fnName).toBe('route');
      expect(pId).toBe(pluginId);

      const parsedInput = JSON.parse(inputArg as string);
      expect(parsedInput.candidates).toHaveLength(1);
      expect(parsedInput.candidates[0].id).toBe('model-x');
      expect(parsedInput.candidates[0].routingMeta.contextWindow).toBe(16_000);
      expect(parsedInput.candidates[0].routingMeta.costs).toEqual({
        input: 0.001,
        output: 0.002,
      });
      expect(parsedInput.context.inputTokenCount).toBe(4_000);
      expect(parsedInput.context.queryText).toBe('测试序列化');
      expect(parsedInput.context.taskCategory).toBe('chat');
      expect(parsedInput.context.historicalMetrics).toEqual({
        'model-x': {
          successRate: 0.95,
          avgLatencyMs: 200,
          avgTokenUsage: 1500,
        },
      });
    });

    it('使用 pluginConfig 传入沙箱 config', async () => {
      const pluginConfig = { model_preference: 'fast', threshold: '0.8' };
      const routerWithConfig = new WasmPluginRouter(
        { execute: executeMock } as unknown as PluginSandboxService,
        wasmBuffer,
        { pluginId, pluginConfig },
      );

      const candidates = [createCandidate('model-a')];
      executeMock.mockResolvedValueOnce({
        success: true,
        output: {
          selectedModelId: 'model-a',
          scores: [
            {
              modelId: 'model-a',
              modelName: 'model-a-name',
              provider: 'openai',
              score: 100,
              reasoning: '选择',
            },
          ],
          reasoning: '插件决策',
        },
        executionTimeMs: 10,
      });

      await routerWithConfig.routeSingle(candidates, createContext());

      const [, , , sandboxConfig] = executeMock.mock.calls[0];
      expect(sandboxConfig).toEqual({
        config: { model_preference: 'fast', threshold: '0.8' },
      });
    });
  });

  describe('routeSingle - 错误回退', () => {
    it('WASM 执行失败时回退到随机候选', async () => {
      const candidates = [
        createCandidate('model-a'),
        createCandidate('model-b'),
      ];
      executeMock.mockRejectedValueOnce(new Error('WASM execution crashed'));

      const decision = await router.routeSingle(candidates, createContext());

      expect(candidates.some((c) => c.id === decision.selectedModelId)).toBe(
        true,
      );
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
      expect(decision.scores).toHaveLength(candidates.length);
    });

    it('WASM 返回无效 JSON 输出时回退到随机候选', async () => {
      executeMock.mockResolvedValueOnce({
        success: true,
        output: 'not valid json object',
        executionTimeMs: 10,
      });

      const candidates = [createCandidate('model-a')];
      const decision = await router.routeSingle(candidates, createContext());

      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
    });

    it('WASM 返回不在候选列表中的 selectedModelId 时回退', async () => {
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

    it('WASM 返回 success=false 时回退到随机候选', async () => {
      executeMock.mockResolvedValueOnce({
        success: false,
        output: null,
        executionTimeMs: 10,
      });

      const candidates = [createCandidate('model-a')];
      const decision = await router.routeSingle(candidates, createContext());

      expect(decision.selectedModelId).toBe('model-a');
      expect(decision.reasoning.toLowerCase()).toContain('wasm');
    });

    it('WASM 返回缺少 selectedModelId 的输出时回退', async () => {
      executeMock.mockResolvedValueOnce({
        success: true,
        output: { scores: [], reasoning: '无选择' },
        executionTimeMs: 10,
      });

      const candidates = [createCandidate('model-a')];
      const decision = await router.routeSingle(candidates, createContext());

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

  describe('routeSingle - 不传 pluginConfig 时不附加 sandboxConfig.config', () => {
    it('pluginConfig 未设置时 sandboxConfig 无 config 字段', async () => {
      const candidates = [createCandidate('model-a')];
      executeMock.mockResolvedValueOnce({
        success: true,
        output: {
          selectedModelId: 'model-a',
          scores: [
            {
              modelId: 'model-a',
              modelName: 'model-a-name',
              provider: 'openai',
              score: 100,
              reasoning: '选择',
            },
          ],
          reasoning: '决策',
        },
        executionTimeMs: 5,
      });

      await router.routeSingle(candidates, createContext());

      const [, , , sandboxConfig] = executeMock.mock.calls[0];
      expect(sandboxConfig).toBeUndefined();
    });
  });
});
