import { describe, expect, it } from 'vitest';
import type { ExecutionStep, ReactFlowEdge } from '../../../database/schema';
import { resolveSourceHandleValue } from '../node-output-port.util';
import {
  buildWorkflowAgentCheckpointData,
  extractConfiguredMcpTools,
  getExecutionSandboxBinding,
  getSandboxConfigSource,
  getSandboxRestoreWorkspaceId,
  getSandboxSourceStep,
  getUpstreamMemorySessionIds,
  getWorkflowAgentDefinitionId,
  getWorkflowAgentRuntimeMode,
  getWorkflowSandboxOverride,
  readSandboxSessionId,
  resolveMemoryConfig,
  resolveSandboxConfig,
  resolveSandboxConfigForStep,
} from '../workflow-runtime-input.util';

function step(
  nodeId: string,
  nodeType: string,
  result: unknown = undefined,
  nodeData: Record<string, unknown> = {},
  checkpointData?: Record<string, unknown>,
): ExecutionStep {
  return {
    nodeId,
    nodeType,
    result,
    nodeData,
    checkpointData,
  } as unknown as ExecutionStep;
}

function edge(source: string, target: string): ReactFlowEdge {
  return { id: `${source}->${target}`, source, target } as ReactFlowEdge;
}

describe('workflow-runtime-input.util', () => {
  it('agent definition 顶层配置优先且兼容四种键名', () => {
    expect(
      getWorkflowAgentDefinitionId({
        config: { agentDefinitionId: 'nested' },
        agentDefinitionId: 'top',
      }),
    ).toBe('top');
    expect(
      getWorkflowAgentDefinitionId({
        config: { agent_definition_id: 'snake' },
      }),
    ).toBe('snake');
    expect(
      getWorkflowAgentDefinitionId({ selected_agent_id: 'selected-snake' }),
    ).toBe('selected-snake');
    expect(
      getWorkflowAgentDefinitionId({ agentDefinitionId: '  ' }),
    ).toBeUndefined();
  });

  it('runtime mode 仅显式 no_sandbox 禁用 sandbox', () => {
    expect(
      getWorkflowAgentRuntimeMode({ agentRuntimeMode: 'no_sandbox' }),
    ).toBe('no_sandbox');
    expect(
      getWorkflowAgentRuntimeMode({ config: { runtime_mode: 'no_sandbox' } }),
    ).toBe('no_sandbox');
    expect(getWorkflowAgentRuntimeMode({ runtimeMode: 'sandbox' })).toBe(
      'sandbox',
    );
    expect(getWorkflowAgentRuntimeMode({ runtimeMode: 'invalid' })).toBe(
      'sandbox',
    );
    expect(getWorkflowAgentRuntimeMode({})).toBe('sandbox');
  });

  it('checkpoint 清除陈旧 sandbox 绑定并保留其他状态', () => {
    expect(
      buildWorkflowAgentCheckpointData(
        {
          cursor: 3,
          sandboxNodeId: 'old',
          serverSandbox: { executionId: 'old' },
        } as never,
        'execution-new',
        'sandbox-new',
        'snapshot-new',
      ),
    ).toEqual({
      cursor: 3,
      sandboxNodeId: 'sandbox-new',
      serverSandbox: {
        executionId: 'execution-new',
        sandboxNodeId: 'sandbox-new',
      },
      workspaceSnapshotId: 'snapshot-new',
    });
    expect(
      buildWorkflowAgentCheckpointData(
        { sandboxNodeId: 'old', serverSandbox: {} } as never,
        'execution',
      ),
    ).toEqual({});
    expect(
      buildWorkflowAgentCheckpointData(
        null as never,
        'execution',
        undefined,
        'snapshot',
      ),
    ).toEqual({ workspaceSnapshotId: 'snapshot' });
  });

  it('sandbox config 遵循 config > sandboxConfig > global > nodeData 来源优先级', () => {
    const config = { cpu: 1 };
    const sandboxConfig = { cpu: 2 };
    expect(getSandboxConfigSource({ config, sandboxConfig })).toBe(config);
    expect(getSandboxConfigSource({ config: [], sandboxConfig })).toBe(
      sandboxConfig,
    );
    expect(
      getSandboxConfigSource({
        globalSandboxConfig: { sandboxConfig: { cpu: 3 }, cpu: 4 },
      }),
    ).toEqual({ cpu: 3 });
    expect(getSandboxConfigSource({ globalSandboxConfig: { cpu: 4 } })).toEqual(
      { cpu: 4 },
    );
    const nodeData = { cpu: 5 };
    expect(getSandboxConfigSource(nodeData)).toBe(nodeData);
  });

  it('sandbox 数值、生命周期、持久化字段和 restore override 均正确解析', () => {
    expect(
      resolveSandboxConfig(
        {
          config: {
            cpu: '2',
            memory: 1024,
            disk: '4',
            timeout: '30',
            lifecycle_mode: 'persistent',
            restoreWorkspaceId: 'configured',
            persistence_path: '/data',
            persistence_expiry_hours: '12',
            persistentSandboxName: 'named',
            persistent_sandbox_id: 'sandbox-id',
          },
        },
        { restoreWorkspaceId: 'override' },
      ),
    ).toEqual({
      cpu: 2,
      memory: 1024,
      disk: 4,
      timeout: 30,
      persistencePath: '/data',
      restoreWorkspaceId: 'override',
      lifecycleMode: 'persistent',
      persistenceExpiryHours: 12,
      name: 'named',
      persistentSandboxId: 'sandbox-id',
    });
    expect(
      resolveSandboxConfig({
        config: { cpu: 'bad', lifecycleMode: 'session' },
      }),
    ).toEqual({
      cpu: 1,
      memory: 512,
      disk: 2,
      timeout: 0,
      lifecycleMode: 'session',
    });
    expect(
      resolveSandboxConfig({
        config: { lifecycleMode: 'ephemeral', persistenceExpiryHours: 'bad' },
      }),
    ).toEqual({
      cpu: 1,
      memory: 512,
      disk: 2,
      timeout: 0,
    });
  });

  it('找到直接连接的 sandbox step，并用上游 workspace 恢复配置', () => {
    const steps = [
      step('workspace', 'workspace', undefined, {
        config: { workspaceId: ' workspace-config ' },
      }),
      step('sandbox', 'sandbox', undefined, { cpu: 2 }),
      step('agent', 'agent'),
    ];
    const edges = [edge('workspace', 'sandbox'), edge('sandbox', 'agent')];
    expect(getSandboxSourceStep('agent', edges, steps)).toBe(steps[1]);
    expect(getSandboxSourceStep('workspace', edges, steps)).toBeUndefined();
    expect(getSandboxRestoreWorkspaceId('sandbox', edges, steps)).toBe(
      'workspace-config',
    );
    expect(resolveSandboxConfigForStep(steps[1], edges, steps)).toMatchObject({
      cpu: 2,
      restoreWorkspaceId: 'workspace-config',
    });
    expect(getWorkflowSandboxOverride('agent', edges, steps)).toMatchObject({
      cpu: 2,
      restoreWorkspaceId: 'workspace-config',
    });
    expect(
      getWorkflowSandboxOverride('workspace', edges, steps),
    ).toBeUndefined();
  });

  it('workspace id 缺省时取 step result，跳过非 workspace 和空 id', () => {
    const steps = [
      step('not-workspace', 'memory', { workspaceId: 'wrong' }),
      step(
        'empty-workspace',
        'workspace',
        { workspaceId: ' result-id ' },
        { workspaceId: ' ' },
      ),
      step('sandbox', 'sandbox'),
    ];
    const edges = [
      edge('not-workspace', 'sandbox'),
      edge('empty-workspace', 'sandbox'),
    ];
    expect(getSandboxRestoreWorkspaceId('sandbox', edges, steps)).toBe(
      'result-id',
    );
    expect(
      getSandboxRestoreWorkspaceId('missing', edges, steps),
    ).toBeUndefined();
  });

  it('memory 配置要求 instance id，并验证 bootUris 全数组与 role fallback', () => {
    expect(
      resolveMemoryConfig(
        {
          config: {
            memory_instance_id: ' memory ',
            role: 'readonly',
            boot_uris: ['mem://a'],
            fusion_priority: '7',
          },
        },
        'tenant',
        'execution',
      ),
    ).toEqual({
      memoryInstanceId: 'memory',
      role: 'readonly',
      bootUris: ['mem://a'],
      fusionPriority: 7,
      tenantId: 'tenant',
      executionId: 'execution',
    });
    expect(
      resolveMemoryConfig(
        {
          memoryInstanceId: 'id',
          role: 'writer',
          bootUris: ['ok', 2],
          fusionPriority: 'bad',
        },
        't',
        'e',
      ),
    ).toEqual({
      memoryInstanceId: 'id',
      role: 'primary',
      bootUris: [],
      fusionPriority: 0,
      tenantId: 't',
      executionId: 'e',
    });
    expect(() => resolveMemoryConfig({}, 't', 'e')).toThrow(
      'Memory node requires memoryInstanceId',
    );
  });

  it('sandbox session id 兼容 snake_case 且拒绝非 record', () => {
    expect(
      readSandboxSessionId({ sessionId: ' camel ', session_id: 'snake' }),
    ).toBe('camel');
    expect(readSandboxSessionId({ session_id: ' snake ' })).toBe('snake');
    expect(readSandboxSessionId('session')).toBeUndefined();
  });

  it('execution binding 优先图连接，否则按输入 session 匹配 sandbox step', () => {
    const sandboxA = step('sandbox-a', 'sandbox', { sessionId: 'session-a' });
    const sandboxB = step('sandbox-b', 'sandbox', { session_id: 'session-b' });
    const agent = step('agent', 'agent');
    expect(
      getExecutionSandboxBinding(
        'agent',
        'exec',
        [edge('sandbox-a', 'agent')],
        [sandboxA, agent],
        { 'sandbox-in': { sessionId: 'session-b' } },
      ),
    ).toEqual({ executionId: 'exec', sandboxNodeId: 'sandbox-a' });
    expect(
      getExecutionSandboxBinding(
        'agent',
        'exec',
        [],
        [sandboxA, sandboxB, agent],
        { sandbox: { sessionId: 'session-b' } },
      ),
    ).toEqual({ executionId: 'exec', sandboxNodeId: 'sandbox-b' });
    expect(
      getExecutionSandboxBinding('agent', 'exec', [], [sandboxA], {
        'sandbox-output': { sessionId: 'missing' },
      }),
    ).toBeUndefined();
    expect(
      getExecutionSandboxBinding('agent', 'exec', [], [sandboxA], {
        'sandbox-in': 'bad',
      }),
    ).toBeUndefined();
  });

  it('筛选显式启用 MCP tools，保留 schema/mapping 并丢弃无名称项', () => {
    const tools = [
      {
        id: 'a',
        toolName: 'alpha',
        inputSchema: { type: 'object' },
        portMapping: { x: 'y' },
      },
      { id: 'b', name: 'beta', portMappingMetadata: { legacy: true } },
      { id: 'c', title: 'gamma' },
      { id: 'bad' },
      null,
    ];
    expect(extractConfiguredMcpTools({ tools }, ['b'])).toEqual([
      {
        toolName: 'beta',
        mcpToolDefinitionId: 'b',
        portMapping: { legacy: true },
      },
    ]);
    expect(extractConfiguredMcpTools({ tools }, [])).toEqual([
      {
        toolName: 'alpha',
        mcpToolDefinitionId: 'a',
        inputSchema: { type: 'object' },
        portMapping: { x: 'y' },
      },
      {
        toolName: 'beta',
        mcpToolDefinitionId: 'b',
        portMapping: { legacy: true },
      },
      { toolName: 'gamma', mcpToolDefinitionId: 'c' },
    ]);
  });

  it('无已选 tool 时使用 legacy fallback，且不制造空 tool', () => {
    expect(
      extractConfiguredMcpTools(
        {
          tools: [{ id: 'disabled', name: 'disabled' }],
          tool_name: 'legacy',
          mcpToolDefinitionId: 'legacy-id',
          inputSchema: { type: 'string' },
          portMappingMetadata: { in: 'value' },
        },
        ['missing'],
      ),
    ).toEqual([
      {
        toolName: 'legacy',
        mcpToolDefinitionId: 'legacy-id',
        inputSchema: { type: 'string' },
        portMapping: { in: 'value' },
      },
    ]);
    expect(extractConfiguredMcpTools({ tools: [] }, [])).toEqual([]);
  });

  it('上游 memory session 仅收集直接 memory 来源并去重/trim', () => {
    const steps = [
      step('m1', 'memory', { sessionId: ' session ' }),
      step('m2', 'memory', { sessionId: 'session' }),
      step('m3', 'memory', { sessionId: ' ' }),
      step('other', 'sandbox', { sessionId: 'wrong' }),
    ];
    expect(
      getUpstreamMemorySessionIds(
        'agent',
        [
          edge('m1', 'agent'),
          edge('m2', 'agent'),
          edge('m3', 'agent'),
          edge('other', 'agent'),
        ],
        steps,
      ),
    ).toEqual(['session']);
  });
});

