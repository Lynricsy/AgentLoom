import { describe, expect, it, vi } from 'vitest';

import {
  buildExecutionMetadataForPublishedVersionRefresh,
  extractStringArray,
  isRecord,
  mergeExecutionMetadata,
  normalizeOptionalString,
  readExecutionMetadata,
  readStringValue,
  shouldRefreshConversationRuntimeForPublishedVersion,
  writeExecutionMetadata,
} from '../conversation-execution-metadata';
import {
  buildMemoryBootPrompt,
  buildMemoryNavigationSummary,
  prependSystemPrompt,
} from '../conversation-memory-prompt';
import {
  applyConversationInputPreprocessors,
  estimateConversationTokenCount,
  normalizeConversationRoutingStrategy,
} from '../conversation-runtime-input';
import {
  extractConversationSkillIds,
  extractSkillId,
  normalizeRuntimeSkillIds,
  resolveCanvasNodeData,
  resolveCanvasNodeType,
  resolveConfiguredSkillIds,
  resolveSkillAugmentedPrompt,
  resolveSkillPayloadsForGraph,
} from '../conversation-skill-resolution';
import {
  buildConversationTurnResult,
  extractThinkingEventContent,
  mergeToolCallEvent,
  turnResultHasPersistableOutput,
} from '../conversation-turn-values';
import {
  buildPiConfigInput,
  extractEnabledMcpServerConfigIds,
  resolvePiMcpServerKey,
  resolvePiModelBaseUrl,
  resolvePiModelConfig,
  resolvePiMcpServers,
  resolvePiRuntimeModelBaseUrl,
  sanitizePiMcpServerKey,
  toPiModelConfig,
  toPiModelConfigFromRuntimeModelConfig,
  toSkillInput,
} from '../pi-config-input.builder';

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (dbClient: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

describe('conversation execution metadata helpers', () => {
  it('rejects malformed containers and normalizes primitive values', () => {
    expect(isRecord({ value: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(readStringValue('value')).toBe('value');
    expect(readStringValue('')).toBeUndefined();
    expect(readStringValue(1)).toBeUndefined();
    expect(extractStringArray('bad')).toEqual([]);
    expect(extractStringArray(['one', 2, 'two', null])).toEqual(['one', 'two']);
    expect(normalizeOptionalString('  value  ')).toBe('value');
    expect(normalizeOptionalString('   ')).toBeUndefined();
    expect(normalizeOptionalString(null)).toBeUndefined();
  });

  it('reads only well-typed persisted execution fields', () => {
    expect(readExecutionMetadata({ execution: null })).toEqual({});
    expect(readExecutionMetadata({ execution: [] })).toEqual({});
    expect(
      readExecutionMetadata({
        execution: {
          sessionId: 'session-1',
          memorySessionIds: ['memory-1', 2],
          loadedPublishedVersionId: 'version-1',
          lastProcessedMessageId: 'user-1',
          lastAssistantMessageId: 'assistant-1',
          lastStopReason: 'end_turn',
          runningState: 'failed',
          errorMessage: 'safe',
          errorCode: 'MODEL_ERROR',
          rawErrorMessage: 'raw',
          failedPhase: 'runtime_preparing',
          ignored: true,
        },
      }),
    ).toEqual({
      sessionId: 'session-1',
      memorySessionIds: ['memory-1'],
      loadedPublishedVersionId: 'version-1',
      lastProcessedMessageId: 'user-1',
      lastAssistantMessageId: 'assistant-1',
      lastStopReason: 'end_turn',
      runningState: 'failed',
      errorMessage: 'safe',
      errorCode: 'MODEL_ERROR',
      rawErrorMessage: 'raw',
      failedPhase: 'runtime_preparing',
    });
    expect(
      readExecutionMetadata({
        execution: {
          sessionId: 1,
          memorySessionIds: 'bad',
          loadedPublishedVersionId: false,
          lastProcessedMessageId: null,
          lastAssistantMessageId: {},
          lastStopReason: 2,
          runningState: false,
          errorMessage: null,
          errorCode: {},
          rawErrorMessage: [],
          failedPhase: 3,
        },
      }),
    ).toEqual({});
  });

  it('merges explicit nullable resets while filtering malformed values', () => {
    const merged = mergeExecutionMetadata(
      {
        execution: {
          sessionId: 'session-1',
          memorySessionIds: ['old'],
          loadedPublishedVersionId: 'version-1',
          lastProcessedMessageId: 'user-1',
          lastAssistantMessageId: 'assistant-1',
          lastStopReason: 'end_turn',
          runningState: 'running',
          errorMessage: 'old',
          errorCode: 'OLD',
          rawErrorMessage: 'old raw',
          failedPhase: 'queued',
        },
      },
      {
        memorySessionIds: ['new', 3 as never],
        loadedPublishedVersionId: undefined,
        lastProcessedMessageId: undefined,
        lastAssistantMessageId: undefined,
        errorMessage: null,
        errorCode: null,
        rawErrorMessage: null,
        failedPhase: null,
        runningState: 'idle',
      },
    );
    expect(merged).toEqual({
      sessionId: 'session-1',
      memorySessionIds: ['new'],
      lastStopReason: 'end_turn',
      runningState: 'idle',
    });
    expect(
      writeExecutionMetadata({ title: 'kept', execution: 'old' }, merged),
    ).toEqual({ title: 'kept', execution: merged });
  });

  it('refreshes only stale runtimes and preserves turn cursors during reset', () => {
    expect(shouldRefreshConversationRuntimeForPublishedVersion({}, 'v2')).toBe(
      false,
    );
    expect(
      shouldRefreshConversationRuntimeForPublishedVersion({ sessionId: 's1' }),
    ).toBe(false);
    expect(
      shouldRefreshConversationRuntimeForPublishedVersion(
        { sessionId: 's1', loadedPublishedVersionId: ' v2 ' },
        'v2',
      ),
    ).toBe(false);
    expect(
      shouldRefreshConversationRuntimeForPublishedVersion(
        { memorySessionIds: ['m1'], loadedPublishedVersionId: 'v1' },
        'v2',
      ),
    ).toBe(true);
    expect(
      buildExecutionMetadataForPublishedVersionRefresh(
        {
          sessionId: 'discard',
          memorySessionIds: ['discard'],
          lastProcessedMessageId: 'user-1',
          lastAssistantMessageId: 'assistant-1',
          errorMessage: 'discard',
        },
        'v2',
      ),
    ).toEqual({
      lastProcessedMessageId: 'user-1',
      lastAssistantMessageId: 'assistant-1',
      lastStopReason: 'end_turn',
      runningState: 'idle',
      loadedPublishedVersionId: 'v2',
    });
    expect(
      buildExecutionMetadataForPublishedVersionRefresh({}, undefined),
    ).toEqual({ lastStopReason: 'end_turn', runningState: 'idle' });
  });
});

describe('conversation memory and runtime input helpers', () => {
  const emptyBoot = {
    systemPrompt: '',
    boot: undefined,
    index: [],
    glossary: [],
  } as never;

  it('formats memory sections and omits empty optional sections', () => {
    expect(buildMemoryBootPrompt(emptyBoot)).toBeUndefined();
    expect(buildMemoryNavigationSummary(emptyBoot)).toBeUndefined();
    expect(
      buildMemoryBootPrompt({
        systemPrompt: '  persistent instructions  ',
        boot: '  current focus  ',
        index: [{ domain: 'project', pathString: 'architecture/decisions' }],
        glossary: [{ keyword: 'ADR', nodeId: 'node-1' }],
      } as never),
    ).toBe(
      'persistent instructions\n\n## Memory Boot\ncurrent focus\n\n## Memory Index\n- project://architecture/decisions\n\n## Memory Glossary\n- ADR -> node:node-1',
    );
    expect(prependSystemPrompt(' memory ', ' base ')).toBe('memory\n\nbase');
    expect(prependSystemPrompt(undefined, ' base ')).toBe('base');
    expect(prependSystemPrompt('   ', undefined)).toBeUndefined();
  });

  it('normalizes routing aliases and estimates serialized token sizes', () => {
    expect(normalizeConversationRoutingStrategy(undefined)).toBe(
      'FALLBACK_CHAIN',
    );
    expect(normalizeConversationRoutingStrategy('   ')).toBe('FALLBACK_CHAIN');
    expect(normalizeConversationRoutingStrategy('quality_first')).toBe(
      'QUALITY_FIRST',
    );
    expect(normalizeConversationRoutingStrategy('LATENCY_FIRST')).toBe(
      'LATENCY_FIRST',
    );
    expect(normalizeConversationRoutingStrategy('unsupported')).toBeNull();
    expect(estimateConversationTokenCount('12345')).toBe(2);
    expect(estimateConversationTokenCount(null)).toBe(1);
    expect(estimateConversationTokenCount({ a: 1 })).toBe(2);
  });

  it('applies preprocessors in order, skips malformed entries, and serializes object output', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ output: { normalized: 'HELLO' } })
      .mockResolvedValueOnce({ output: 'final' });
    const handler = { execute } as never;
    const runtimeConfig = {
      inputPreprocessors: [
        { type: '  ', config: null },
        { type: 'trim', config: { mode: 'strict' } },
        { type: 'template', config: [] },
      ],
    } as never;
    await expect(
      applyConversationInputPreprocessors(' hello ', runtimeConfig, handler),
    ).resolves.toBe('final');
    expect(execute).toHaveBeenNthCalledWith(
      1,
      { text: ' hello ', value: ' hello ', raw: ' hello ' },
      expect.objectContaining({ transformType: 'jmespath' }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      { normalized: 'HELLO' },
      expect.objectContaining({ transformType: 'template' }),
    );
    execute.mockReset().mockResolvedValueOnce({ output: { value: 2 } });
    await expect(
      applyConversationInputPreprocessors(
        'input',
        { inputPreprocessors: [{ type: 'json', config: {} }] } as never,
        handler,
      ),
    ).resolves.toBe('{\n  "value": 2\n}');
    await expect(
      applyConversationInputPreprocessors('unchanged', undefined, handler),
    ).resolves.toBe('unchanged');
  });
});

describe('conversation skill resolution helpers', () => {
  const logger = { warn: vi.fn() };
  const agentNode = {
    id: 'agent',
    type: 'legacy',
    data: { nodeType: 'agent-main' },
  };
  const connectedSkill = {
    id: 'skill-node-1',
    type: 'skill',
    data: { config: { skillId: 'from-config' }, skillId: 'skill-a' },
  };
  const disconnectedSkill = {
    id: 'skill-node-2',
    data: { nodeType: 'skill', config: { skillId: 'skill-b' } },
  };
  const nodes = [agentNode, connectedSkill, disconnectedSkill] as never;
  const edges = [
    { source: 'skill-node-1', target: 'agent', targetHandle: 'skills-in' },
    { source: 'skill-node-2', target: 'agent', targetHandle: 'other' },
  ] as never;

  it('uses node data precedence and only selects skills wired to agent main', () => {
    expect(resolveCanvasNodeType(agentNode as never)).toBe('agent-main');
    expect(resolveCanvasNodeType({ type: 'skill', data: [] } as never)).toBe(
      'skill',
    );
    expect(resolveCanvasNodeType({ type: 2, data: null } as never)).toBe('');
    expect(resolveCanvasNodeData(connectedSkill as never)).toEqual({
      skillId: 'skill-a',
      config: { skillId: 'from-config' },
    });
    expect(resolveCanvasNodeData({ data: { config: [] } } as never)).toEqual({
      config: [],
    });
    expect(extractSkillId(connectedSkill as never)).toBe('skill-a');
    expect(extractSkillId({ data: { skillId: '  ' } } as never)).toBeNull();
    expect(extractConversationSkillIds(nodes, edges)).toEqual(['skill-a']);
    expect(
      extractConversationSkillIds([{ type: 'agent-main' }] as never, []),
    ).toEqual([]);
    expect(
      extractConversationSkillIds(
        [connectedSkill, { ...connectedSkill, id: 'duplicate' }] as never,
        [],
      ),
    ).toEqual(['skill-a']);
  });

  it('prefers normalized runtime skill ids over graph-derived ids', () => {
    expect(normalizeRuntimeSkillIds(undefined)).toEqual([]);
    expect(
      normalizeRuntimeSkillIds([' skill-a ', '', 'skill-a', 'skill-b']),
    ).toEqual(['skill-a', 'skill-b']);
    expect(resolveConfiguredSkillIds([' runtime '], nodes, edges)).toEqual([
      'runtime',
    ]);
    expect(resolveConfiguredSkillIds([], nodes, edges)).toEqual(['skill-a']);
  });

  it('resolves payloads and prompt while preserving safe fallbacks on empty/error paths', async () => {
    const params = {
      tenantId: 'tenant-1',
      agentDefinitionId: 'agent-1',
      skillIds: ['skill-a'],
      nodes: [],
      edges: [],
    };
    await expect(
      resolveSkillPayloadsForGraph(params as never, undefined, logger),
    ).resolves.toEqual([]);
    await expect(
      resolveSkillPayloadsForGraph(
        { ...params, skillIds: [] } as never,
        { resolveSkillsForAgent: vi.fn() } as never,
        logger,
      ),
    ).resolves.toEqual([]);
    const service = {
      resolveSkillsForAgent: vi.fn().mockResolvedValue([{ name: 'Search' }]),
      buildSkillAugmentedPrompt: vi
        .fn()
        .mockReturnValue('  augmented prompt  '),
    };
    await expect(
      resolveSkillPayloadsForGraph(params as never, service as never, logger),
    ).resolves.toEqual([{ name: 'Search' }]);
    await expect(
      resolveSkillAugmentedPrompt(
        { ...params, baseSystemPrompt: 'base' },
        service as never,
        logger,
      ),
    ).resolves.toBe('augmented prompt');
    expect(service.buildSkillAugmentedPrompt).toHaveBeenCalledWith('base', [
      { name: 'Search' },
    ]);
    service.resolveSkillsForAgent.mockResolvedValueOnce([]);
    await expect(
      resolveSkillAugmentedPrompt(
        { ...params, baseSystemPrompt: 'base' },
        service as never,
        logger,
      ),
    ).resolves.toBe('base');
    service.resolveSkillsForAgent.mockResolvedValueOnce([{ name: 'Search' }]);
    service.buildSkillAugmentedPrompt.mockReturnValueOnce('  ');
    await expect(
      resolveSkillAugmentedPrompt(
        { ...params, baseSystemPrompt: undefined },
        service as never,
        logger,
      ),
    ).resolves.toBeUndefined();
    service.resolveSkillsForAgent.mockRejectedValueOnce(
      new Error('skill store unavailable'),
    );
    await expect(
      resolveSkillPayloadsForGraph(params as never, service as never, logger),
    ).resolves.toEqual([]);
    service.resolveSkillsForAgent.mockRejectedValueOnce('offline');
    await expect(
      resolveSkillAugmentedPrompt(
        { ...params, baseSystemPrompt: 'base' },
        service as never,
        logger,
      ),
    ).resolves.toBe('base');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('offline'),
    );
  });
});

describe('Pi runtime config helpers', () => {
  const logger = { warn: vi.fn() };
  const resolvedModel = {
    modelId: 'model-name',
    orgId: 'org-1',
    tenantId: 'tenant-1',
    parameters: {},
    provider: {
      slug: 'provider',
      apiProtocol: 'openai_chat',
      apiKeyId: 'key-1',
      baseUrl: ' https://provider.example/v1 ',
      defaultBaseUrl: 'https://default.example/v1',
    },
  };

  it('maps resolved and snapshot model configs with endpoint precedence', () => {
    expect(resolvePiModelBaseUrl(resolvedModel as never)).toBe(
      'https://provider.example/v1',
    );
    const providerWithoutUrl = {
      slug: 'provider',
      apiProtocol: 'openai_chat',
      apiKeyId: 'key-1',
      baseUrl: null,
      defaultBaseUrl: null,
    };
    expect(
      resolvePiModelBaseUrl({
        ...resolvedModel,
        provider: { ...providerWithoutUrl, baseUrl: ' ' },
        parameters: { baseURL: ' https://parameter.example/v1 ' },
      } as never),
    ).toBe('https://parameter.example/v1');
    expect(
      resolvePiModelBaseUrl({
        ...resolvedModel,
        provider: providerWithoutUrl,
        parameters: [],
      } as never),
    ).toBeUndefined();
    expect(toPiModelConfig(resolvedModel as never)).toEqual({
      provider: 'provider',
      model: 'model-name',
      apiProtocol: 'openai_chat',
      apiBaseUrl: 'https://provider.example/v1',
      apiKeyId: 'key-1',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
    });
    const snapshot = {
      provider: ' private ',
      modelName: ' snapshot-model ',
      modelId: 'id-fallback',
      endpointUrl: ' https://snapshot.example/v1 ',
      apiProtocol: ' openai_responses ',
      apiKeyId: null,
      authMethod: ' bearer ',
    } as never;
    expect(resolvePiRuntimeModelBaseUrl(snapshot)).toBe(
      'https://snapshot.example/v1',
    );
    expect(toPiModelConfigFromRuntimeModelConfig(snapshot)).toEqual({
      provider: 'private',
      model: 'snapshot-model',
      apiProtocol: 'openai_responses',
      apiBaseUrl: 'https://snapshot.example/v1',
      apiKeyId: null,
      authMethod: 'bearer',
    });
    expect(
      resolvePiRuntimeModelBaseUrl({
        customParameters: { apiBaseUrl: ' custom ' },
      } as never),
    ).toBe('custom');
    expect(
      resolvePiRuntimeModelBaseUrl({ customParameters: [] } as never),
    ).toBeUndefined();
    expect(
      toPiModelConfigFromRuntimeModelConfig({
        provider: '',
        modelId: 'm',
      } as never),
    ).toBeUndefined();
  });

  it('uses database model config first and falls back only when snapshot is usable', async () => {
    const llm = { findById: vi.fn().mockResolvedValue(resolvedModel) };
    await expect(
      resolvePiModelConfig(
        {
          modelConfig: { modelId: 'id', provider: 'p', modelName: 'fallback' },
        } as never,
        'tenant-1',
        llm as never,
        logger,
      ),
    ).resolves.toMatchObject({ provider: 'provider', model: 'model-name' });
    expect(llm.findById).toHaveBeenCalledWith('id', 'tenant-1');
    llm.findById.mockRejectedValueOnce(new Error('deleted'));
    await expect(
      resolvePiModelConfig(
        {
          modelConfig: {
            modelId: 'id',
            provider: 'snapshot',
            modelName: 'fallback',
          },
        } as never,
        'tenant-1',
        llm as never,
        logger,
      ),
    ).resolves.toMatchObject({ provider: 'snapshot', model: 'fallback' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('falling back'),
    );
    llm.findById.mockRejectedValueOnce(new Error('deleted'));
    await expect(
      resolvePiModelConfig(
        { modelConfig: { modelId: 'id' } } as never,
        'tenant-1',
        llm as never,
        logger,
      ),
    ).rejects.toThrow('deleted');
    await expect(
      resolvePiModelConfig(
        { modelConfig: { provider: 'p', modelName: 'm' } } as never,
        'tenant-1',
        undefined,
        logger,
      ),
    ).resolves.toMatchObject({ provider: 'p', model: 'm' });
  });

  it('extracts enabled unique MCP ids and creates stable collision-free keys', () => {
    expect(extractEnabledMcpServerConfigIds(undefined)).toEqual([]);
    expect(
      extractEnabledMcpServerConfigIds([
        { enabled: false, mcpServerConfigId: 'disabled' },
        { enabled: true },
        { enabled: true, mcpServerConfigId: '  alpha  ' },
        { mcpServerConfigId: 'alpha' },
        { mcpServerConfigId: '' },
      ] as never),
    ).toEqual(['alpha']);
    expect(sanitizePiMcpServerKey(undefined)).toBeUndefined();
    expect(sanitizePiMcpServerKey('  Docs & Search  ')).toBe('Docs_Search');
    expect(sanitizePiMcpServerKey('!!!')).toBeUndefined();
    expect(resolvePiMcpServerKey('config-1', 'Docs Search', {})).toBe(
      'Docs_Search',
    );
    expect(
      resolvePiMcpServerKey('config-1', 'Docs Search', {
        Docs_Search: {},
        Docs_Search_2: {},
      }),
    ).toBe('Docs_Search_3');
    expect(resolvePiMcpServerKey('!!!', '---', { '---': {} })).toBe('---_2');
  });

  it('resolves available MCP servers, isolates failures, and omits empty results', async () => {
    const where = vi.fn().mockResolvedValue([
      { id: 'one', name: 'Docs' },
      { id: 'two', name: 'Docs' },
    ]);
    const db = {
      select: vi
        .fn()
        .mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }),
    };
    const mcp = {
      resolveRuntimeConnection: vi
        .fn()
        .mockResolvedValueOnce({ transport: 'stdio', command: 'one' })
        .mockRejectedValueOnce(new Error('secret missing')),
    };
    const config = {
      tools: [{ mcpServerConfigId: 'one' }, { mcpServerConfigId: 'two' }],
    } as never;
    await expect(
      resolvePiMcpServers(
        config,
        'tenant-1',
        mcp as never,
        db as never,
        logger,
      ),
    ).resolves.toEqual({ Docs: { transport: 'stdio', command: 'one' } });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('secret missing'),
    );
    await expect(
      resolvePiMcpServers(config, 'tenant-1', undefined, db as never, logger),
    ).resolves.toBeUndefined();
    await expect(
      resolvePiMcpServers(
        { tools: [] } as never,
        'tenant-1',
        mcp as never,
        db as never,
        logger,
      ),
    ).resolves.toBeUndefined();
    mcp.resolveRuntimeConnection.mockReset().mockRejectedValue('offline');
    await expect(
      resolvePiMcpServers(
        config,
        'tenant-1',
        mcp as never,
        db as never,
        logger,
      ),
    ).resolves.toBeUndefined();
  });

  it('builds the observable Pi config and skill file fallbacks', async () => {
    const config = await buildPiConfigInput(
      {
        tenantId: 'tenant-1',
        runtimeConfig: {
          modelConfig: { provider: 'snapshot', modelName: 'model' },
          tools: [],
        } as never,
        systemPrompt: 'system',
        skillPayloads: [
          {
            name: 'Search',
            description: 'find things',
            content: 'instructions',
          },
        ] as never,
      },
      undefined,
      undefined,
      { select: vi.fn() } as never,
      logger,
    );
    expect(config).toEqual({
      systemPrompt: 'system',
      modelConfig: { provider: 'snapshot', model: 'model' },
      skills: [
        {
          name: 'Search',
          description: 'find things',
          files: { 'SKILL.md': 'instructions' },
        },
      ],
    });
    expect(
      toSkillInput({
        name: 'Files',
        description: 'd',
        files: { 'a.txt': 'A' },
      } as never),
    ).toEqual({ name: 'Files', description: 'd', files: { 'a.txt': 'A' } });
  });
});

