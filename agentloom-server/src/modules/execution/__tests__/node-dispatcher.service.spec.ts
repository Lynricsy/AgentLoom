/**
 * 节点分派器规格：验证完整 nodeType 注册表与公开执行器分派行为。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionStep } from '../../../database/schema';
import { NodeDispatcherService } from '../node-dispatcher.service';
import { CodeNodeExecutor } from '../node-executors/code-node.executor';
import { CompoundNodeExecutor } from '../node-executors/compound-node.executor';
import { ConditionalNodeExecutor } from '../node-executors/conditional-node.executor';
import { DataTransformNodeExecutor } from '../node-executors/data-transform-node.executor';
import { DeprecatedNodeExecutor } from '../node-executors/deprecated-node.executor';
import { ExtensionNodeExecutor } from '../node-executors/extension-node.executor';
import { HttpNodeExecutor } from '../node-executors/http-node.executor';
import { ResourceNodeExecutor } from '../node-executors/resource-node.executor';
import { SmartRoutingNodeExecutor } from '../node-executors/smart-routing-node.executor';
import { SubAgentNodeExecutor } from '../node-executors/sub-agent-node.executor';
import { TriggerNodeExecutor } from '../node-executors/trigger-node.executor';
import { ValueNodeExecutor } from '../node-executors/value-node.executor';
import { WorkflowAgentNodeExecutor } from '../node-executors/workflow-agent-node.executor';
import type { NodeSchedulerService } from '../node-scheduler.service';

function stubExecutor<T>(): T {
  return { execute: vi.fn() } as unknown as T;
}

function createDispatcher(
  http: HttpNodeExecutor = stubExecutor<HttpNodeExecutor>(),
): NodeDispatcherService {
  return new NodeDispatcherService(
    stubExecutor<WorkflowAgentNodeExecutor>(),
    stubExecutor<TriggerNodeExecutor>(),
    stubExecutor<ResourceNodeExecutor>(),
    stubExecutor<DataTransformNodeExecutor>(),
    http,
    stubExecutor<CodeNodeExecutor>(),
    stubExecutor<ConditionalNodeExecutor>(),
    stubExecutor<CompoundNodeExecutor>(),
    stubExecutor<ValueNodeExecutor>(),
    stubExecutor<SmartRoutingNodeExecutor>(),
    stubExecutor<ExtensionNodeExecutor>(),
    stubExecutor<SubAgentNodeExecutor>(),
    stubExecutor<DeprecatedNodeExecutor>(),
  );
}

function makeStep(nodeType: string): ExecutionStep {
  return {
    id: 'step-1',
    executionId: 'execution-1',
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'pending',
    nodeType,
    nodeData: {},
    input: null,
    result: null,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as ExecutionStep;
}

describe('NodeDispatcherService', () => {
  it('注册 scheduleNode 的全部存量 nodeType', () => {
    const dispatcher = createDispatcher();
    const nodeTypes = [
      'agent', 'chat-agent', 'llm-agent',
      'manual-trigger', 'schedule-trigger', 'webhook-trigger', 'api-event-trigger',
      'llm-model', 'sandbox', 'workspace', 'memory', 'knowledge-base',
      'data_transform', 'input-preprocessor', 'http-tool', 'code-tool',
      'condition', 'conditional', 'loop', 'iteration', 'loop-start',
      'iteration-start', 'loop-state', 'result', 'break', 'continue',
      'merge', 'text', 'text-output', 'json-output', 'smart-routing',
      'plugin', 'skill', 'mcp-tool', 'sub-agent',
    ];

    for (const nodeType of nodeTypes) {
      expect(dispatcher.find(nodeType), nodeType).toBeDefined();
    }
  });

  it('通过公开 executor 契约把 http-tool 上下文原样交给 HTTP 执行路径', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const http = { execute } as unknown as HttpNodeExecutor;
    const dispatcher = createDispatcher(http);
    const runtime = {} as NodeSchedulerService;
    const step = makeStep('http-tool');
    const input = { request: { query: 'workflow' } };

    await expect(dispatcher.dispatch({
      executionId: 'execution-1',
      tenantId: 'tenant-1',
      step,
      input,
      snapshot: { nodes: [], edges: [] },
      steps: [step],
      memorySessionIds: [],
      runtime,
    })).resolves.toBe(true);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        step,
        input,
        tenantId: 'tenant-1',
        executionId: 'execution-1',
        runtime,
      }),
    );
  });

  it('未知 nodeType 不执行任何 fallback executor', async () => {
    const dispatcher = createDispatcher();
    const step = makeStep('future-node');

    await expect(dispatcher.dispatch({
      executionId: 'execution-1',
      tenantId: 'tenant-1',
      step,
      input: {},
      snapshot: { nodes: [], edges: [] },
      steps: [step],
      memorySessionIds: [],
      runtime: {} as NodeSchedulerService,
    })).resolves.toBe(false);
  });
});
