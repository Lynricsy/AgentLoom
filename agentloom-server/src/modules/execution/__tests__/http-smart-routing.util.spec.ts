import { describe, expect, it } from 'vitest';
import {
  buildHttpToolAuthHeaders,
  buildHttpToolAuthQuery,
  buildHttpToolRequestInput,
  extractHttpToolDynamicRequest,
  extractHttpToolHeaders,
  extractHttpToolQuery,
  resolveHttpToolRequestBody,
} from '../http-tool-request.util';
import {
  collectModelConfigIds,
  estimateTokenCount,
  extractMcpServerConfigIds,
  extractModelConfigIds,
  extractSmartRoutingContext,
  extractSmartRoutingQueryText,
  extractSmartRoutingTaskCategory,
  extractStructuredModelConfigIds,
  findFirstStringByKeys,
  findSmartRoutingContext,
  isFallbackChainStrategy,
  isSmartRoutingRuntimeContext,
  mapRoutingDecisionScores,
  normalizeSmartRoutingStrategyName,
  resolveSmartRoutingStrategyConfig,
  resolveSmartRoutingStrategyValue,
} from '../smart-routing-input.util';

describe('http-tool-request.util', () => {
  it('动态 headers/query 覆盖静态和 auth，动态 body 优先', () => {
    expect(
      buildHttpToolRequestInput(
        {
          headers: [
            { key: 'Accept', value: 'static' },
            { key: 'X-Static', value: 'yes' },
          ],
          queryParams: [
            { key: 'page', value: '1' },
            { key: 'enabled', value: 'true' },
          ],
          authType: 'api-key',
          authConfig: { keyName: 'X-Key', keyValue: 'secret' },
          body: '{"static":true}',
        },
        {
          'request-in': {
            headers: { Accept: 'dynamic', Count: 3 },
            query: { page: 2 },
            body: false,
          },
        },
      ),
    ).toEqual({
      headers: { Accept: 'dynamic', 'X-Static': 'yes', 'X-Key': 'secret' },
      query: { page: 2, enabled: true },
      body: false,
    });
  });

  it('不生成空 headers/query/body，并解析静态 body', () => {
    expect(
      buildHttpToolRequestInput({ body: ' [1, 2] ' }, { 'exec-in': true }),
    ).toEqual({ body: [1, 2] });
    expect(buildHttpToolRequestInput({ body: ' plain ' }, {})).toEqual({
      body: 'plain',
    });
    expect(buildHttpToolRequestInput({ body: '  ' }, {})).toEqual({});
    expect(buildHttpToolRequestInput({}, {})).toEqual({});
  });

  it('request-in 优先于 request，undefined 才 fallback，并保留原始 false/null', () => {
    expect(
      extractHttpToolDynamicRequest({
        'request-in': { id: 1 },
        request: { id: 2 },
      }),
    ).toEqual({ id: 1 });
    expect(
      extractHttpToolDynamicRequest({
        'request-in': undefined,
        request: { id: 2 },
      }),
    ).toEqual({ id: 2 });
    expect(
      extractHttpToolDynamicRequest({
        request: undefined,
        'exec-in': true,
        value: 3,
      }),
    ).toEqual({ value: 3 });
    expect(extractHttpToolDynamicRequest({ 'request-in': false })).toEqual({
      body: false,
    });
    expect(extractHttpToolDynamicRequest({ 'request-in': null })).toEqual({
      body: null,
    });
    expect(extractHttpToolDynamicRequest({ 'exec-in': true })).toEqual({});
  });

  it('body 选择区分显式 body、裸对象和 envelope', () => {
    expect(
      resolveHttpToolRequestBody({ body: '{"static":1}' }, { body: undefined }),
    ).toBeUndefined();
    expect(resolveHttpToolRequestBody({}, { id: 1 })).toEqual({ id: 1 });
    expect(
      resolveHttpToolRequestBody({ body: '{"static":1}' }, { query: { q: 1 } }),
    ).toEqual({ static: 1 });
    expect(
      resolveHttpToolRequestBody({ body: '{"static":1}' }, { headers: {} }),
    ).toEqual({ static: 1 });
    expect(resolveHttpToolRequestBody({ body: 2 }, {})).toBeUndefined();
  });

  it('headers 仅接受字符串值，query 仅接受 record', () => {
    expect(extractHttpToolHeaders({ ok: 'yes', number: 2, nil: null })).toEqual(
      { ok: 'yes' },
    );
    expect(extractHttpToolHeaders(['bad'])).toEqual({});
    expect(extractHttpToolQuery({ page: 1 })).toEqual({ page: 1 });
    expect(extractHttpToolQuery(null)).toEqual({});
  });

  it('构造 bearer/basic/header api-key 并拒绝不完整配置', () => {
    expect(
      buildHttpToolAuthHeaders({
        authType: 'bearer',
        authConfig: { token: ' token ' },
      }),
    ).toEqual({ Authorization: 'Bearer token' });
    expect(
      buildHttpToolAuthHeaders({
        auth_type: 'basic',
        auth_config: { username: 'user', password: 'pass' },
      }),
    ).toEqual({
      Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
    });
    expect(
      buildHttpToolAuthHeaders({
        authType: 'basic',
        authConfig: { username: 'user' },
      }),
    ).toEqual({});
    expect(
      buildHttpToolAuthHeaders({
        authType: 'api-key',
        authConfig: { key_name: 'X-Api', key_value: 'key' },
      }),
    ).toEqual({ 'X-Api': 'key' });
    expect(
      buildHttpToolAuthHeaders({
        authType: 'api-key',
        authConfig: { location: 'query', keyName: 'key', keyValue: 'v' },
      }),
    ).toEqual({});
    expect(
      buildHttpToolAuthHeaders({ authType: 'unknown', authConfig: {} }),
    ).toEqual({});
    expect(buildHttpToolAuthHeaders({ authType: 'bearer' })).toEqual({});
  });

  it('仅 query api-key 进入 query，默认 location 仍为 header', () => {
    expect(
      buildHttpToolAuthQuery({
        authType: 'api-key',
        authConfig: { location: 'query', keyName: 'token', keyValue: 'v' },
      }),
    ).toEqual({ token: 'v' });
    expect(
      buildHttpToolAuthQuery({
        auth_type: 'api-key',
        auth_config: { location: 'query', key_name: 'token' },
      }),
    ).toEqual({});
    expect(
      buildHttpToolAuthQuery({
        authType: 'api-key',
        authConfig: { keyName: 'token', keyValue: 'v' },
      }),
    ).toEqual({});
    expect(
      buildHttpToolAuthQuery({
        authType: 'bearer',
        authConfig: { location: 'query' },
      }),
    ).toEqual({});
  });
});