describe('conversation turn value helpers', () => {
  const emptyTurn = {
    assistantText: '',
    decision: undefined,
    stopReason: 'end_turn',
    toolCalls: [],
    toolResults: [],
    segments: [],
    subAgentStreams: {},
  };

  it('collects only completed/error tool outputs into persisted results', () => {
    const calls = new Map([
      ['pending', { id: 'pending', tool: 'search', status: 'running' }],
      [
        'result',
        {
          id: 'result',
          tool: 'read',
          status: 'completed',
          result: { ok: true },
        },
      ],
      [
        'error',
        { id: 'error', tool: 'write', status: 'failed', error: 'denied' },
      ],
    ]) as never;
    const result = buildConversationTurnResult(
      'answer',
      undefined,
      'end_turn',
      calls,
      [],
      {},
    );
    expect(result.toolCalls).toHaveLength(3);
    expect(result.toolResults).toEqual([
      {
        toolCallId: 'result',
        tool: 'read',
        status: 'completed',
        result: { ok: true },
      },
      { toolCallId: 'error', tool: 'write', status: 'failed', error: 'denied' },
    ]);
  });

  it.each([
    ['assistant text', { assistantText: 'answer' }],
    ['tool calls', { toolCalls: [{}] }],
    ['tool results', { toolResults: [{}] }],
    ['segments', { segments: [{}] }],
    ['subagent streams', { subAgentStreams: { child: {} } }],
    ['decision', { decision: { route: 'next' } }],
  ])('recognizes persistable output from %s', (_label, patch) => {
    const outputPatch = patch as Record<string, unknown>;
    expect(
      turnResultHasPersistableOutput({
        ...emptyTurn,
        ...outputPatch,
      } as never),
    ).toBe(true);
  });

  it('rejects a truly empty turn', () => {
    expect(turnResultHasPersistableOutput(emptyTurn as never)).toBe(false);
    expect(
      turnResultHasPersistableOutput({
        ...emptyTurn,
        subAgentStreams: undefined,
      } as never),
    ).toBe(false);
  });

  it('merges partial tool events without losing concrete prior state', () => {
    const previous = {
      id: 'call-1',
      tool: 'search',
      args: { query: 'term' },
      status: 'running',
      transitions: [{ status: 'running' }],
      result: { partial: true },
      error: 'old error',
      permissionRequest: { id: 'permission-1' },
    } as never;
    expect(
      mergeToolCallEvent(previous, {
        id: 'call-1',
        tool: 'unknown_tool',
        args: {},
        status: 'completed',
      } as never),
    ).toMatchObject({
      tool: 'search',
      args: { query: 'term' },
      transitions: [{ status: 'running' }],
      result: { partial: true },
      error: 'old error',
      permissionRequest: { id: 'permission-1' },
    });
    expect(
      mergeToolCallEvent(previous, {
        id: 'call-1',
        tool: 'write',
        args: { path: '/tmp/a' },
        status: 'failed',
        transitions: [{ status: 'failed' }],
        result: null,
        error: null,
        permissionRequest: { id: 'permission-2' },
      } as never),
    ).toMatchObject({
      tool: 'write',
      args: { path: '/tmp/a' },
      transitions: [{ status: 'failed' }],
      result: null,
      error: null,
      permissionRequest: { id: 'permission-2' },
    });
    expect(
      mergeToolCallEvent(undefined, {
        id: 'new',
        tool: '',
        status: 'running',
      } as never),
    ).toMatchObject({ id: 'new', tool: '' });
  });

  it('extracts user-visible thinking content by event kind and precedence', () => {
    expect(
      extractThinkingEventContent({ type: 'thinking', content: 'thought' }),
    ).toBe('thought');
    expect(
      extractThinkingEventContent({ type: 'plan', content: '' }),
    ).toBeUndefined();
    expect(
      extractThinkingEventContent({
        type: 'decision',
        rationale: 'because',
        suggestedContent: 'next step',
      }),
    ).toBe('because\n\nnext step');
    expect(
      extractThinkingEventContent({ type: 'decision', rationale: 2 }),
    ).toBeUndefined();
    expect(
      extractThinkingEventContent({ type: 'message_chunk', content: 'hidden' }),
    ).toBeUndefined();
  });
});
