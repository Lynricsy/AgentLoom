import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DRIZZLE } from '../../../database/database.module';
import { NodeSchedulerService } from '../node-scheduler.service';
import { NodeDispatcherService } from '../node-dispatcher.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { CompoundExecutionService } from '../compound-execution.service';
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
import { DagResolverService } from '../dag-resolver.service';
import { StepStateMachineService } from '../step-state-machine.service';
import { EventBridgeService } from '../services/event-bridge.service';
import {
  AGENT_TASK_QUEUE,
  MAX_ESCALATION_ATTEMPTS,
  SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
  type InterventionResolution,
  type ToolPermissionResolution,
} from '../execution.constants';
import {
  AgentExecutionException,
  InvalidStepTransitionException,
  InterventionNotAllowedException,
  NodeInputResolutionException,
  InterventionPermissionDeniedException,
} from '../execution.exceptions';
import {
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from '../../../common/exceptions/tool-call.exceptions';
import { SandboxService } from '../../sandbox/sandbox.service';
import { CheckpointService } from '../checkpoint.service';
import { InterventionPolicyService } from '../../intervention-policy/intervention-policy.service';
import { SmartRoutingService } from '../../smart-routing/smart-routing.service';
import { RouterRegistry } from '../../smart-routing/core/router-registry';
import { HealthMonitorService } from '../../smart-routing/circuit-breaker/health-monitor.service';
import { EmbeddingIntegrationService } from '../../smart-routing/embedding/embedding.service';
import { RbacCacheService } from '../../../common/services/rbac-cache.service';
import { PluginService } from '../../plugin/plugin.service';
import { PLUGIN_EXECUTION_QUEUE } from '../../plugin/plugin.constants';
import { AgentAdapterFactory } from '../adapters/agent-adapter-factory';
import { SharedResourceRegistry } from '../../shared-resources/shared-resource-registry';
import { McpService } from '../../mcp/mcp.service';
import { CodeExecutionService } from '../../agent/code-execution.service';
import { WorkspaceIntegrationService } from '../../agent-execution/workspace-integration.service';
import { OrganizationAutonomyPolicyService } from '../../organization/organization-autonomy-policy.service';
import type {
  ExecutionStep,
  ReactFlowEdge,
  ReactFlowNode,
} from '../../../database/schema';
import type { DagExecutionPlan } from '../dag-resolver.service';
export const mockOrganizationAutonomyPolicyService = {
  resolveEffectiveAutonomyMode: vi.fn().mockResolvedValue('FULL_AUTO'),
};

export const NODE_EXECUTION_PROVIDERS = [
  NodeDispatcherService,
  NodeExecutionFailurePolicy,
  CompoundExecutionService,
  CodeNodeExecutor,
  CompoundNodeExecutor,
  ConditionalNodeExecutor,
  DataTransformNodeExecutor,
  DeprecatedNodeExecutor,
  ExtensionNodeExecutor,
  HttpNodeExecutor,
  ResourceNodeExecutor,
  SmartRoutingNodeExecutor,
  SubAgentNodeExecutor,
  TriggerNodeExecutor,
  ValueNodeExecutor,
  WorkflowAgentNodeExecutor,
  {
    provide: OrganizationAutonomyPolicyService,
    useValue: mockOrganizationAutonomyPolicyService,
  },
] as const;


const EXECUTION_ID = '019577a0-0000-7000-8000-000000000001';
const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const USER_ID = '019577a0-0000-7000-8000-000000000100';
const NOW = new Date('2025-01-01T00:00:00Z');

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: '019577a0-0000-7000-8000-step00000001',
    executionId: EXECUTION_ID,
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'pending',
    nodeType: 'agent',
    nodeData: {},
    input: null,
    result: null,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ExecutionStep;
}

function makeNode(
  id: string,
  type = 'agent',
  data: Record<string, unknown> = {},
): ReactFlowNode {
  return { id, type, position: { x: 0, y: 0 }, data } as ReactFlowNode;
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): ReactFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
  } as ReactFlowEdge;
}

function makeSnapshot(nodes: ReactFlowNode[], edges: ReactFlowEdge[]) {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 }, metadata: {} };
}

function makeExecution(
  snapshot: ReturnType<typeof makeSnapshot>,
  status = 'running',
) {
  return {
    id: EXECUTION_ID,
    workflowDefinitionId: 'workflow-001',
    workflowVersionId: 'workflow-version-001',
    tenantId: TENANT_ID,
    status,
    triggerType: 'manual',
    inputParams: {},
    definitionSnapshot: snapshot,
    createdBy: 'user-001',
    completedSteps: 0,
    completedAt: null,
    failedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makePlan(
  layers: string[][],
  adjacencyMap: Map<string, string[]>,
  inDegreeMap: Map<string, number>,
): DagExecutionPlan {
  return { layers, adjacencyMap, inDegreeMap };
}

function createSelectChain(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const whereResult = Promise.resolve(result) as Promise<unknown> & {
    limit: typeof limit;
  };
  whereResult.limit = limit;
  const joinedChain = {
    where: vi.fn().mockReturnValue(whereResult),
  };

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
      innerJoin: vi.fn().mockReturnValue(joinedChain),
    }),
  };
}

function createUpdateChainVoid() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}


export {
  EXECUTION_ID,
  TENANT_ID,
  USER_ID,
  NOW,
  makeStep,
  makeNode,
  makeEdge,
  makeSnapshot,
  makeExecution,
  makePlan,
  createSelectChain,
  createUpdateChainVoid
};