describe('smart-routing-input.util', () => {
  it('strategyName 优先于 strategy，并规范化已知别名和自定义值', () => {
    expect(
      resolveSmartRoutingStrategyValue({
        strategyName: 'QUALITY_FIRST',
        strategy: 'COST_OPTIMIZED',
      }),
    ).toBe('QUALITY_FIRST');
    expect(
      resolveSmartRoutingStrategyValue({
        strategyName: '',
        strategy: 'LATENCY_FIRST',
      }),
    ).toBe('LATENCY_FIRST');
    expect(resolveSmartRoutingStrategyValue({})).toBe('FALLBACK_CHAIN');
    expect(normalizeSmartRoutingStrategyName(' TOKEN_OPTIMIZED ')).toBe(
      'token_optimized',
    );
    expect(normalizeSmartRoutingStrategyName('memory-bank')).toBe(
      'memory_bank',
    );
    expect(normalizeSmartRoutingStrategyName('wasm-plugin')).toBe(
      'wasm_plugin',
    );
    expect(normalizeSmartRoutingStrategyName('Custom_Strategy')).toBe(
      'custom_strategy',
    );
    expect(isFallbackChainStrategy('FALLBACK_CHAIN')).toBe(true);
    expect(isFallbackChainStrategy(' fallback_chain ')).toBe(true);
    expect(isFallbackChainStrategy('quality_first')).toBe(false);
    expect(isFallbackChainStrategy()).toBe(false);
  });

  it('camelCase strategy config 优先且非法值不阻断 snake_case fallback', () => {
    const camel = { order: 1 };
    const snake = { order: 2 };
    expect(
      resolveSmartRoutingStrategyConfig({
        strategyConfig: camel,
        strategy_config: snake,
      }),
    ).toBe(camel);
    expect(
      resolveSmartRoutingStrategyConfig({
        strategyConfig: [],
        strategy_config: snake,
      }),
    ).toBe(snake);
    expect(
      resolveSmartRoutingStrategyConfig({ strategyConfig: null }),
    ).toBeUndefined();
  });

  it('query/category 优先取 nodeData 并递归查找嵌套 input', () => {
    expect(
      extractSmartRoutingQueryText(
        { prompt: 'configured' },
        { query: 'runtime' },
      ),
    ).toBe('configured');
    expect(
      extractSmartRoutingQueryText(
        {},
        { wrapper: [{ payload: { task: 'runtime task' } }] },
      ),
    ).toBe('runtime task');
    expect(
      extractSmartRoutingTaskCategory({ intent: 'code' }, { category: 'chat' }),
    ).toBe('code');
    expect(
      extractSmartRoutingTaskCategory({}, { nested: { category: 'chat' } }),
    ).toBe('chat');
    expect(findFirstStringByKeys('direct', ['query'])).toBe('direct');
    expect(findFirstStringByKeys(3, ['query'])).toBeUndefined();
    expect(
      findFirstStringByKeys({ query: '', nested: { query: 'deep' } }, [
        'query',
      ]),
    ).toBe('deep');
  });

  it('递归字符串查找可处理循环对象与数组', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    cyclic.children = [cyclic, { prompt: 'found' }];
    expect(findFirstStringByKeys(cyclic, ['prompt'])).toBe('found');
    expect(findFirstStringByKeys(cyclic, ['missing'])).toBe('found');
    const stringlessCycle: Record<string, unknown> = { count: 1 };
    stringlessCycle.self = stringlessCycle;
    expect(findFirstStringByKeys(stringlessCycle, ['missing'])).toBeUndefined();
  });

  it('验证并递归提取 smart-routing runtime context', () => {
    const context = {
      routingStepId: 'step',
      routingNodeId: 'node',
      strategy: 'fallback_chain',
      selectedModelId: 'model-a',
      currentModelIndex: 0,
      candidateModelIds: ['model-a', 'model-b'],
    };
    expect(isSmartRoutingRuntimeContext(context)).toBe(true);
    expect(extractSmartRoutingContext({ nested: [{ value: context }] })).toBe(
      context,
    );
    expect(findSmartRoutingContext('bad', new Set())).toBeUndefined();
    expect(
      isSmartRoutingRuntimeContext({ ...context, currentModelIndex: '0' }),
    ).toBe(false);
    expect(
      isSmartRoutingRuntimeContext({
        ...context,
        candidateModelIds: ['ok', 2],
      }),
    ).toBe(false);
    expect(isSmartRoutingRuntimeContext(null)).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(extractSmartRoutingContext(cyclic)).toBeUndefined();
  });

  it('提取模型 id 时遵守 candidate、selected、llm、model 优先级', () => {
    expect(extractModelConfigIds('model-a')).toEqual(['model-a']);
    expect(extractModelConfigIds('')).toEqual([]);
    expect(extractModelConfigIds(['a', null, { modelConfigId: 'b' }])).toEqual([
      'a',
      'b',
    ]);
    expect(
      extractModelConfigIds({
        candidateModelIds: ['a', '', 2],
        selectedModelId: 'ignored',
      }),
    ).toEqual(['a']);
    expect(
      extractModelConfigIds({
        selectedModelId: 'selected',
        llmModelConfigId: 'llm',
      }),
    ).toEqual(['selected']);
    expect(
      extractModelConfigIds({
        llmModelConfigId: 'llm',
        modelConfigId: 'model',
      }),
    ).toEqual(['llm']);
    expect(
      extractModelConfigIds({ nested: { modelConfigId: 'deep' } }),
    ).toEqual(['deep']);
    expect(extractModelConfigIds(2)).toEqual([]);
  });

  it('结构化模型提取忽略裸字符串，只递归 record', () => {
    expect(extractStructuredModelConfigIds('model-a')).toEqual([]);
    expect(
      extractStructuredModelConfigIds({ candidateModelIds: ['a', '', 2] }),
    ).toEqual(['a']);
    expect(
      extractStructuredModelConfigIds({ selectedModelId: ' selected ' }),
    ).toEqual(['selected']);
    expect(
      extractStructuredModelConfigIds({ nested: { modelConfigId: 'deep' } }),
    ).toEqual(['deep']);
    expect(
      extractStructuredModelConfigIds({
        nested: [{ modelConfigId: 'ignored-array' }],
      }),
    ).toEqual([]);
  });

  it('按序合并 fallback 路径、runtime 值与静态模型并去重', () => {
    expect(
      collectModelConfigIds(
        {
          fallbackPriority: ['preferred.models', '', 3],
          modelConfigIds: ['static', 'shared'],
        },
        {
          preferred: { models: ['preferred', 'shared'] },
          other: { modelConfigId: 'runtime' },
        },
      ),
    ).toEqual(['preferred', 'shared', 'runtime', 'static']);
    expect(
      collectModelConfigIds(
        { fallbackPriority: 'bad', modelConfigIds: 'bad' },
        {},
      ),
    ).toEqual([]);
  });

  it('递归收集 MCP server id，仅接受 mcp-tool 并去重', () => {
    expect(
      extractMcpServerConfigIds({
        first: { type: 'mcp-tool', mcpServerConfigId: 'server-a' },
        nested: [
          { type: 'other', mcpServerConfigId: 'ignored' },
          { type: 'mcp-tool', mcpServerConfigId: 'server-a' },
          { type: 'mcp-tool', mcpServerConfigId: 'server-b' },
        ],
        primitive: 3,
      }),
    ).toEqual(['server-a', 'server-b']);
  });

  it('估算 token 边界并映射 routing score 的可观察字段', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('12345')).toBe(2);
    expect(estimateTokenCount(null)).toBe(1);
    const score = {
      modelId: 'm',
      modelName: 'Model',
      provider: 'p',
      score: 0.8,
      reasoning: 'best',
      extra: true,
    };
    expect(mapRoutingDecisionScores({ scores: [score] } as never)).toEqual([
      {
        modelId: 'm',
        modelName: 'Model',
        provider: 'p',
        score: 0.8,
        reasoning: 'best',
      },
    ]);
  });
});