describe('node-output-port.util', () => {
  it('无 record result 或未知 handle 返回 undefined', () => {
    expect(
      resolveSourceHandleValue(step('a', 'agent', null), 'reply-out'),
    ).toBeUndefined();
    expect(
      resolveSourceHandleValue(step('a', 'unknown', { value: 1 }), 'missing'),
    ).toBeUndefined();
  });

  it('直接路径值优先，并解包 condition 单键 payload', () => {
    expect(
      resolveSourceHandleValue(
        step('a', 'agent', { nested: { value: 0 }, content: 'fallback' }),
        'nested.value',
      ),
    ).toBe(0);
    expect(
      resolveSourceHandleValue(
        step('c', 'condition', { 'branch-0': { 'input-in': { id: 1 } } }),
        'branch-0',
      ),
    ).toEqual({ id: 1 });
    expect(
      resolveSourceHandleValue(
        step('c', 'conditional', { else: { input: false } }),
        'else',
      ),
    ).toBe(false);
    expect(
      resolveSourceHandleValue(
        step('c', 'condition', { 'branch-0': { input: 1, meta: 2 } }),
        'branch-0',
      ),
    ).toEqual({ input: 1, meta: 2 });
  });

  it.each([
    ['reply-out', 'content'],
    ['agent-out', 'content'],
    ['reply', 'content'],
    ['agent-output', 'content'],
  ])('agent handle %s 映射 content', (handle, key) => {
    expect(
      resolveSourceHandleValue(
        step('a', 'agent', { content: 'reply' }),
        handle,
      ),
    ).toBe('reply');
    expect(key).toBe('content');
  });

  it('agent structured handle 映射 decision，其他 handle 不 fallback', () => {
    for (const handle of [
      'structured-out',
      'structured',
      'structured-output',
    ]) {
      expect(
        resolveSourceHandleValue(
          step('a', 'chat-agent', { decision: { route: 'a' } }),
          handle,
        ),
      ).toEqual({ route: 'a' });
    }
    expect(
      resolveSourceHandleValue(
        step('a', 'agent', { content: 'reply' }),
        'unknown',
      ),
    ).toBeUndefined();
  });

  it('trigger payload/exec handle 兼容别名，并可从 payload 取动态 handle', () => {
    for (const nodeType of [
      'manual-trigger',
      'schedule-trigger',
      'webhook-trigger',
      'api-event-trigger',
    ]) {
      const source = step('t', nodeType, {
        payload: { custom: 0 },
        'exec-out': false,
        exec_out: 'legacy',
      });
      expect(resolveSourceHandleValue(source, 'payload-out')).toEqual({
        custom: 0,
      });
      expect(resolveSourceHandleValue(source, 'payload')).toEqual({
        custom: 0,
      });
      expect(resolveSourceHandleValue(source, 'exec-out')).toBe(false);
      expect(resolveSourceHandleValue(source, 'exec_out')).toBe('legacy');
      expect(resolveSourceHandleValue(source, 'custom')).toBe(0);
      expect(resolveSourceHandleValue(source, 'missing')).toBeUndefined();
    }
    expect(
      resolveSourceHandleValue(
        step('t', 'manual-trigger', { payload: 'primitive' }),
        'custom',
      ),
    ).toBeUndefined();
  });

  it.each([
    ['llm-model', ['model-out', 'model-output']],
    ['mcp-tool', ['tool-out', 'tool-output']],
    ['skill', ['skill-out']],
    ['knowledge-base', ['knowledge-out', 'knowledge']],
    ['sandbox', ['sandbox-out', 'sandbox-output']],
    ['workspace', ['volume-out', 'volume-output']],
    ['memory', ['memory-out', 'memory-out-0']],
    ['merge', ['merged-out', 'merged']],
  ])('%s 仅为已声明别名返回完整 result', (nodeType, handles) => {
    const type = String(nodeType);
    const result = { id: type };
    for (const handle of handles as string[])
      expect(resolveSourceHandleValue(step('n', type, result), handle)).toBe(
        result,
      );
    expect(
      resolveSourceHandleValue(step('n', type, result), 'wrong-handle'),
    ).toBeUndefined();
  });

  it('smart-routing 只接受 model-out', () => {
    const result = { selectedModelId: 'model' };
    expect(
      resolveSourceHandleValue(step('r', 'smart-routing', result), 'model-out'),
    ).toBe(result);
    expect(
      resolveSourceHandleValue(
        step('r', 'smart-routing', result),
        'model-output',
      ),
    ).toBeUndefined();
  });
});
