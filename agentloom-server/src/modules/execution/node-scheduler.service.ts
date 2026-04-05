import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { Script } from 'node:vm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DomainException } from '../../common/exceptions/domain.exception';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import * as schema from '../../database/schema';
import type { ReactFlowEdge } from '../../database/schema';
import type { ExecutionStep } from '../../database/schema';
import type { SandboxConfig } from '../../database/schema';
import { DagResolverService } from './dag-resolver.service';
import {
  StepStateMachineService,
  COMPLETED_STEP_STATUSES,
} from './step-state-machine.service';
import {
  AGENT_TASK_QUEUE,
  MAX_ESCALATION_ATTEMPTS,
  SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
  type AgentTaskJobData,
  type InterventionResolution,
  type SmartRoutingRuntimeContext,
  type ToolPermissionResolution,
} from './execution.constants';
import type { InterventionCheckpointRecord } from './types/execution-event.types';
import {
  NodeInputResolutionException,
  InterventionNotAllowedException,
  AgentExecutionException,
  InterventionPermissionDeniedException,
  InvalidStepTransitionException,
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
  NodeTypeMismatchException,
  isPortTypeCompatible,
} from './execution.exceptions';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import { CodeExecutionService } from '../agent/code-execution.service';
import { executeHttpToolRequest } from '../agent/http-tool-request.util';
import { SandboxService } from '../sandbox/sandbox.service';
import { CheckpointService } from './checkpoint.service';
import { EventBridgeService } from './services/event-bridge.service';
import { InterventionPolicyService } from '../intervention-policy/intervention-policy.service';
import { SmartRoutingService } from '../smart-routing/smart-routing.service';
import { RouterRegistry } from '../smart-routing/core/router-registry';
import type { RoutingCandidate } from '../smart-routing/core/routing-candidate';
import type { RoutingContext as SmartRoutingContext } from '../smart-routing/core/routing-context';
import type { RoutingDecision as RouterDecision } from '../smart-routing/core/routing-decision';
import { HealthMonitorService } from '../smart-routing/circuit-breaker/health-monitor.service';
import { EmbeddingIntegrationService } from '../smart-routing/embedding/embedding.service';
import { PluginService } from '../plugin/plugin.service';
import { PLUGIN_EXECUTION_QUEUE } from '../plugin/plugin.constants';
import type {
  MemoryResourceConfig,
  MemoryResourceInstance,
} from '../agent-memory/memory-resource.provider';
import { SharedResourceRegistry } from '../shared-resources/shared-resource-registry';
import {
  InputPreprocessorHandlerImpl,
  type InputPreprocessorConfig,
  normalizeInputPreprocessorConfig,
} from './node-handlers/input-preprocessor.handler';
import { AgentAdapterFactory } from './adapters/agent-adapter-factory';
import { getModelRoutingMeta } from '../llm/llm-provider-catalog';
import { SkillResolverService } from '../skill/skill-resolver.service';
import { McpService } from '../mcp/mcp.service';
import type { McpRuntimeConnection } from '../mcp/mcp.service';
import { WorkspaceIntegrationService } from '../agent-execution/workspace-integration.service';
import {
  filterTopLevelExecutionGraph,
  isCompoundInternalStep,
  readCompoundParentNodeId,
  readExecutionRuntimeMeta,
} from './compound-runtime.util';

/** 调度决策 */
type SchedulingDecision = 'schedule' | 'skip' | 'wait';

interface ScheduleNodeOptions {
  readonly skipLatestState?: boolean;
}

interface InterventionTimeoutOptions {
  readonly escalated?: boolean;
  readonly escalationCount?: number;
}

interface CompoundExecutionContext {
  executionId: string;
  tenantId: string;
  parentNodeId: string;
  parentStepId: string;
  parentNodeType: 'loop' | 'iteration';
  parentInput: Record<string, unknown>;
  outputMode: 'none' | 'collect-array' | 'last';
  internalNodes: schema.ReactFlowNode[];
  internalEdges: ReactFlowEdge[];
  orderedNodeIds: string[];
  extraInputPortIds: string[];
  iterationItems: unknown[];
  iterationIndex: number;
  completedRounds: number;
  loopState: unknown;
  loopRound: number;
  maxIterations: number;
  previousResult: Record<string, unknown> | null;
  roundOutputs: Record<string, unknown>;
  finalOutputs: Record<string, unknown>;
  breakRequested: boolean;
  continueRequested: boolean;
  nextStateProvided: boolean;
  nextState: unknown;
}

function buildInterventionTimeoutJobId(stepId: string): string {
  return `intervention-timeout:${stepId}`;
}

function buildEscalatedInterventionTimeoutJobId(
  stepId: string,
  escalationCount: number,
): string {
  return `intervention-timeout:${stepId}:escalated:${escalationCount}`;
}

function buildCompoundContextKey(
  executionId: string,
  parentNodeId: string,
): string {
  return `${executionId}:${parentNodeId}`;
}

@Injectable()
export class NodeSchedulerService {
  private readonly logger = new Logger(NodeSchedulerService.name);
  private readonly compoundContexts = new Map<
    string,
    CompoundExecutionContext
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dagResolver: DagResolverService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly sandboxService: SandboxService,
    private readonly checkpointService: CheckpointService,
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
    private readonly eventBridge: EventBridgeService,
    private readonly interventionPolicyService: InterventionPolicyService,
    private readonly rbacCacheService: RbacCacheService,
    private readonly smartRoutingService: SmartRoutingService,
    private readonly routerRegistry: RouterRegistry,
    private readonly healthMonitorService: HealthMonitorService,
    private readonly embeddingService: EmbeddingIntegrationService,
    private readonly pluginService: PluginService,
    private readonly codeExecutionService: CodeExecutionService,
    private readonly workflowAgentAdapterFactory: AgentAdapterFactory,
    private readonly sharedResourceRegistry: SharedResourceRegistry,
    @InjectQueue(AGENT_TASK_QUEUE)
    private readonly agentTaskQueue: Queue,
    @InjectQueue(PLUGIN_EXECUTION_QUEUE)
    private readonly pluginQueue: Queue,
    @Optional()
    @Inject(SkillResolverService)
    private readonly skillResolverService?: SkillResolverService,
    @Optional()
    private readonly mcpService?: McpService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  // ── 公开 API ───────────────────────────────────────────────

  /**
   * 启动 DAG 执行调度。
   *
   * 前置条件：execution 已 running，steps 已创建（status: pending）。
   */
  async startExecution(executionId: string, tenantId: string): Promise<void> {
    const { snapshot, steps } = await this.loadExecutionContext(executionId);
    const topLevelGraph = filterTopLevelExecutionGraph(snapshot);
    const plan = this.dagResolver.resolveDag(
      topLevelGraph.nodes,
      topLevelGraph.edges,
    );

    // 空图直接收尾
    if (plan.layers.length === 0) {
      await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);
      return;
    }

    await Promise.all(
      plan.layers[0].map((nodeId) =>
        this.scheduleNode(executionId, nodeId, tenantId, topLevelGraph, steps),
      ),
    );
  }

  /**
   * 节点完成 / 跳过后的后续调度。
   *
   * AgentTaskWorker、executeDataTransform、executeConditional
   * 完成后均应调用此方法。
   */
  async onNodeCompleted(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<void> {
    // 每次都从 DB 读取最新状态，保证递归调用时数据一致
    const [completedStep] = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    const { execution, snapshot, steps } =
      await this.loadExecutionContext(executionId);

    if (execution.status === 'failed' || execution.status === 'cancelled') {
      return;
    }

    if (isCompoundInternalStep(completedStep)) {
      await this.onCompoundInternalNodeCompleted(
        executionId,
        completedStep,
        steps,
        tenantId,
      );
      await this.checkpointService.saveCheckpoint(
        tenantId,
        executionId,
        stepId,
      );
      return;
    }

    const topLevelGraph = filterTopLevelExecutionGraph(snapshot);
    const plan = this.dagResolver.resolveDag(
      topLevelGraph.nodes,
      topLevelGraph.edges,
    );

    const successors = plan.adjacencyMap.get(completedStep.nodeId) ?? [];

    // 条件节点需要分支处理
    if (
      completedStep.nodeType === 'condition' &&
      completedStep.status === 'completed' &&
      completedStep.result
    ) {
      await this.handleConditionalBranching(
        executionId,
        completedStep.nodeId,
        completedStep.result.branch as string,
        topLevelGraph,
        steps,
        tenantId,
      );
    } else {
      // 普通完成或被跳过：逐个检查后继
      for (const successorId of successors) {
        const decision = this.getSchedulingDecision(
          successorId,
          topLevelGraph.edges,
          steps,
        );

        if (decision === 'schedule') {
          await this.scheduleNode(
            executionId,
            successorId,
            tenantId,
            topLevelGraph,
            steps,
          );
        } else if (decision === 'skip') {
          await this.skipAndCascade(executionId, successorId, steps, tenantId);
        }
        // 'wait' → 不操作
      }
    }

    await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);
    await this.cleanupConnectedSandboxIfIdle(
      completedStep,
      executionId,
      tenantId,
      snapshot,
      steps,
    );
    await this.cleanupSandboxIfTerminal(executionId, tenantId);
    await this.checkpointService.saveCheckpoint(tenantId, executionId, stepId);
  }
  async scheduleNode(
    executionId: string,
    nodeId: string,
    tenantId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    steps: ExecutionStep[],
    options?: ScheduleNodeOptions,
  ): Promise<void> {
    const latestState = await this.loadLatestSchedulingState(executionId);
    if (
      latestState &&
      (latestState.execution.status === 'failed' ||
        latestState.execution.status === 'cancelled' ||
        latestState.execution.status === 'completed')
    ) {
      return;
    }

    const resolvedSnapshot = options?.skipLatestState
      ? snapshot
      : (latestState?.snapshot ?? snapshot);
    const resolvedSteps = options?.skipLatestState
      ? steps
      : (latestState?.steps ?? steps);
    const step = resolvedSteps.find((s) => s.nodeId === nodeId);
    if (!step) return;
    if (step.status !== 'pending') return;

    let input: Record<string, unknown>;
    try {
      input = this.resolveNodeInput(
        nodeId,
        resolvedSnapshot.edges,
        resolvedSteps,
        resolvedSnapshot.nodes,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      )
        throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? { type: error.type, title: error.message, detail: error.detail }
              : {}),
            ...(error instanceof NodeTypeMismatchException
              ? { typeMismatch: error.typeMismatch }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
      return;
    }

    // 保存 input 并转为 queued
    await this.tenantDb
      .update(schema.executionSteps)
      .set({ input })
      .where(eq(schema.executionSteps.id, step.id));

    const sandboxBinding = this.getExecutionSandboxBinding(
      nodeId,
      executionId,
      resolvedSnapshot.edges,
      resolvedSteps,
      input,
    );
    const memorySessionIds = this.getUpstreamMemorySessionIds(
      nodeId,
      resolvedSnapshot.edges,
      resolvedSteps,
    );

    switch (step.nodeType) {
      case 'agent':
      case 'chat-agent':
        if (this.getWorkflowAgentDefinitionId(step.nodeData ?? {})) {
          await this.executeWorkflowAgentNode(
            step,
            input,
            tenantId,
            executionId,
            resolvedSnapshot.edges,
            resolvedSteps,
          );
          break;
        }

        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'queued',
        );
        {
          const { data, options } = await this.buildAgentTaskJobData({
            executionId,
            tenantId,
            step,
            input,
            sandboxBinding,
            memorySessionIds,
          });
          await this.agentTaskQueue.add('agent-task', data, options);
        }
        break;

      case 'manual-trigger':
      case 'schedule-trigger':
      case 'webhook-trigger':
      case 'api-event-trigger':
        await this.executeTriggerNode(step, tenantId, executionId);
        break;

      case 'llm-model':
        await this.executeLlmModelNode(step, tenantId, executionId);
        break;

      case 'sandbox':
        await this.executeSandboxNode(
          step,
          input,
          tenantId,
          executionId,
          resolvedSnapshot.edges,
          resolvedSteps,
        );
        break;

      case 'workspace':
        await this.executeWorkspaceNode(step, tenantId, executionId);
        break;

      case 'memory':
        await this.executeMemoryNode(step, tenantId, executionId);
        break;

      case 'knowledge-base':
        await this.executeKnowledgeNode(step, tenantId, executionId);
        break;

      case 'data_transform':
        await this.executeDataTransform(step, input, tenantId, executionId);
        break;

      case 'input-preprocessor':
        await this.executeInputPreprocessor(step, input, tenantId, executionId);
        break;

      case 'http-tool':
        await this.executeHttpToolNode(step, input, tenantId, executionId);
        break;

      case 'code-tool':
        await this.executeCodeToolNode(step, input, tenantId, executionId);
        break;

      case 'condition':
      case 'conditional':
        await this.executeConditional(step, input, tenantId, executionId);
        break;

      case 'loop':
        await this.executeLoopNode(step, input, tenantId, executionId);
        break;

      case 'iteration':
        await this.executeIterationNode(step, input, tenantId, executionId);
        break;

      case 'loop-start':
        await this.executeLoopStartNode(step, tenantId, executionId);
        break;

      case 'iteration-start':
        await this.executeIterationStartNode(step, tenantId, executionId);
        break;

      case 'loop-state':
        await this.executeLoopStateNode(step, input, tenantId, executionId);
        break;

      case 'result':
        await this.executeResultNode(step, input, tenantId, executionId);
        break;

      case 'break':
        await this.executeBreakNode(step, input, tenantId, executionId);
        break;

      case 'continue':
        await this.executeContinueNode(step, input, tenantId, executionId);
        break;

      case 'merge':
        await this.executeMerge(step, input, tenantId, executionId);
        break;

      case 'text-output':
      case 'json-output':
        await this.executeOutputNode(step, input, tenantId, executionId);
        break;

      case 'smart-routing':
        await this.executeSmartRouting(step, input, tenantId, executionId);
        break;

      case 'plugin':
        await this.executePlugin(step, input, tenantId, executionId);
        break;

      case 'skill':
        await this.executeSkillNode(step, input, tenantId, executionId);
        break;

      case 'mcp-tool':
        await this.executeMcpToolNode(step, input, tenantId, executionId);
        break;

      case 'sub-agent':
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'queued',
        );
        {
          const { data, options } = await this.buildAgentTaskJobData({
            executionId,
            tenantId,
            step,
            input,
            sandboxBinding,
            memorySessionIds,
          });
          await this.agentTaskQueue.add('agent-task', data, options);
        }
        break;

      default:
        this.logger.warn(`未知节点类型 "${step.nodeType}"，按 agent 处理`);
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'queued',
        );
        {
          const { data, options } = await this.buildAgentTaskJobData({
            executionId,
            tenantId,
            step,
            input,
            sandboxBinding,
            memorySessionIds,
          });
          await this.agentTaskQueue.add('agent-task', data, options);
        }
    }
  }

  private async executePlugin(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    const nodeData = this.isRecord(step.nodeData) ? step.nodeData : {};
    const pluginId =
      typeof nodeData.pluginId === 'string' ? nodeData.pluginId : undefined;
    const pluginNodeType =
      typeof nodeData.pluginNodeType === 'string'
        ? nodeData.pluginNodeType
        : undefined;
    const orgId =
      typeof nodeData.orgId === 'string' ? nodeData.orgId : undefined;

    if (!pluginId || !pluginNodeType) {
      throw new Error('Plugin node missing pluginId or pluginNodeType');
    }

    const plugin = await this.pluginService.findActiveByPluginId(
      pluginId,
      orgId,
      tenantId,
    );

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'queued');

    await this.pluginQueue.add('execute-plugin-node', {
      tenantId,
      executionId,
      stepId: step.id,
      pluginId: plugin.pluginId,
      nodeType: pluginNodeType,
      inputs: input,
      config: this.isRecord(nodeData.pluginConfig) ? nodeData.pluginConfig : {},
    });
  }

  /**
   * 解析节点输入：收集所有入边对应源节点的 result。
   * 被跳过的源节点不提供输入，根节点返回空对象。
   */
  resolveNodeInput(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
    nodes: schema.ReactFlowNode[] = [],
  ): Record<string, unknown> {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    if (incomingEdges.length === 0) return {};

    const input: Record<string, unknown> = {};

    for (const edge of incomingEdges) {
      const sourceStep = steps.find((s) => s.nodeId === edge.source);
      if (!sourceStep) {
        throw new NodeInputResolutionException(nodeId);
      }

      // 被跳过的源节点不提供输入
      if (sourceStep.status === 'skipped') continue;

      if (sourceStep.result === null || sourceStep.result === undefined) {
        throw new NodeInputResolutionException(nodeId);
      }

      this.checkEdgePortTypeCompatibility(edge, nodes);

      const sourceHandle = this.readEdgeHandle(edge, 'source');
      const targetHandle = this.readEdgeHandle(edge, 'target');

      if (targetHandle) {
        this.setValueAtPath(
          input,
          targetHandle,
          sourceHandle
            ? this.resolveSourceHandleValue(sourceStep, sourceHandle)
            : sourceStep.result,
        );
        continue;
      }

      if (sourceHandle) {
        this.setValueAtPath(
          input,
          sourceHandle,
          this.resolveSourceHandleValue(sourceStep, sourceHandle),
        );
        continue;
      }

      input[edge.source] = sourceStep.result;
    }

    return input;
  }

  private checkEdgePortTypeCompatibility(
    edge: ReactFlowEdge,
    nodes: schema.ReactFlowNode[],
  ): void {
    const sourceHandle = this.readEdgeHandle(edge, 'source');
    const targetHandle = this.readEdgeHandle(edge, 'target');
    if (!sourceHandle || !targetHandle) return;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) return;

    const sourcePortMeta = sourceNode.data?.portMappingMetadata as
      | { outputs?: Array<{ name: string; dataType: string }> }
      | undefined;
    const targetPortMeta = targetNode.data?.portMappingMetadata as
      | { inputs?: Array<{ name: string; dataType: string }> }
      | undefined;

    const sourcePort = sourcePortMeta?.outputs?.find(
      (p) => p.name === sourceHandle,
    );
    const targetPort = targetPortMeta?.inputs?.find(
      (p) => p.name === targetHandle,
    );
    if (!sourcePort?.dataType || !targetPort?.dataType) return;

    if (!isPortTypeCompatible(sourcePort.dataType, targetPort.dataType)) {
      throw new NodeTypeMismatchException({
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourcePortId: sourceHandle,
        targetPortId: targetHandle,
        sourceType: sourcePort.dataType,
        targetType: targetPort.dataType,
        edgeId: edge.id,
      });
    }
  }

  /**
   * 恢复调度：找出所有前驱已完成的 pending 节点并调度。
   *
   * 在 CheckpointService.resumeExecution 重置步骤后调用。
   */
  async resumeScheduling(executionId: string, tenantId: string): Promise<void> {
    const { snapshot, steps } = await this.loadExecutionContext(executionId);
    const topLevelGraph = filterTopLevelExecutionGraph(snapshot);
    const plan = this.dagResolver.resolveDag(
      topLevelGraph.nodes,
      topLevelGraph.edges,
    );

    for (const layer of plan.layers) {
      for (const nodeId of layer) {
        const step = steps.find((s) => s.nodeId === nodeId);
        if (!step || step.status !== 'pending') continue;

        const decision = this.getSchedulingDecision(
          nodeId,
          topLevelGraph.edges,
          steps,
        );
        if (decision === 'schedule') {
          await this.scheduleNode(
            executionId,
            nodeId,
            tenantId,
            topLevelGraph,
            steps,
          );
        }
      }
    }
  }

  /**
   * 节点失败后的级联处理。
   */
  async onNodeFailed(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<void> {
    const [failedStep] = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    if (!failedStep) return;

    const { steps } = await this.loadExecutionContext(executionId);
    if (isCompoundInternalStep(failedStep)) {
      await this.onCompoundInternalNodeFailed(
        executionId,
        failedStep,
        steps,
        tenantId,
      );
      return;
    }
    const cancellableStatuses = new Set([
      'pending',
      'queued',
      'waiting_intervention',
    ]);

    for (const step of steps) {
      if (step.id !== stepId && cancellableStatuses.has(step.status)) {
        try {
          await this.stepStateMachine.updateStepStatus(
            tenantId,
            step.id,
            'cancelled',
          );
        } catch (error) {
          this.logger.warn(
            `级联取消步骤 ${step.id} 失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    const errorMessage = failedStep.errorMessage ?? {
      message: '节点执行失败',
    };

    await this.stepStateMachine.markExecutionFailed(
      executionId,
      tenantId,
      errorMessage,
    );
    await this.cleanupSandboxIfTerminal(executionId, tenantId);
  }

  async resolveIntervention(
    executionId: string,
    stepId: string,
    tenantId: string,
    userId: string,
    resolution: InterventionResolution,
  ): Promise<void> {
    const [step] = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    if (!step) {
      throw new AgentExecutionException(`步骤 ${stepId} 不存在`);
    }

    if (step.executionId !== executionId) {
      throw new AgentExecutionException(
        `步骤 ${stepId} 不属于执行 ${executionId}`,
      );
    }

    if (step.status !== 'waiting_intervention') {
      throw new InterventionNotAllowedException(stepId, step.status);
    }

    const checkpoint = step.checkpointData ?? {};
    const sessionId =
      typeof checkpoint.sessionId === 'string'
        ? checkpoint.sessionId
        : undefined;

    if (!sessionId) {
      throw new AgentExecutionException('步骤检查点数据缺少 sessionId');
    }

    if (userId !== SYSTEM_TIMEOUT_INTERVENTION_USER_ID) {
      const workflowDefinitionId =
        await this.loadWorkflowDefinitionId(executionId);
      const resolvedPolicy = await this.interventionPolicyService.resolvePolicy(
        tenantId,
        workflowDefinitionId,
        step.nodeId,
      );
      const userRole = await this.rbacCacheService.getUserRole(
        tenantId,
        userId,
      );

      if (!userRole || !resolvedPolicy.allowedRoles.includes(userRole)) {
        throw new InterventionPermissionDeniedException();
      }
    }

    const requestedAt =
      resolution.requestedAt ??
      (typeof checkpoint.interventionRequestedAt === 'string'
        ? checkpoint.interventionRequestedAt
        : new Date().toISOString());
    const resolvedAt = resolution.resolvedAt ?? new Date().toISOString();
    const timeout =
      resolution.timeout === true ||
      userId === SYSTEM_TIMEOUT_INTERVENTION_USER_ID;
    const interventionRecord: InterventionCheckpointRecord = {
      requested_at: requestedAt,
      resolved_at: resolvedAt,
      action: resolution.action,
      instruction: resolution.modifiedContent ?? resolution.feedback ?? null,
      resolved_by_user_id: userId,
      ...(timeout ? { timeout: true } : {}),
    };

    const nodeName = this.resolveNodeName(step, checkpoint);

    try {
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        stepId,
        'running',
        {
          checkpointData: {
            ...checkpoint,
            interventionRequestedAt: requestedAt,
            interventionNodeName: nodeName,
            intervention: interventionRecord,
          },
        },
      );
    } catch (error) {
      if (error instanceof InvalidStepTransitionException) {
        const [latestStep] = await this.tenantDb
          .select({ status: schema.executionSteps.status })
          .from(schema.executionSteps)
          .where(eq(schema.executionSteps.id, stepId))
          .limit(1);

        throw new InterventionNotAllowedException(
          stepId,
          latestStep?.status ?? step.status,
        );
      }

      throw error;
    }

    await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);

    this.eventBridge.emitInterventionResolved(tenantId, executionId, {
      stepId,
      nodeId: step.nodeId,
      action: resolution.action,
      ...(resolution.feedback ? { feedback: resolution.feedback } : {}),
      ...(resolution.modifiedContent !== undefined
        ? { modifiedContent: resolution.modifiedContent }
        : {}),
      resolvedBy: userId,
      resolvedAt,
      ...(timeout ? { timeout: true } : {}),
    });
    await this.removeInterventionTimeout(stepId);

    await this.agentTaskQueue.add('agent-task', {
      executionId,
      stepId,
      tenantId,
      input: step.input ?? {},
      nodeData: step.nodeData ?? {},
      resumeSessionId: sessionId,
      intervention: {
        ...resolution,
        requestedAt,
        resolvedAt,
        resolvedByUserId: userId,
        ...(timeout ? { timeout: true } : {}),
        nodeName,
      },
    } satisfies AgentTaskJobData);

    this.logger.log(
      `干预恢复任务已排队: ${JSON.stringify({ executionId, stepId })}`,
    );
  }

  async resolveToolPermission(
    executionId: string,
    stepId: string,
    toolCallId: string,
    tenantId: string,
    resolution: ToolPermissionResolution,
  ): Promise<void> {
    const tenantDb = getTenantDb(this.db);

    const [step] = await tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    if (!step) {
      throw new AgentExecutionException(`步骤 ${stepId} 不存在`);
    }

    if (step.executionId !== executionId) {
      throw new AgentExecutionException(
        `步骤 ${stepId} 不属于执行 ${executionId}`,
      );
    }

    if (step.status !== 'running') {
      throw new ToolPermissionResolutionNotAllowedException(
        toolCallId,
        step.status,
      );
    }

    const checkpoint = step.checkpointData ?? {};
    const sessionId =
      typeof checkpoint.sessionId === 'string'
        ? checkpoint.sessionId
        : undefined;

    if (!sessionId) {
      throw new AgentExecutionException('步骤检查点数据缺少 sessionId');
    }

    const toolCalls = Array.isArray(checkpoint.toolCalls)
      ? (checkpoint.toolCalls as ToolCallEvent[])
      : [];
    const toolCall = toolCalls.find((tc) => tc.id === toolCallId);

    if (!toolCall) {
      throw new ToolCallNotFoundException(toolCallId);
    }

    if (toolCall.status !== 'awaiting_permission') {
      throw new ToolPermissionResolutionNotAllowedException(
        toolCallId,
        toolCall.status,
      );
    }

    await this.agentTaskQueue.add('agent-task', {
      executionId,
      stepId,
      tenantId,
      input: step.input ?? {},
      nodeData: step.nodeData ?? {},
      resumeSessionId: sessionId,
      toolPermission: resolution,
    } satisfies AgentTaskJobData);

    this.logger.log(
      `工具权限解析任务已排队: ${JSON.stringify({ executionId, stepId, toolCallId, action: resolution.action })}`,
    );
  }

  private resolveNodeName(
    step: ExecutionStep,
    checkpoint: Record<string, unknown>,
  ): string {
    if (
      typeof checkpoint.interventionNodeName === 'string' &&
      checkpoint.interventionNodeName.trim()
    ) {
      return checkpoint.interventionNodeName.trim();
    }

    const nodeData = step.nodeData;
    if (
      nodeData &&
      typeof nodeData.label === 'string' &&
      nodeData.label.trim()
    ) {
      return nodeData.label.trim();
    }

    return step.nodeId;
  }

  async enqueueInterventionTimeout(
    executionId: string,
    stepId: string,
    tenantId: string,
    options: InterventionTimeoutOptions | number = {},
  ): Promise<void> {
    const timeoutOptions: InterventionTimeoutOptions =
      typeof options === 'number' ? {} : options;
    const timeoutMs =
      typeof options === 'number'
        ? options
        : await this.resolveInterventionTimeoutMs(stepId, tenantId);

    await this.agentTaskQueue.add(
      'intervention-timeout',
      {
        executionId,
        stepId,
        tenantId,
        ...(typeof timeoutOptions.escalationCount === 'number'
          ? { escalationCount: timeoutOptions.escalationCount }
          : {}),
      } satisfies AgentTaskJobData,
      {
        delay: timeoutMs,
        jobId: timeoutOptions.escalated
          ? buildEscalatedInterventionTimeoutJobId(
              stepId,
              timeoutOptions.escalationCount ?? 1,
            )
          : buildInterventionTimeoutJobId(stepId),
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    const timeoutHours = Math.round(timeoutMs / 3600000);
    this.logger.log(
      `Intervention timeout enqueued (${timeoutHours}h): ${JSON.stringify({ executionId, stepId })}`,
    );
  }

  private async resolveInterventionTimeoutMs(
    stepId: string,
    tenantId: string,
  ): Promise<number> {
    const [context] = await this.tenantDb
      .select({
        nodeId: schema.executionSteps.nodeId,
        workflowDefinitionId: schema.workflowExecutions.workflowDefinitionId,
      })
      .from(schema.executionSteps)
      .innerJoin(
        schema.workflowExecutions,
        eq(schema.workflowExecutions.id, schema.executionSteps.executionId),
      )
      .where(eq(schema.executionSteps.id, stepId))
      .limit(1);

    if (!context) {
      throw new AgentExecutionException(`步骤 ${stepId} 不存在`);
    }

    const resolvedPolicy = await this.interventionPolicyService.resolvePolicy(
      tenantId,
      context.workflowDefinitionId,
      context.nodeId,
    );

    return resolvedPolicy.timeoutSeconds * 1000;
  }

  private async loadWorkflowDefinitionId(executionId: string): Promise<string> {
    const [execution] = await this.tenantDb
      .select({
        workflowDefinitionId: schema.workflowExecutions.workflowDefinitionId,
      })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId))
      .limit(1);

    if (!execution) {
      throw new AgentExecutionException(`执行 ${executionId} 不存在`);
    }

    return execution.workflowDefinitionId;
  }

  private async removeInterventionTimeout(stepId: string): Promise<void> {
    // 移除主超时任务
    const jobId = buildInterventionTimeoutJobId(stepId);
    const job = await this.agentTaskQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Intervention timeout removed: ${jobId}`);
    }

    for (
      let escalationCount = 1;
      escalationCount <= MAX_ESCALATION_ATTEMPTS;
      escalationCount += 1
    ) {
      const escJobId = buildEscalatedInterventionTimeoutJobId(
        stepId,
        escalationCount,
      );
      const escJob = await this.agentTaskQueue.getJob(escJobId);
      if (escJob) {
        await escJob.remove();
        this.logger.log(`Escalation timeout removed: ${escJobId}`);
      }
    }
  }

  /**
   * 内联执行数据转换节点。
   */
  async executeDataTransform(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = step.nodeData ?? {};
      const expression =
        typeof nodeData.expression === 'string'
          ? nodeData.expression.trim()
          : '';
      const mapping = nodeData.mapping as Record<string, string> | undefined;

      let result: Record<string, unknown>;

      if (expression) {
        result = this.normalizeTransformResult(
          this.evaluateExpression(expression, input),
        );
      } else if (mapping) {
        result = {};
        for (const [outputKey, inputPath] of Object.entries(mapping)) {
          result[outputKey] = this.resolveJsonPath(input, inputPath);
        }
      } else {
        // 无映射配置 → 透传
        result = { ...input };
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result: result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      // updateStepStatus 抛出的 InvalidStepTransitionException 不二次捕获
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeInputPreprocessor(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const config: InputPreprocessorConfig =
        normalizeInputPreprocessorConfig(nodeData);

      const handler = new InputPreprocessorHandlerImpl();
      const { output, outputFormat } = await handler.execute(input, config);

      const result: Record<string, unknown> =
        typeof output === 'string'
          ? {
              text: output,
              'text-out': output,
              'exec-out': { triggered: true },
            }
          : {
              ...output,
              json: output,
              'json-out': output,
              'exec-out': { triggered: true },
            };

      if (outputFormat) {
        result._outputFormat = outputFormat;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeHttpToolNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const url = this.readFirstString(nodeData.url);
      if (!url) {
        throw new Error('HTTP Tool 节点缺少 URL 配置');
      }

      const method = this.readHttpMethod(nodeData.method);
      const timeout = this.readOptionalNumber(
        nodeData.timeout,
        nodeData.timeoutSeconds,
        nodeData.timeout_seconds,
      );
      const request = this.buildHttpToolRequestInput(nodeData, input);
      const response = await executeHttpToolRequest(
        {
          url,
          method,
          ...(timeout !== undefined ? { timeout } : {}),
        },
        request,
      );
      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        response,
        'exec-out': {
          triggered: true,
          success: response.ok,
          status: response.status,
        },
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeCodeToolNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const language = this.readFirstString(nodeData.language);
      const rawCode = typeof nodeData.code === 'string' ? nodeData.code : '';
      const timeout = this.readOptionalNumber(
        nodeData.timeout,
        nodeData.timeoutSeconds,
        nodeData.timeout_seconds,
      );

      if (
        language !== 'typescript' &&
        language !== 'javascript' &&
        language !== 'python' &&
        language !== 'bash'
      ) {
        throw new Error('Code Tool 节点缺少受支持的 language 配置');
      }

      if (!rawCode.trim()) {
        throw new Error('Code Tool 节点缺少 code 配置');
      }

      const executionResult = await this.codeExecutionService.execute({
        language,
        code: rawCode,
        input: this.extractCodeToolInputPayload(input),
        ...(timeout !== undefined ? { timeout } : {}),
      });

      const result = {
        success: executionResult.success,
        result: executionResult.output,
        output: executionResult.output,
        stdout: executionResult.stdout,
        stderr: executionResult.stderr,
        executionTimeMs: executionResult.executionTimeMs,
        'exec-out': {
          triggered: true,
          success: executionResult.success,
        },
        ...(executionResult.error ? { error: executionResult.error } : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeSkillNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    void input;

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.isRecord(step.nodeData) ? step.nodeData : {};
      const config = this.isRecord(nodeData.config)
        ? nodeData.config
        : nodeData;
      const skillId =
        typeof config.skillId === 'string' && config.skillId.trim().length > 0
          ? config.skillId.trim()
          : undefined;

      if (!skillId) {
        this.logger.warn(`Skill node ${step.nodeId} has no skillId configured`);
        const skillOutput = { warning: 'No skillId configured', skills: [] };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...skillOutput,
              'skill-out': skillOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await this.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      if (!this.skillResolverService) {
        this.logger.warn(
          `SkillResolverService unavailable for skill node ${step.nodeId}`,
        );
        const skillOutput = {
          warning: 'Skill resolver unavailable',
          skills: [],
        };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...skillOutput,
              'skill-out': skillOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await this.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      const skills = await this.skillResolverService.resolveSkillsForAgent(
        tenantId,
        [skillId],
      );

      if (skills.length === 0) {
        this.logger.warn(
          `Skill ${skillId} not found or not active for tenant ${tenantId}`,
        );
        const skillOutput = {
          warning: `Skill ${skillId} not found or inactive`,
          skills: [],
        };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...skillOutput,
              'skill-out': skillOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await this.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      const skillPayloads = skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        content: skill.content,
      }));
      const skillOutput = { skills: skillPayloads };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...skillOutput,
            'skill-out': skillOutput,
            'exec-out': { triggered: true },
          },
        },
      );
      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  /** 内联处理 MCP 工具节点：同步完成，输出工具描述符供下游 agent 节点消费。 */
  async executeMcpToolNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    void input;

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const mcpServerConfigId = this.readFirstString(
        nodeData.mcpServerConfigId,
        nodeData.mcp_server_config_id,
      );
      const enabledToolIds = this.readStringArray(
        nodeData.enabledToolIds,
        nodeData.enabled_tool_ids,
      );
      const tools = this.extractConfiguredMcpTools(nodeData, enabledToolIds);
      const selectedTool = tools[0];

      if (!mcpServerConfigId || !selectedTool) {
        this.logger.warn(
          `MCP tool node ${step.nodeId} missing mcpServerConfigId or toolName`,
        );
        const toolOutput = {
          warning: 'MCP tool node missing mcpServerConfigId or toolName',
          type: 'mcp-tool',
        };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...toolOutput,
              'tool-out': toolOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await this.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      const descriptor: Record<string, unknown> = {
        type: 'mcp-tool',
        mcpServerConfigId,
        toolName: selectedTool.toolName,
        tools,
        ...(enabledToolIds.length > 0 ? { enabledToolIds } : {}),
        ...(selectedTool.mcpToolDefinitionId
          ? { mcpToolDefinitionId: selectedTool.mcpToolDefinitionId }
          : {}),
        ...(selectedTool.inputSchema
          ? { inputSchema: selectedTool.inputSchema }
          : {}),
        ...(selectedTool.portMapping
          ? { portMapping: selectedTool.portMapping }
          : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...descriptor,
            'tool-out': descriptor,
            'exec-out': { triggered: true },
          },
        },
      );
      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  /**
   * 内联执行条件节点。
   */
  async executeConditional(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const flatInput = this.flattenInput(input);

      // 检测新格式（branches 数组）vs 旧格式（mode + expression/conditionField）
      const branches = this.resolveConditionBranches(nodeData);

      // 顺序评估每个分支，找到第一个匹配的
      let matchedBranchId: string | null = null;

      for (const branch of branches) {
        const matches = this.evaluateConditionBranch(branch, input, flatInput);
        if (matches) {
          matchedBranchId = branch.id;
          break;
        }
      }

      // 构建 result：匹配分支获得 payload，其他为 null
      const winnerBranchId = matchedBranchId ?? 'else';
      const result: Record<string, unknown> = {
        branch: winnerBranchId,
      };

      for (const branch of branches) {
        result[branch.id] = branch.id === matchedBranchId ? input : null;
      }
      result['else'] = matchedBranchId === null ? input : null;

      // 向后兼容旧 matched/unmatched 键名
      if (branches.length === 1) {
        const isMatched = matchedBranchId === branches[0].id;
        result['matched-out'] = isMatched ? input : null;
        result['unmatched-out'] = isMatched ? null : input;
        result['matched'] = result['matched-out'];
        result['unmatched'] = result['unmatched-out'];
        result['true'] = result['matched-out'];
        result['false'] = result['unmatched-out'];
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeLoopNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.startCompoundExecution(
      step,
      input,
      tenantId,
      executionId,
      'loop',
    );
  }

  async executeIterationNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.startCompoundExecution(
      step,
      input,
      tenantId,
      executionId,
      'iteration',
    );
  }

  async executeLoopStartNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: this.buildLoopStartResult(context),
        },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeIterationStartNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: this.buildIterationStartResult(context),
        },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeLoopStateNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      context.nextStateProvided = true;
      context.nextState = this.extractCompoundValueInput(input, 'state-in');

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            state: context.nextState,
            'exec-out': { triggered: true },
          },
        },
      );
      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeResultNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const outputKey =
        this.readFirstString(nodeData.outputKey, nodeData.output_key) ??
        'result';
      const value = this.extractCompoundValueInput(input, 'value-in');

      context.roundOutputs[outputKey] = value;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            outputKey,
            value,
          },
        },
      );
      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeBreakNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      const triggered = this.shouldTriggerJumpNode(step, input);
      if (triggered) {
        context.breakRequested = true;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            action: 'break',
            triggered,
          },
        },
      );
      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeContinueNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      const triggered = this.shouldTriggerJumpNode(step, input);
      if (triggered) {
        context.continueRequested = true;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            action: 'continue',
            triggered,
          },
        },
      );
      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  private async startCompoundExecution(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    parentNodeType: 'loop' | 'iteration',
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const { snapshot, steps } = await this.loadExecutionContext(executionId);
      const context = this.createCompoundContext(
        step,
        input,
        tenantId,
        executionId,
        snapshot,
        parentNodeType,
      );

      const contextKey = buildCompoundContextKey(
        executionId,
        context.parentNodeId,
      );
      this.compoundContexts.set(contextKey, context);

      if (
        context.internalNodes.length === 0 ||
        (context.parentNodeType === 'iteration' &&
          context.iterationItems.length === 0)
      ) {
        await this.finalizeCompoundExecution(context, tenantId);
        return;
      }

      await this.resetCompoundRoundSteps(context, steps, tenantId);
      await this.scheduleNextCompoundNode(context, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  private createCompoundContext(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    parentNodeType: 'loop' | 'iteration',
  ): CompoundExecutionContext {
    const parentNodeId = step.nodeId;
    const internalNodes = snapshot.nodes.filter(
      (node) => readCompoundParentNodeId(node) === parentNodeId,
    );
    const internalNodeIds = new Set(internalNodes.map((node) => node.id));
    const internalEdges = snapshot.edges.filter(
      (edge) =>
        internalNodeIds.has(edge.source) && internalNodeIds.has(edge.target),
    );
    const orderedNodeIds = this.dagResolver
      .resolveDag(internalNodes, internalEdges)
      .layers.flat();

    const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
    const inputPorts = Array.isArray(nodeData.inputPorts)
      ? nodeData.inputPorts
      : Array.isArray(nodeData.input_ports)
        ? nodeData.input_ports
        : [];
    const extraInputPortIds = inputPorts
      .filter(
        (port) =>
          this.isRecord(port) &&
          typeof port.id === 'string' &&
          port.id.startsWith('input-'),
      )
      .map((port) => port.id as string);
    const configuredMaxIterations = this.readOptionalNumber(
      nodeData.maxIterations,
      nodeData.max_iterations,
    );

    return {
      executionId,
      tenantId,
      parentNodeId,
      parentStepId: step.id,
      parentNodeType,
      parentInput: input,
      outputMode:
        this.readFirstString(nodeData.outputMode, nodeData.output_mode) ===
        'none'
          ? 'none'
          : this.readFirstString(nodeData.outputMode, nodeData.output_mode) ===
              'collect-array'
            ? 'collect-array'
            : this.readFirstString(
                  nodeData.outputMode,
                  nodeData.output_mode,
                ) === 'last'
              ? 'last'
              : parentNodeType === 'iteration'
                ? 'collect-array'
                : 'last',
      internalNodes,
      internalEdges,
      orderedNodeIds,
      extraInputPortIds,
      iterationItems:
        parentNodeType === 'iteration'
          ? this.normalizeLoopItemsInput(input)
          : [],
      iterationIndex: 0,
      completedRounds: 0,
      loopState:
        input['state-in'] ??
        this.readFirstDefined(nodeData.defaultState, nodeData.default_state) ??
        null,
      loopRound: 0,
      maxIterations:
        configuredMaxIterations && configuredMaxIterations > 0
          ? Math.floor(configuredMaxIterations)
          : 100,
      previousResult: null,
      roundOutputs: {},
      finalOutputs: {},
      breakRequested: false,
      continueRequested: false,
      nextStateProvided: false,
      nextState: undefined,
    };
  }

  private async requireCompoundContextForStep(
    step: ExecutionStep,
    executionId: string,
  ): Promise<CompoundExecutionContext> {
    const meta = readExecutionRuntimeMeta(step.nodeData);
    const parentNodeId = meta.compoundParentId;
    if (!parentNodeId) {
      throw new Error(`步骤 ${step.nodeId} 不属于 compound 内部节点`);
    }

    const context = this.compoundContexts.get(
      buildCompoundContextKey(executionId, parentNodeId),
    );
    if (!context) {
      throw new Error(`compound 上下文不存在: ${executionId}:${parentNodeId}`);
    }

    return context;
  }

  private shouldTriggerJumpNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
  ): boolean {
    const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
    const mode =
      this.readFirstString(nodeData.mode, nodeData.jumpMode) === 'expression'
        ? 'expression'
        : 'always';

    if (mode !== 'expression') {
      return true;
    }

    const expression = this.readFirstString(
      nodeData.expression,
      nodeData.jumpExpression,
    );
    if (!expression?.trim()) {
      return false;
    }

    return Boolean(this.evaluateExpression(expression, input));
  }

  private buildLoopStartResult(
    context: CompoundExecutionContext,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {
      'exec-out': { triggered: true, round: context.loopRound },
      round: context.loopRound,
      state: context.loopState,
    };

    for (const inputPortId of context.extraInputPortIds) {
      result[inputPortId] = context.parentInput[inputPortId];
    }

    if (context.previousResult) {
      result['previous-result'] = context.previousResult;
    }

    result['is-first'] = context.loopRound === 0;
    return result;
  }

  private buildIterationStartResult(
    context: CompoundExecutionContext,
  ): Record<string, unknown> {
    const currentItem = context.iterationItems[context.iterationIndex];
    const result: Record<string, unknown> = {
      'exec-out': { triggered: true, index: context.iterationIndex },
      item: currentItem,
      index: context.iterationIndex,
      total: context.iterationItems.length,
      'is-first': context.iterationIndex === 0,
      'is-last': context.iterationIndex === context.iterationItems.length - 1,
    };

    for (const inputPortId of context.extraInputPortIds) {
      result[inputPortId] = context.parentInput[inputPortId];
    }

    return result;
  }

  private extractCompoundValueInput(
    input: Record<string, unknown>,
    portId: string,
  ): unknown {
    if (Object.prototype.hasOwnProperty.call(input, portId)) {
      return input[portId];
    }

    return this.extractOutputValue(input);
  }

  private async resetCompoundRoundSteps(
    context: CompoundExecutionContext,
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    const internalNodeIds = new Set(
      context.internalNodes.map((node) => node.id),
    );
    const internalSteps = steps.filter((step) =>
      internalNodeIds.has(step.nodeId),
    );
    const now = new Date();

    for (const step of internalSteps) {
      if (step.status !== 'pending') {
        this.eventBridge.emitStepStatusChanged(tenantId, context.executionId, {
          stepId: step.id,
          nodeId: step.nodeId,
          from: step.status,
          to: 'pending',
        });
      }
    }

    if (internalSteps.length === 0) {
      return;
    }

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: 'pending',
        input: null,
        result: null,
        errorMessage: null,
        checkpointData: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        inArray(
          schema.executionSteps.id,
          internalSteps.map((step) => step.id),
        ),
      );

    context.roundOutputs = {};
    context.breakRequested = false;
    context.continueRequested = false;
    context.nextStateProvided = false;
    context.nextState = undefined;
  }

  private async scheduleNextCompoundNode(
    context: CompoundExecutionContext,
    tenantId: string,
  ): Promise<void> {
    const { steps } = await this.loadExecutionContext(context.executionId);
    const internalNodeIds = new Set(
      context.internalNodes.map((node) => node.id),
    );
    const internalSteps = steps.filter((step) =>
      internalNodeIds.has(step.nodeId),
    );

    const hasActiveStep = internalSteps.some(
      (step) =>
        step.status === 'queued' ||
        step.status === 'running' ||
        step.status === 'waiting_intervention',
    );
    if (hasActiveStep) {
      return;
    }

    if (context.breakRequested) {
      const readyResultStep = internalSteps.find(
        (step) =>
          step.status === 'pending' &&
          step.nodeType === 'result' &&
          this.getSchedulingDecision(
            step.nodeId,
            context.internalEdges,
            internalSteps,
          ) === 'schedule',
      );

      if (readyResultStep) {
        await this.scheduleNode(
          context.executionId,
          readyResultStep.nodeId,
          tenantId,
          {
            nodes: context.internalNodes,
            edges: context.internalEdges,
          },
          steps,
          { skipLatestState: true },
        );
        return;
      }

      await this.skipPendingCompoundInternalSteps(internalSteps, tenantId);
      context.completedRounds += 1;

      if (Object.keys(context.roundOutputs).length > 0) {
        this.mergeCompoundRoundOutputs(context);
        context.previousResult = { ...context.roundOutputs };
      }

      await this.finalizeCompoundExecution(context, tenantId);
      return;
    }

    if (context.continueRequested) {
      await this.skipPendingCompoundInternalSteps(internalSteps, tenantId);
      const { steps: latestSteps } = await this.loadExecutionContext(
        context.executionId,
      );
      const internalNodeIds = new Set(
        context.internalNodes.map((node) => node.id),
      );
      const latestInternalSteps = latestSteps.filter((step) =>
        internalNodeIds.has(step.nodeId),
      );
      await this.advanceCompoundRound(
        context,
        latestInternalSteps,
        tenantId,
        true,
      );
      return;
    }

    for (const nodeId of context.orderedNodeIds) {
      const step = internalSteps.find(
        (candidate) => candidate.nodeId === nodeId,
      );
      if (!step || step.status !== 'pending') {
        continue;
      }

      const decision = this.getSchedulingDecision(
        nodeId,
        context.internalEdges,
        internalSteps,
      );

      if (decision === 'skip') {
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'skipped',
        );
        await this.onNodeCompleted(context.executionId, step.id, tenantId);
        return;
      }

      if (decision === 'schedule') {
        await this.scheduleNode(
          context.executionId,
          nodeId,
          tenantId,
          {
            nodes: context.internalNodes,
            edges: context.internalEdges,
          },
          steps,
          { skipLatestState: true },
        );
        return;
      }
    }

    const hasPending = internalSteps.some((step) => step.status === 'pending');
    if (!hasPending) {
      await this.advanceCompoundRound(context, internalSteps, tenantId, false);
    }
  }

  private async skipPendingCompoundInternalSteps(
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    for (const step of steps) {
      if (step.status !== 'pending') {
        continue;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'skipped',
      );
    }
  }

  private async advanceCompoundRound(
    context: CompoundExecutionContext,
    steps: ExecutionStep[],
    tenantId: string,
    discardRoundOutputs: boolean,
  ): Promise<void> {
    context.completedRounds += 1;

    if (!discardRoundOutputs) {
      this.mergeCompoundRoundOutputs(context);
    }

    if (!discardRoundOutputs && Object.keys(context.roundOutputs).length > 0) {
      context.previousResult = { ...context.roundOutputs };
    }

    if (context.parentNodeType === 'iteration') {
      context.iterationIndex += 1;
      if (context.iterationIndex >= context.iterationItems.length) {
        await this.finalizeCompoundExecution(context, tenantId);
        return;
      }
    } else {
      context.loopRound += 1;
      if (context.nextStateProvided) {
        context.loopState = context.nextState;
      }

      if (context.loopRound >= context.maxIterations) {
        await this.finalizeCompoundExecution(
          context,
          tenantId,
          'max_iterations',
        );
        return;
      }
    }

    await this.resetCompoundRoundSteps(context, steps, tenantId);
    await this.scheduleNextCompoundNode(context, tenantId);
  }

  private mergeCompoundRoundOutputs(context: CompoundExecutionContext): void {
    if (context.outputMode === 'none') {
      return;
    }

    for (const [outputKey, value] of Object.entries(context.roundOutputs)) {
      if (context.outputMode === 'collect-array') {
        const current = Array.isArray(context.finalOutputs[outputKey])
          ? (context.finalOutputs[outputKey] as unknown[])
          : [];
        context.finalOutputs[outputKey] = [...current, value];
        continue;
      }

      context.finalOutputs[outputKey] = value;
    }
  }

  private async finalizeCompoundExecution(
    context: CompoundExecutionContext,
    tenantId: string,
    stopReason?: string,
  ): Promise<void> {
    this.compoundContexts.delete(
      buildCompoundContextKey(context.executionId, context.parentNodeId),
    );

    const result: Record<string, unknown> = {
      'exec-out': {
        triggered: true,
        stopReason:
          stopReason ?? (context.breakRequested ? 'break' : 'completed'),
      },
      ...context.finalOutputs,
      compound: {
        mode: context.parentNodeType,
        rounds: context.completedRounds,
        ...(context.parentNodeType === 'iteration'
          ? { totalItems: context.iterationItems.length }
          : { finalState: context.loopState }),
        ...(stopReason ? { stopReason } : {}),
      },
    };

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      context.parentStepId,
      'completed',
      {
        result,
      },
    );

    await this.onNodeCompleted(
      context.executionId,
      context.parentStepId,
      tenantId,
    );
  }

  private async onCompoundInternalNodeCompleted(
    executionId: string,
    completedStep: ExecutionStep,
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    const meta = readExecutionRuntimeMeta(completedStep.nodeData);
    if (!meta.compoundParentId) {
      return;
    }

    const context = this.compoundContexts.get(
      buildCompoundContextKey(executionId, meta.compoundParentId),
    );
    if (!context) {
      return;
    }

    await this.scheduleNextCompoundNode(context, tenantId);
  }

  private async onCompoundInternalNodeFailed(
    executionId: string,
    failedStep: ExecutionStep,
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    const meta = readExecutionRuntimeMeta(failedStep.nodeData);
    if (!meta.compoundParentId) {
      return;
    }

    const context = this.compoundContexts.get(
      buildCompoundContextKey(executionId, meta.compoundParentId),
    );
    if (!context) {
      return;
    }

    this.compoundContexts.delete(
      buildCompoundContextKey(executionId, meta.compoundParentId),
    );

    const message =
      failedStep.errorMessage?.message ??
      `compound 内部节点 ${failedStep.nodeId} 执行失败`;

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      context.parentStepId,
      'failed',
      {
        errorMessage: {
          ...(failedStep.errorMessage ?? { message }),
          message,
          nodeId: context.parentNodeId,
          detail: `内部节点 ${failedStep.nodeId} 执行失败`,
        },
      },
    );

    await this.onNodeFailed(executionId, context.parentStepId, tenantId);
  }

  async executeMerge(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const mode =
        this.readFirstString(nodeData.mode) === 'merge-by-key'
          ? 'merge-by-key'
          : 'append';
      const mergeKey = this.readFirstString(
        nodeData.mergeKey,
        nodeData.merge_key,
      );
      const rawInputCount = this.readOptionalNumber(
        nodeData.inputCount,
        nodeData.input_count,
      );
      const inputCount =
        rawInputCount && rawInputCount >= 2 ? Math.floor(rawInputCount) : 2;

      // 按端口 ID 顺序收集输入（input-0, input-1, ...）
      const collectedInputs: unknown[] = [];
      for (let i = 0; i < inputCount; i += 1) {
        const portId = `input-${i}`;
        const value = input[portId];
        if (value !== undefined && value !== null) {
          collectedInputs.push(value);
        }
      }

      // 如果按端口 ID 没有收到数据，尝试从整体 input 收集
      if (collectedInputs.length === 0) {
        for (const value of Object.values(input)) {
          if (value !== undefined && value !== null) {
            collectedInputs.push(value);
          }
        }
      }

      let merged: unknown;

      if (mode === 'merge-by-key' && mergeKey) {
        // 按键合并: 将具有相同 key 值的对象合并
        const mergeMap = new Map<string, Record<string, unknown>>();
        const orderKeys: string[] = [];

        for (const item of collectedInputs) {
          if (Array.isArray(item)) {
            for (const element of item) {
              this.mergeByKey(element, mergeKey, mergeMap, orderKeys);
            }
          } else {
            this.mergeByKey(item, mergeKey, mergeMap, orderKeys);
          }
        }

        merged = orderKeys
          .map((k) => mergeMap.get(k))
          .filter((v): v is Record<string, unknown> => v !== undefined);
      } else {
        // 追加拼接: 将所有输入展平为一个数组
        const items: unknown[] = [];
        for (const item of collectedInputs) {
          if (Array.isArray(item)) {
            items.push(...item);
          } else {
            items.push(item);
          }
        }
        merged = items;
      }

      const result = {
        merged,
        'merged-out': merged,
        mode,
        inputCount,
        collectedCount: collectedInputs.length,
        'exec-out': {
          triggered: true,
          collectedCount: collectedInputs.length,
        },
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  private mergeByKey(
    item: unknown,
    mergeKey: string,
    mergeMap: Map<string, Record<string, unknown>>,
    orderKeys: string[],
  ): void {
    if (!this.isRecord(item)) return;

    const keyValue = item[mergeKey];
    if (keyValue === undefined || keyValue === null) return;

    const keyStr = String(keyValue);
    const existing = mergeMap.get(keyStr);
    if (existing) {
      Object.assign(existing, item);
    } else {
      mergeMap.set(keyStr, { ...item });
      orderKeys.push(keyStr);
    }
  }

  async executeSmartRouting(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const rawStrategy = this.resolveSmartRoutingStrategyValue(nodeData);
      const strategyName = this.normalizeSmartRoutingStrategyName(rawStrategy);
      const strategyConfig = this.resolveSmartRoutingStrategyConfig(nodeData);
      const router = this.routerRegistry.get(strategyName);

      const modelConfigIds = this.collectModelConfigIds(nodeData, input);
      const tokenThreshold =
        typeof nodeData.tokenThreshold === 'number' &&
        nodeData.tokenThreshold > 0
          ? nodeData.tokenThreshold
          : 4096;
      const queryText = this.extractSmartRoutingQueryText(nodeData, input);
      const taskCategory = this.extractSmartRoutingTaskCategory(
        nodeData,
        input,
      );
      const inputTokenCount = this.estimateTokenCount(input);
      const historicalMetrics =
        strategyName === 'historical_best'
          ? await this.smartRoutingService.getHistoricalMetrics(
              tenantId,
              step.nodeId,
            )
          : undefined;

      const context: SmartRoutingContext = {
        inputTokenCount,
        tenantId,
        ...(queryText ? { queryText } : {}),
        ...(taskCategory ? { taskCategory } : {}),
        ...(strategyConfig ? { strategyConfig } : {}),
        ...(historicalMetrics && Object.keys(historicalMetrics).length > 0
          ? { historicalMetrics }
          : {}),
      };

      if (router.requiresEmbedding) {
        const embeddingSource = queryText ?? JSON.stringify(input ?? {});
        const queryEmbedding = await this.embeddingService.generateEmbedding(
          embeddingSource,
          tenantId,
        );

        if (queryEmbedding) {
          context.queryEmbedding = queryEmbedding;
        }
      }

      const candidates = await this.loadRoutingCandidates(
        modelConfigIds,
        tenantId,
      );
      const healthyCandidates =
        await this.healthMonitorService.filterHealthyCandidates(
          tenantId,
          candidates,
        );

      const decision = await router.route(healthyCandidates, context);

      if (!decision.selectedModelId) {
        throw new AgentExecutionException(
          `Smart routing node ${step.nodeId} 未能选择模型`,
        );
      }

      const evaluatedModels = this.mapRoutingDecisionScores(decision);
      const routingDecisionId = await this.smartRoutingService.recordDecision(
        step.id,
        tenantId,
        step.nodeId,
        {
          selectedModelId: decision.selectedModelId,
          strategy: strategyName,
          reasoning: decision.reasoning,
          evaluatedModels,
          latencyMs: decision.latencyMs,
          routerType: decision.routerType,
        },
      );

      const candidateModelIds = evaluatedModels.map((model) => model.modelId);
      const currentModelIndex = Math.max(
        candidateModelIds.indexOf(decision.selectedModelId),
        0,
      );

      const result = {
        selectedModelId: decision.selectedModelId,
        llmModelConfigId: decision.selectedModelId,
        'model-out': {
          selectedModelId: decision.selectedModelId,
          llmModelConfigId: decision.selectedModelId,
        },
        'exec-out': {
          triggered: true,
          selectedModelId: decision.selectedModelId,
        },
        strategy: rawStrategy,
        reasoning: decision.reasoning,
        evaluatedModels,
        latencyMs: decision.latencyMs,
        routerType: decision.routerType,
        routingDecisionId,
        routingStepId: step.id,
        routingNodeId: step.nodeId,
        candidateModelIds,
        currentModelIndex,
        inputTokenCount,
        tokenThreshold,
        ...(queryText ? { queryText } : {}),
        ...(taskCategory ? { taskCategory } : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  private collectModelConfigIds(
    nodeData: Record<string, unknown>,
    input: Record<string, unknown>,
  ): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    const appendIds = (value: unknown): void => {
      for (const modelId of this.extractModelConfigIds(value)) {
        if (!seen.has(modelId)) {
          seen.add(modelId);
          ids.push(modelId);
        }
      }
    };

    const fallbackPriority = Array.isArray(nodeData.fallbackPriority)
      ? nodeData.fallbackPriority.filter(
          (path): path is string => typeof path === 'string' && path.length > 0,
        )
      : [];

    for (const path of fallbackPriority) {
      appendIds(this.resolveJsonPath(input, path));
    }

    for (const value of Object.values(input)) {
      appendIds(value);
    }

    if (Array.isArray(nodeData.modelConfigIds)) {
      for (const id of nodeData.modelConfigIds) {
        appendIds(id);
      }
    }

    return ids;
  }

  private async buildAgentTaskJobData(params: {
    executionId: string;
    tenantId: string;
    step: ExecutionStep;
    input: Record<string, unknown>;
    sandboxBinding?: { executionId: string; sandboxNodeId: string };
    memorySessionIds?: string[];
  }): Promise<{
    data: AgentTaskJobData;
    options?: { attempts: number };
  }> {
    const {
      executionId,
      tenantId,
      step,
      input,
      sandboxBinding,
      memorySessionIds,
    } = params;
    const smartRouting = this.extractSmartRoutingContext(input);
    const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});

    if (smartRouting) {
      nodeData.llmModelConfigId = smartRouting.selectedModelId;
    }

    if (
      typeof nodeData.llmModelConfigId !== 'string' ||
      nodeData.llmModelConfigId.length === 0
    ) {
      const fallbackModelId = Object.values(input)
        .flatMap((value) => this.extractStructuredModelConfigIds(value))
        .at(0);
      if (fallbackModelId) {
        nodeData.llmModelConfigId = fallbackModelId;
      }
    }

    if (
      typeof nodeData.agentId !== 'string' ||
      nodeData.agentId.trim().length === 0
    ) {
      nodeData.agentId = step.nodeId;
    }

    const mcpServers = await this.resolveMcpServersFromInput(input, tenantId);
    const workflowContext: Record<string, unknown> = {};

    if (mcpServers) {
      workflowContext.mcpServers = mcpServers;
    }

    if (sandboxBinding) {
      workflowContext.serverSandbox = sandboxBinding;
    }

    if (memorySessionIds && memorySessionIds.length > 0) {
      workflowContext.memorySessionIds = memorySessionIds;
    }

    return {
      data: {
        executionId,
        stepId: step.id,
        tenantId,
        input,
        nodeData,
        ...(smartRouting ? { smartRouting } : {}),
        ...(sandboxBinding ? { hasSandbox: true } : {}),
        ...(Object.keys(workflowContext).length > 0 ? { workflowContext } : {}),
      },
      ...(this.isFallbackChainStrategy(smartRouting?.strategy)
        ? { options: { attempts: 1 } }
        : {}),
    };
  }

  private async resolveMcpServersFromInput(
    input: Record<string, unknown>,
    tenantId: string,
  ): Promise<Record<string, McpRuntimeConnection> | undefined> {
    if (!this.mcpService) return undefined;

    const configIds = this.extractMcpServerConfigIds(input);
    if (configIds.length === 0) return undefined;

    const servers: Record<string, McpRuntimeConnection> = {};

    for (const configId of configIds) {
      try {
        servers[configId] = await this.mcpService.resolveRuntimeConnection(
          configId,
          tenantId,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to resolve MCP server config ${configId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return Object.keys(servers).length > 0 ? servers : undefined;
  }

  private extractMcpServerConfigIds(input: Record<string, unknown>): string[] {
    const ids = new Set<string>();

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);
        }
        return;
      }

      if (!this.isRecord(value)) {
        return;
      }

      if (
        value.type === 'mcp-tool' &&
        typeof value.mcpServerConfigId === 'string'
      ) {
        ids.add(value.mcpServerConfigId);
      }

      for (const nestedValue of Object.values(value)) {
        visit(nestedValue);
      }
    };

    visit(input);

    return [...ids];
  }

  private resolveSmartRoutingStrategyValue(
    nodeData: Record<string, unknown>,
  ): string {
    if (
      typeof nodeData.strategyName === 'string' &&
      nodeData.strategyName.length > 0
    ) {
      return nodeData.strategyName;
    }

    if (typeof nodeData.strategy === 'string' && nodeData.strategy.length > 0) {
      return nodeData.strategy;
    }

    return 'FALLBACK_CHAIN';
  }

  private resolveSmartRoutingStrategyConfig(
    nodeData: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (this.isRecord(nodeData.strategyConfig)) {
      return nodeData.strategyConfig;
    }

    if (this.isRecord(nodeData.strategy_config)) {
      return nodeData.strategy_config;
    }

    return undefined;
  }

  private normalizeSmartRoutingStrategyName(strategy: string): string {
    const normalized = strategy.trim();
    const strategyAliases: Record<string, string> = {
      TOKEN_OPTIMIZED: 'token_optimized',
      COST_OPTIMIZED: 'cost_optimized',
      QUALITY_FIRST: 'quality_first',
      LATENCY_FIRST: 'latency_first',
      HISTORICAL_BEST: 'historical_best',
      FALLBACK_CHAIN: 'fallback_chain',
      'memory-bank': 'memory_bank',
      'wasm-plugin': 'wasm_plugin',
    };

    return strategyAliases[normalized] ?? normalized.toLowerCase();
  }

  private isFallbackChainStrategy(strategy?: string): boolean {
    return Boolean(
      strategy &&
      this.normalizeSmartRoutingStrategyName(strategy) === 'fallback_chain',
    );
  }

  private extractSmartRoutingQueryText(
    nodeData: Record<string, unknown>,
    input: Record<string, unknown>,
  ): string | undefined {
    return (
      this.findFirstStringByKeys(nodeData, [
        'queryText',
        'query',
        'promptText',
        'prompt',
        'content',
        'text',
      ]) ??
      this.findFirstStringByKeys(input, [
        'queryText',
        'query',
        'promptText',
        'prompt',
        'content',
        'text',
        'task',
      ])
    );
  }

  private extractSmartRoutingTaskCategory(
    nodeData: Record<string, unknown>,
    input: Record<string, unknown>,
  ): string | undefined {
    return (
      this.findFirstStringByKeys(nodeData, [
        'taskCategory',
        'category',
        'intent',
      ]) ??
      this.findFirstStringByKeys(input, ['taskCategory', 'category', 'intent'])
    );
  }

  private findFirstStringByKeys(
    value: unknown,
    keys: string[],
    seen: Set<object> = new Set<object>(),
  ): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (!this.isRecord(value) && !Array.isArray(value)) {
      return undefined;
    }

    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
    }

    if (this.isRecord(value)) {
      for (const key of keys) {
        const directValue = value[key];
        if (typeof directValue === 'string' && directValue.length > 0) {
          return directValue;
        }
      }

      for (const nestedValue of Object.values(value)) {
        const nestedMatch = this.findFirstStringByKeys(nestedValue, keys, seen);
        if (nestedMatch) {
          return nestedMatch;
        }
      }

      return undefined;
    }

    for (const item of value) {
      const nestedMatch = this.findFirstStringByKeys(item, keys, seen);
      if (nestedMatch) {
        return nestedMatch;
      }
    }

    return undefined;
  }

  private async loadRoutingCandidates(
    modelConfigIds: string[],
    tenantId: string,
  ): Promise<RoutingCandidate[]> {
    if (modelConfigIds.length === 0) {
      return [];
    }

    const modelConfigs = await this.tenantDb
      .select({
        id: schema.llmModelConfigs.id,
        name: schema.llmModelConfigs.name,
        providerSlug: schema.llmProviders.slug,
        modelId: schema.llmModelConfigs.modelId,
      })
      .from(schema.llmModelConfigs)
      .innerJoin(
        schema.llmProviders,
        eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
      )
      .where(
        and(
          eq(schema.llmModelConfigs.tenantId, tenantId),
          inArray(schema.llmModelConfigs.id, modelConfigIds),
        ),
      );

    const routingMetadataRows = await this.tenantDb
      .select({
        modelConfigId: schema.routerModels.modelId,
        providerName: schema.routerModels.providerName,
        routingMeta: schema.routerModels.routingMeta,
        eloRating: schema.routerModels.eloRating,
      })
      .from(schema.routerModels)
      .where(
        and(
          eq(schema.routerModels.tenantId, tenantId),
          eq(schema.routerModels.isActive, true),
          inArray(schema.routerModels.modelId, modelConfigIds),
        ),
      );

    const configsById = new Map(
      modelConfigs.map((config) => [config.id, config]),
    );
    const routingMetadataById = new Map(
      routingMetadataRows.map((row) => [row.modelConfigId, row]),
    );

    const candidates: RoutingCandidate[] = [];

    for (const modelConfigId of modelConfigIds) {
      const modelConfig = configsById.get(modelConfigId);
      if (!modelConfig) {
        continue;
      }

      const routingMetadata = routingMetadataById.get(modelConfigId);
      const fallbackMeta = getModelRoutingMeta(
        modelConfig.providerSlug,
        modelConfig.modelId,
      );
      const rawRoutingMeta = this.isRecord(routingMetadata?.routingMeta)
        ? routingMetadata.routingMeta
        : undefined;
      const rawCosts = this.isRecord(rawRoutingMeta?.costs)
        ? rawRoutingMeta.costs
        : undefined;

      candidates.push({
        id: modelConfig.id,
        modelConfigId: modelConfig.id,
        name: modelConfig.name,
        provider: routingMetadata?.providerName ?? modelConfig.providerSlug,
        routingMeta: {
          contextWindow: this.readNumber(
            rawRoutingMeta?.contextWindow,
            fallbackMeta.contextWindow,
          ),
          costs: {
            input: this.readNumber(
              rawCosts?.inputPer1kTokens,
              fallbackMeta.costPer1kInputTokens,
            ),
            output: this.readNumber(
              rawCosts?.outputPer1kTokens,
              fallbackMeta.costPer1kOutputTokens,
            ),
          },
          qualityRank: this.readNumber(
            rawRoutingMeta?.qualityRank,
            fallbackMeta.qualityRank,
          ),
          avgLatencyMs: this.readNumber(
            rawRoutingMeta?.avgLatencyMs,
            fallbackMeta.avgLatencyMs,
          ),
          maxInputTokens: this.readNumber(
            rawRoutingMeta?.maxInputTokens,
            this.readNumber(
              rawRoutingMeta?.contextWindow,
              fallbackMeta.contextWindow,
            ),
          ),
          eloRating: this.readNumber(routingMetadata?.eloRating, 1200),
        },
        healthStatus: 'healthy',
      });
    }

    return candidates;
  }

  private mapRoutingDecisionScores(decision: RouterDecision): Array<{
    modelId: string;
    modelName: string;
    provider: string;
    score: number;
    reasoning: string;
  }> {
    return decision.scores.map((score) => ({
      modelId: score.modelId,
      modelName: score.modelName,
      provider: score.provider,
      score: score.score,
      reasoning: score.reasoning,
    }));
  }

  private extractSmartRoutingContext(
    input: Record<string, unknown>,
  ): SmartRoutingRuntimeContext | undefined {
    return this.findSmartRoutingContext(input, new Set<object>());
  }

  private findSmartRoutingContext(
    value: unknown,
    seen: Set<object>,
  ): SmartRoutingRuntimeContext | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    if (this.isSmartRoutingRuntimeContext(value)) {
      return value;
    }

    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);

    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      const found = this.findSmartRoutingContext(child, seen);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private isSmartRoutingRuntimeContext(
    value: unknown,
  ): value is SmartRoutingRuntimeContext {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value.routingStepId === 'string' &&
      typeof value.routingNodeId === 'string' &&
      typeof value.strategy === 'string' &&
      typeof value.selectedModelId === 'string' &&
      typeof value.currentModelIndex === 'number' &&
      Array.isArray(value.candidateModelIds) &&
      value.candidateModelIds.every((id) => typeof id === 'string')
    );
  }

  private extractModelConfigIds(value: unknown): string[] {
    if (typeof value === 'string' && value.length > 0) {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.extractModelConfigIds(item));
    }

    if (!this.isRecord(value)) {
      return [];
    }

    if (Array.isArray(value.candidateModelIds)) {
      return value.candidateModelIds.filter(
        (modelId): modelId is string =>
          typeof modelId === 'string' && modelId.length > 0,
      );
    }

    const directId =
      typeof value.selectedModelId === 'string'
        ? value.selectedModelId
        : typeof value.llmModelConfigId === 'string'
          ? value.llmModelConfigId
          : typeof value.modelConfigId === 'string'
            ? value.modelConfigId
            : undefined;

    if (directId) {
      return [directId];
    }

    return Object.values(value).flatMap((item) =>
      this.extractModelConfigIds(item),
    );
  }

  private estimateTokenCount(value: unknown): number {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value ?? {});

    return Math.max(0, Math.ceil(serialized.length / 4));
  }

  private readNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private readOptionalNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  private readFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  private readFirstDefined<T>(...values: T[]): T | undefined {
    for (const value of values) {
      if (value !== undefined) {
        return value;
      }
    }

    return undefined;
  }

  private readStringArray(...values: unknown[]): string[] {
    for (const value of values) {
      if (!Array.isArray(value)) {
        continue;
      }

      return value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      );
    }

    return [];
  }

  private readHttpMethod(
    value: unknown,
  ): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
    return value === 'POST' ||
      value === 'PUT' ||
      value === 'PATCH' ||
      value === 'DELETE'
      ? value
      : 'GET';
  }

  private getRuntimeNodeData(
    nodeData: Record<string, unknown>,
  ): Record<string, unknown> {
    const config = this.isRecord(nodeData.config) ? nodeData.config : {};
    return { ...config, ...nodeData };
  }

  private readEdgeHandle(
    edge: ReactFlowEdge,
    handleKind: 'source' | 'target',
  ): string | undefined {
    const rawEdge = edge as unknown as Record<string, unknown>;

    return this.readFirstString(
      handleKind === 'source' ? edge.sourceHandle : edge.targetHandle,
      rawEdge[`${handleKind}_handle`],
    );
  }

  // ── 私有辅助 ───────────────────────────────────────────────

  private getWorkflowAgentDefinitionId(
    nodeData: Record<string, unknown>,
  ): string | undefined {
    const runtimeNodeData = this.getRuntimeNodeData(nodeData);

    return this.readFirstString(
      runtimeNodeData.agentDefinitionId,
      runtimeNodeData.agent_definition_id,
      runtimeNodeData.selectedAgentId,
      runtimeNodeData.selected_agent_id,
    );
  }

  private getWorkflowAgentRuntimeMode(
    nodeData: Record<string, unknown>,
  ): 'sandbox' | 'no_sandbox' {
    const runtimeNodeData = this.getRuntimeNodeData(nodeData);
    const runtimeMode = this.readFirstString(
      runtimeNodeData.agentRuntimeMode,
      runtimeNodeData.agent_runtime_mode,
      runtimeNodeData.runtimeMode,
      runtimeNodeData.runtime_mode,
    );

    return runtimeMode === 'no_sandbox' ? 'no_sandbox' : 'sandbox';
  }

  private async executeWorkflowAgentNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): Promise<void> {
    try {
      const nodeData = step.nodeData ?? {};
      const agentDefinitionId = this.getWorkflowAgentDefinitionId(nodeData);

      if (!agentDefinitionId) {
        throw new Error(
          `Workflow agent node ${step.nodeId} 缺少 agentDefinitionId`,
        );
      }

      const workflowSandboxBinding = this.getExecutionSandboxBinding(
        step.nodeId,
        executionId,
        edges,
        steps,
        input,
      );
      const workflowAgentRuntimeMode =
        this.getWorkflowAgentRuntimeMode(nodeData);
      const usesSandboxRuntime = workflowAgentRuntimeMode === 'sandbox';
      const workflowSandboxNodeId = usesSandboxRuntime
        ? (workflowSandboxBinding?.sandboxNodeId ?? step.nodeId)
        : undefined;
      const runningCheckpointData = this.buildWorkflowAgentCheckpointData(
        step.checkpointData,
        executionId,
        workflowSandboxNodeId,
      );

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'running',
        {
          checkpointData: runningCheckpointData,
        },
      );
      step.checkpointData = runningCheckpointData;
      if (workflowSandboxNodeId) {
        await this.workspaceIntegrationService.startExecutionStepFileWatcher({
          executionId,
          stepId: step.id,
          tenantId,
          sandboxNodeId: workflowSandboxNodeId,
        });
      }

      const workflowSandboxConfig = workflowSandboxNodeId
        ? this.getWorkflowSandboxOverride(step.nodeId, edges, steps)
        : undefined;
      const adapter =
        this.workflowAgentAdapterFactory.createFromAgentDefinition(
          agentDefinitionId,
          workflowSandboxConfig,
        );

      const result = await adapter.execute({
        executionId,
        step,
        input,
        tenantId,
        ...(workflowSandboxBinding
          ? { sandboxBinding: workflowSandboxBinding }
          : {}),
        ...(usesSandboxRuntime
          ? { parentUsesSandboxRuntime: true }
          : { parentUsesSandboxRuntime: false }),
        ...(typeof nodeData.agentVersionId === 'string'
          ? { agentVersionId: nodeData.agentVersionId }
          : typeof nodeData.agent_version_id === 'string'
            ? { agentVersionId: nodeData.agent_version_id }
            : {}),
      });
      const workspaceSnapshotId = workflowSandboxNodeId
        ? await this.workspaceIntegrationService.archiveExecutionStepWorkspace(
            executionId,
            step.id,
            tenantId,
            workflowSandboxNodeId,
          )
        : null;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result,
          checkpointData: this.buildWorkflowAgentCheckpointData(
            step.checkpointData,
            executionId,
            workflowSandboxNodeId,
            workspaceSnapshotId ?? undefined,
          ),
        },
      );
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        step.id,
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const workflowSandboxNodeId =
        this.getExecutionSandboxBinding(
          step.nodeId,
          executionId,
          edges,
          steps,
          input,
        )?.sandboxNodeId ?? step.nodeId;
      const workspaceSnapshotId =
        await this.workspaceIntegrationService.archiveExecutionStepWorkspace(
          executionId,
          step.id,
          tenantId,
          workflowSandboxNodeId,
        );
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
          checkpointData: this.buildWorkflowAgentCheckpointData(
            step.checkpointData,
            executionId,
            workflowSandboxNodeId,
            workspaceSnapshotId ?? undefined,
          ),
        },
      );
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        step.id,
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    } finally {
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        step.id,
      );
    }
  }

  private buildWorkflowAgentCheckpointData(
    checkpointData: ExecutionStep['checkpointData'],
    executionId: string,
    sandboxNodeId?: string,
    workspaceSnapshotId?: string,
  ): Record<string, unknown> {
    const rawCheckpoint = this.isRecord(checkpointData) ? checkpointData : {};
    const {
      sandboxNodeId: _sandboxNodeId,
      serverSandbox: _serverSandbox,
      ...existingCheckpoint
    } = rawCheckpoint;

    return {
      ...existingCheckpoint,
      ...(sandboxNodeId ? { sandboxNodeId } : {}),
      ...(sandboxNodeId
        ? {
            serverSandbox: {
              executionId,
              sandboxNodeId,
            },
          }
        : {}),
      ...(workspaceSnapshotId ? { workspaceSnapshotId } : {}),
    };
  }

  private getWorkflowSandboxOverride(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): SandboxConfig | undefined {
    const sourceStep = this.getSandboxSourceStep(nodeId, edges, steps);
    if (sourceStep) {
      return this.resolveSandboxConfigForStep(sourceStep, edges, steps);
    }

    return undefined;
  }

  private resolveSandboxConfig(
    nodeData: Record<string, unknown>,
    overrides: {
      restoreWorkspaceId?: string;
    } = {},
  ): SandboxConfig {
    const sandboxConfigSource = this.getSandboxConfigSource(nodeData);
    const lifecycleModeValue = this.readFirstString(
      sandboxConfigSource.lifecycleMode,
      sandboxConfigSource.lifecycle_mode,
    );
    const lifecycleMode =
      lifecycleModeValue === 'persistent'
        ? 'persistent'
        : lifecycleModeValue === 'session'
          ? 'session'
          : undefined;
    const restoreWorkspaceId = this.readFirstString(
      overrides.restoreWorkspaceId,
      sandboxConfigSource.restoreWorkspaceId,
      sandboxConfigSource.restore_workspace_id,
    );
    const persistencePath = this.readFirstString(
      sandboxConfigSource.persistencePath,
      sandboxConfigSource.persistence_path,
    );
    const persistenceExpiryHours = this.readOptionalNumber(
      sandboxConfigSource.persistenceExpiryHours,
      sandboxConfigSource.persistence_expiry_hours,
    );
    const name = this.readFirstString(
      sandboxConfigSource.name,
      sandboxConfigSource.persistentSandboxName,
      sandboxConfigSource.persistent_sandbox_name,
    );
    const persistentSandboxId = this.readFirstString(
      sandboxConfigSource.persistentSandboxId,
      sandboxConfigSource.persistent_sandbox_id,
    );

    return {
      cpu: this.readNumber(sandboxConfigSource.cpu, 1),
      memory: this.readNumber(sandboxConfigSource.memory, 512),
      disk: this.readNumber(sandboxConfigSource.disk, 2),
      timeout: this.readNumber(sandboxConfigSource.timeout, 2),
      ...(persistencePath ? { persistencePath } : {}),
      ...(restoreWorkspaceId ? { restoreWorkspaceId } : {}),
      ...(lifecycleMode ? { lifecycleMode } : {}),
      ...(persistenceExpiryHours !== undefined
        ? { persistenceExpiryHours }
        : {}),
      ...(name ? { name } : {}),
      ...(persistentSandboxId ? { persistentSandboxId } : {}),
    };
  }

  private resolveSandboxConfigForStep(
    step: ExecutionStep,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): SandboxConfig {
    return this.resolveSandboxConfig(step.nodeData ?? {}, {
      restoreWorkspaceId: this.getSandboxRestoreWorkspaceId(
        step.nodeId,
        edges,
        steps,
      ),
    });
  }

  async executeSandboxNode(
    step: ExecutionStep,
    _input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const config = this.resolveSandboxConfigForStep(step, edges, steps);

      const session = await this.sandboxService.createSandboxSession({
        executionId,
        sandboxNodeId: step.nodeId,
        config,
        tenantId,
      });
      const sandboxOutput = {
        sessionId: session.id,
        status: session.status,
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...sandboxOutput,
            'sandbox-out': sandboxOutput,
            'exec-out': {
              triggered: true,
              sessionId: session.id,
              status: session.status,
            },
          },
        },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeWorkspaceNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const workspaceId = this.readFirstString(
        nodeData.workspaceId,
        nodeData.workspace_id,
      );

      if (!workspaceId) {
        throw new Error('Workspace node requires workspaceId');
      }

      const workspaceName = this.readFirstString(
        nodeData.workspaceName,
        nodeData.workspace_name,
        nodeData.label,
      );
      const workspaceOutput = {
        workspaceId,
        ...(workspaceName ? { workspaceName } : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...workspaceOutput,
            'volume-out': workspaceOutput,
            'exec-out': {
              triggered: true,
              workspaceId,
              ...(workspaceName ? { workspaceName } : {}),
            },
          },
        },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeMemoryNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const config = this.resolveMemoryConfig(
        step.nodeData ?? {},
        tenantId,
        executionId,
      );
      const instance = await this.sharedResourceRegistry.createResource<
        MemoryResourceConfig,
        MemoryResourceInstance
      >('memory', config);
      const result = {
        sessionId: instance.sessionId,
        instanceId: config.memoryInstanceId,
        role: config.role,
        status: instance.session.status,
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...result,
            'memory-out': result,
            'exec-out': {
              triggered: true,
              sessionId: instance.sessionId,
              instanceId: config.memoryInstanceId,
            },
          },
        },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeTriggerNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const [execution] = await this.tenantDb
        .select({
          inputParams: schema.workflowExecutions.inputParams,
          triggerType: schema.workflowExecutions.triggerType,
        })
        .from(schema.workflowExecutions)
        .where(eq(schema.workflowExecutions.id, executionId))
        .limit(1);

      const payload = this.extractExecutionInputPayload(execution?.inputParams);
      const result = {
        triggerType: execution?.triggerType ?? step.nodeType,
        payload,
        'exec-out': {
          triggerType: execution?.triggerType ?? step.nodeType,
          triggered: true,
        },
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeLlmModelNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const llmModelConfigId = this.readFirstString(
        nodeData.llmModelConfigId,
        nodeData.llm_config_id,
        nodeData.modelConfigId,
        nodeData.model_config_id,
      );

      if (!llmModelConfigId) {
        throw new Error('LLM 模型节点缺少 llmModelConfigId');
      }

      const result: Record<string, unknown> = {
        llmModelConfigId,
        modelConfigId: llmModelConfigId,
        modelId: llmModelConfigId,
        ...(this.readFirstString(nodeData.provider)
          ? { provider: nodeData.provider }
          : {}),
        ...(this.readFirstString(nodeData.name) ? { name: nodeData.name } : {}),
        ...(this.readFirstString(nodeData.modelName)
          ? { modelName: nodeData.modelName }
          : {}),
        'exec-out': {
          triggered: true,
          llmModelConfigId,
        },
      };
      const modelOutput = {
        llmModelConfigId: result.llmModelConfigId,
        modelConfigId: result.modelConfigId,
        modelId: result.modelId,
        ...(typeof result.provider === 'string'
          ? { provider: result.provider }
          : {}),
        ...(typeof result.name === 'string' ? { name: result.name } : {}),
        ...(typeof result.modelName === 'string'
          ? { modelName: result.modelName }
          : {}),
      };
      result['model-out'] = modelOutput;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeKnowledgeNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.getRuntimeNodeData(step.nodeData ?? {});
      const knowledgeBaseId = this.readFirstString(
        nodeData.knowledgeBaseId,
        nodeData.knowledge_base_id,
      );
      const knowledgeBaseName = this.readFirstString(
        nodeData.knowledgeBaseName,
        nodeData.knowledge_base_name,
      );
      const topK = this.readOptionalNumber(nodeData.topK, nodeData.top_k);
      const similarityThreshold = this.readOptionalNumber(
        nodeData.similarityThreshold,
        nodeData.similarity_threshold,
      );

      if (!knowledgeBaseId) {
        throw new Error('Knowledge Base node requires knowledgeBaseId');
      }

      const result: Record<string, unknown> = {
        type: 'knowledge-base',
        knowledgeBaseId,
        ...(knowledgeBaseName ? { knowledgeBaseName } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
        'exec-out': {
          triggered: true,
          knowledgeBaseId,
        },
      };
      const knowledgeOutput = {
        type: 'knowledge-base',
        knowledgeBaseId,
        ...(knowledgeBaseName ? { knowledgeBaseName } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
      };
      result['knowledge-out'] = knowledgeOutput;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  async executeOutputNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const rawOutput = this.extractOutputValue(input);
      const content =
        step.nodeType === 'text-output'
          ? this.stringifyOutputValue(rawOutput)
          : this.normalizeJsonOutputValue(rawOutput);
      const result =
        step.nodeType === 'text-output' ? { content } : { json: content };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await this.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name === 'InvalidStepTransitionException'
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
        },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  private getSandboxConfigSource(
    nodeData: Record<string, unknown>,
  ): Record<string, unknown> {
    const nestedConfig = nodeData.config;
    const sandboxConfig = nodeData.sandboxConfig;
    const globalSandboxConfig = nodeData.globalSandboxConfig;

    if (this.isRecord(nestedConfig)) {
      return nestedConfig;
    }

    if (this.isRecord(sandboxConfig)) {
      return sandboxConfig;
    }

    if (
      this.isRecord(globalSandboxConfig) &&
      this.isRecord(globalSandboxConfig.sandboxConfig)
    ) {
      return globalSandboxConfig.sandboxConfig;
    }

    if (this.isRecord(globalSandboxConfig)) {
      return globalSandboxConfig;
    }

    return nodeData;
  }

  private resolveMemoryConfig(
    nodeData: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): MemoryResourceConfig {
    const memoryConfigSource = this.getRuntimeNodeData(nodeData);
    const memoryInstanceId = this.readFirstString(
      memoryConfigSource.memoryInstanceId,
      memoryConfigSource.memory_instance_id,
    );

    if (!memoryInstanceId) {
      throw new Error('Memory node requires memoryInstanceId');
    }

    const bootUris =
      Array.isArray(memoryConfigSource.bootUris) &&
      memoryConfigSource.bootUris.every((uri) => typeof uri === 'string')
        ? memoryConfigSource.bootUris
        : Array.isArray(memoryConfigSource.boot_uris) &&
            memoryConfigSource.boot_uris.every((uri) => typeof uri === 'string')
          ? memoryConfigSource.boot_uris
          : [];
    const fusionPriority = this.readOptionalNumber(
      memoryConfigSource.fusionPriority,
      memoryConfigSource.fusion_priority,
    );

    return {
      memoryInstanceId,
      role: memoryConfigSource.role === 'readonly' ? 'readonly' : 'primary',
      bootUris,
      fusionPriority: fusionPriority ?? 0,
      tenantId,
      executionId,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getSandboxSourceStep(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): ExecutionStep | undefined {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    for (const edge of incomingEdges) {
      const sourceStep = steps.find((s) => s.nodeId === edge.source);
      if (sourceStep?.nodeType === 'sandbox') {
        return sourceStep;
      }
    }

    return undefined;
  }

  private getExecutionSandboxBinding(
    nodeId: string,
    executionId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
    input?: Record<string, unknown>,
  ): { executionId: string; sandboxNodeId: string } | undefined {
    const sourceStep = this.getSandboxSourceStep(nodeId, edges, steps);
    if (!sourceStep) {
      const sandboxSessionId = this.readSandboxSessionId(
        input?.['sandbox-in'] ??
          input?.sandbox ??
          input?.['sandbox-out'] ??
          input?.['sandbox-output'],
      );
      if (!sandboxSessionId) {
        return undefined;
      }

      const matchedSandboxStep = steps.find(
        (step) =>
          step.nodeType === 'sandbox' &&
          this.readSandboxSessionId(step.result) === sandboxSessionId,
      );
      if (!matchedSandboxStep) {
        return undefined;
      }

      return {
        executionId,
        sandboxNodeId: matchedSandboxStep.nodeId,
      };
    }

    return {
      executionId,
      sandboxNodeId: sourceStep.nodeId,
    };
  }

  private readSandboxSessionId(value: unknown): string | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return this.readFirstString(value.sessionId, value.session_id);
  }

  private getSandboxRestoreWorkspaceId(
    sandboxNodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): string | undefined {
    const incomingEdges = edges.filter((edge) => edge.target === sandboxNodeId);

    for (const edge of incomingEdges) {
      const sourceStep = steps.find(
        (candidate) => candidate.nodeId === edge.source,
      );
      if (sourceStep?.nodeType !== 'workspace') {
        continue;
      }

      const nodeData = this.isRecord(sourceStep.nodeData)
        ? sourceStep.nodeData
        : {};
      const config = this.isRecord(nodeData.config)
        ? nodeData.config
        : nodeData;
      const workspaceId =
        typeof config.workspaceId === 'string' && config.workspaceId.trim()
          ? config.workspaceId.trim()
          : this.isRecord(sourceStep.result) &&
              typeof sourceStep.result.workspaceId === 'string' &&
              sourceStep.result.workspaceId.trim()
            ? sourceStep.result.workspaceId.trim()
            : undefined;

      if (workspaceId) {
        return workspaceId;
      }
    }

    return undefined;
  }

  private buildHttpToolRequestInput(
    nodeData: Record<string, unknown>,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const dynamicRequest = this.extractHttpToolDynamicRequest(input);
    const headers = {
      ...this.keyValuePairsToRecord(nodeData.headers),
      ...this.buildHttpToolAuthHeaders(nodeData),
      ...this.extractHttpToolHeaders(dynamicRequest.headers),
    };
    const query = {
      ...this.keyValuePairsToRecord(nodeData.queryParams, true),
      ...this.buildHttpToolAuthQuery(nodeData),
      ...this.extractHttpToolQuery(dynamicRequest.query),
    };
    const request: Record<string, unknown> = {};

    if (Object.keys(headers).length > 0) {
      request.headers = headers;
    }

    if (Object.keys(query).length > 0) {
      request.query = query;
    }

    const requestBody = this.resolveHttpToolRequestBody(
      nodeData,
      dynamicRequest,
    );
    if (requestBody !== undefined) {
      request.body = requestBody;
    }

    return request;
  }

  private resolveHttpToolRequestBody(
    nodeData: Record<string, unknown>,
    dynamicRequest: Record<string, unknown>,
  ): unknown {
    if (Object.prototype.hasOwnProperty.call(dynamicRequest, 'body')) {
      return dynamicRequest.body;
    }

    if (
      Object.keys(dynamicRequest).length > 0 &&
      !Object.prototype.hasOwnProperty.call(dynamicRequest, 'query') &&
      !Object.prototype.hasOwnProperty.call(dynamicRequest, 'headers')
    ) {
      return dynamicRequest;
    }

    if (
      typeof nodeData.body !== 'string' ||
      nodeData.body.trim().length === 0
    ) {
      return undefined;
    }

    return this.parseJsonLikeValue(nodeData.body);
  }

  private extractHttpToolDynamicRequest(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const requestValue =
      Object.prototype.hasOwnProperty.call(input, 'request-in') &&
      input['request-in'] !== undefined
        ? input['request-in']
        : Object.prototype.hasOwnProperty.call(input, 'request') &&
            input.request !== undefined
          ? input.request
          : this.stripExecOnlyInputs(input);

    if (requestValue === undefined) {
      return {};
    }

    if (this.isRecord(requestValue)) {
      return requestValue;
    }

    return { body: requestValue };
  }

  private stripExecOnlyInputs(
    input: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const entries = Object.entries(input).filter(
      ([key]) => key !== 'exec-in' && key !== 'exec_in',
    );
    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }

  private extractHttpToolHeaders(value: unknown): Record<string, string> {
    if (!this.isRecord(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private extractHttpToolQuery(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private buildHttpToolAuthHeaders(
    nodeData: Record<string, unknown>,
  ): Record<string, string> {
    const authType = this.readFirstString(
      nodeData.authType,
      nodeData.auth_type,
    );
    const authConfig = this.isRecord(nodeData.authConfig)
      ? nodeData.authConfig
      : this.isRecord(nodeData.auth_config)
        ? nodeData.auth_config
        : undefined;
    if (!authType || !authConfig) {
      return {};
    }

    if (authType === 'bearer') {
      const token = this.readFirstString(authConfig.token);
      return token ? { Authorization: `Bearer ${token}` } : {};
    }

    if (authType === 'basic') {
      const username = this.readFirstString(authConfig.username);
      const password = this.readFirstString(authConfig.password);
      return username !== undefined && password !== undefined
        ? {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          }
        : {};
    }

    if (
      authType === 'api-key' &&
      this.readFirstString(authConfig.location) !== 'query'
    ) {
      const keyName = this.readFirstString(
        authConfig.keyName,
        authConfig.key_name,
      );
      const keyValue = this.readFirstString(
        authConfig.keyValue,
        authConfig.key_value,
      );
      return keyName && keyValue ? { [keyName]: keyValue } : {};
    }

    return {};
  }

  private buildHttpToolAuthQuery(
    nodeData: Record<string, unknown>,
  ): Record<string, unknown> {
    const authType = this.readFirstString(
      nodeData.authType,
      nodeData.auth_type,
    );
    const authConfig = this.isRecord(nodeData.authConfig)
      ? nodeData.authConfig
      : this.isRecord(nodeData.auth_config)
        ? nodeData.auth_config
        : undefined;

    if (authType !== 'api-key' || !authConfig) {
      return {};
    }

    const location = this.readFirstString(authConfig.location) ?? 'header';
    if (location !== 'query') {
      return {};
    }

    const keyName = this.readFirstString(
      authConfig.keyName,
      authConfig.key_name,
    );
    const keyValue = this.readFirstString(
      authConfig.keyValue,
      authConfig.key_value,
    );

    return keyName && keyValue ? { [keyName]: keyValue } : {};
  }

  private keyValuePairsToRecord(
    value: unknown,
    parseJsonValue = false,
  ): Record<string, unknown> {
    if (!Array.isArray(value)) {
      return {};
    }

    const result: Record<string, unknown> = {};

    for (const entry of value) {
      if (!this.isRecord(entry)) {
        continue;
      }

      const key = this.readFirstString(entry.key);
      if (!key || typeof entry.value !== 'string') {
        continue;
      }

      result[key] = parseJsonValue
        ? this.parseJsonLikeValue(entry.value)
        : entry.value;
    }

    return result;
  }

  private parseJsonLikeValue(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  private extractCodeToolInputPayload(input: Record<string, unknown>): unknown {
    if (Object.prototype.hasOwnProperty.call(input, 'input-in')) {
      return input['input-in'];
    }

    if (Object.prototype.hasOwnProperty.call(input, 'input')) {
      return input.input;
    }

    const stripped = this.stripExecOnlyInputs(input);
    if (!stripped) {
      return {};
    }

    const values = Object.values(stripped);
    return values.length === 1 ? values[0] : stripped;
  }

  private extractConfiguredMcpTools(
    nodeData: Record<string, unknown>,
    enabledToolIds: string[],
  ): Array<{
    toolName: string;
    mcpToolDefinitionId?: string;
    inputSchema?: Record<string, unknown>;
    portMapping?: Record<string, unknown>;
  }> {
    const tools = Array.isArray(nodeData.tools) ? nodeData.tools : [];
    const selectedTools = tools
      .filter((tool) => this.isRecord(tool))
      .filter((tool) => {
        if (enabledToolIds.length === 0) {
          return true;
        }

        return typeof tool.id === 'string' && enabledToolIds.includes(tool.id);
      })
      .map((tool) => {
        const toolRecord = tool as Record<string, unknown>;
        const toolName = this.readFirstString(
          toolRecord.toolName,
          toolRecord.name,
          toolRecord.title,
        );
        if (!toolName) {
          return null;
        }

        return {
          toolName,
          ...(typeof toolRecord.id === 'string'
            ? { mcpToolDefinitionId: toolRecord.id }
            : {}),
          ...(this.isRecord(toolRecord.inputSchema)
            ? { inputSchema: toolRecord.inputSchema }
            : {}),
          ...(this.isRecord(toolRecord.portMapping)
            ? { portMapping: toolRecord.portMapping }
            : this.isRecord(toolRecord.portMappingMetadata)
              ? { portMapping: toolRecord.portMappingMetadata }
              : {}),
        };
      })
      .filter(
        (
          tool,
        ): tool is {
          toolName: string;
          mcpToolDefinitionId?: string;
          inputSchema?: Record<string, unknown>;
          portMapping?: Record<string, unknown>;
        } => tool !== null,
      );

    if (selectedTools.length > 0) {
      return selectedTools;
    }

    const fallbackToolName = this.readFirstString(
      nodeData.toolName,
      nodeData.tool_name,
    );
    if (!fallbackToolName) {
      return [];
    }

    return [
      {
        toolName: fallbackToolName,
        ...(typeof nodeData.mcpToolDefinitionId === 'string'
          ? { mcpToolDefinitionId: nodeData.mcpToolDefinitionId }
          : {}),
        ...(this.isRecord(nodeData.inputSchema)
          ? { inputSchema: nodeData.inputSchema }
          : {}),
        ...(this.isRecord(nodeData.portMapping)
          ? { portMapping: nodeData.portMapping }
          : this.isRecord(nodeData.portMappingMetadata)
            ? { portMapping: nodeData.portMappingMetadata }
            : {}),
      },
    ];
  }

  private getUpstreamMemorySessionIds(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): string[] {
    const sessionIds = new Set<string>();
    const incomingEdges = edges.filter((edge) => edge.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceStep = steps.find(
        (candidate) => candidate.nodeId === edge.source,
      );
      if (
        sourceStep?.nodeType !== 'memory' ||
        !this.isRecord(sourceStep.result)
      ) {
        continue;
      }

      const { sessionId } = sourceStep.result;
      if (typeof sessionId === 'string' && sessionId.trim()) {
        sessionIds.add(sessionId.trim());
      }
    }

    return [...sessionIds];
  }

  private async cleanupConnectedSandboxIfIdle(
    completedStep: ExecutionStep,
    executionId: string,
    tenantId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    steps: ExecutionStep[],
  ): Promise<void> {
    const sandboxSource = this.getSandboxSourceStep(
      completedStep.nodeId,
      snapshot.edges,
      steps,
    );

    if (!sandboxSource) {
      return;
    }

    const downstreamStepIds = new Set(
      snapshot.edges
        .filter((edge) => edge.source === sandboxSource.nodeId)
        .map((edge) => edge.target),
    );

    if (downstreamStepIds.size === 0) {
      return;
    }

    const allConsumersSettled = steps
      .filter((step) => downstreamStepIds.has(step.nodeId))
      .every((step) => COMPLETED_STEP_STATUSES.has(step.status));

    if (!allConsumersSettled) {
      return;
    }

    try {
      await this.sandboxService.releaseExecutionSandbox(
        executionId,
        sandboxSource.nodeId,
        tenantId,
      );
    } catch (error) {
      this.logger.warn(
        `沙箱节点 ${sandboxSource.nodeId} 释放失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async cleanupSandboxIfTerminal(
    executionId: string,
    tenantId: string,
  ): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [execution] = await tenantDb
      .select({ status: schema.workflowExecutions.status })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (
      execution &&
      (execution.status === 'completed' ||
        execution.status === 'failed' ||
        execution.status === 'cancelled')
    ) {
      try {
        await this.sandboxService.destroySandbox(executionId, tenantId);
      } catch (error) {
        this.logger.warn(
          `沙箱清理失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * 读取 execution 的 definitionSnapshot 与所有 steps。
   */
  private async loadExecutionContext(executionId: string) {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    const snapshot = execution.definitionSnapshot as {
      nodes: schema.ReactFlowNode[];
      edges: ReactFlowEdge[];
    };

    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    return { execution, snapshot, steps };
  }

  private async loadLatestSchedulingState(executionId: string): Promise<
    | {
        execution: schema.WorkflowExecution;
        snapshot: {
          nodes: schema.ReactFlowNode[];
          edges: ReactFlowEdge[];
        };
        steps: ExecutionStep[];
      }
    | undefined
  > {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId))
      .limit(1);

    if (!execution) {
      return undefined;
    }

    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    return {
      execution,
      snapshot: execution.definitionSnapshot as {
        nodes: schema.ReactFlowNode[];
        edges: ReactFlowEdge[];
      },
      steps,
    };
  }

  private evaluateExpression(
    expression: string,
    input: Record<string, unknown>,
  ): unknown {
    const script = new Script(`(${expression})`);

    return script.runInNewContext(
      {
        input,
        flatInput: this.flattenInput(input),
        ports: this.buildExpressionPorts(input),
      },
      { timeout: 1000 },
    );
  }

  private normalizeTransformResult(result: unknown): Record<string, unknown> {
    if (
      result !== null &&
      typeof result === 'object' &&
      !Array.isArray(result)
    ) {
      return result as Record<string, unknown>;
    }

    return { value: result };
  }

  private extractExecutionInputPayload(
    inputParams: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (!this.isRecord(inputParams)) {
      return {};
    }

    const payload = { ...inputParams };
    delete payload._meta;
    return payload;
  }

  private normalizeLoopItemsInput(input: Record<string, unknown>): unknown[] {
    const directCandidates = [
      input['items-in'],
      input.items,
      input.json,
      input.value,
      input.content,
      this.flattenInput(input)['items-in'],
      this.flattenInput(input).items,
      this.flattenInput(input).json,
      this.flattenInput(input).value,
      this.flattenInput(input).content,
    ];

    for (const candidate of directCandidates) {
      const normalized = this.extractLoopItemsCandidate(candidate);
      if (normalized) {
        return normalized;
      }
    }

    const fallbackEntries = Object.entries(input).filter(
      ([key]) => key !== 'exec-in' && key !== 'exec_in',
    );

    if (fallbackEntries.length === 1) {
      return this.coerceLoopItems(fallbackEntries[0][1]);
    }

    for (const [, value] of fallbackEntries) {
      const normalized = this.extractLoopItemsCandidate(value);
      if (normalized) {
        return normalized;
      }
    }

    return [];
  }

  private extractLoopItemsCandidate(value: unknown): unknown[] | undefined {
    if (Array.isArray(value)) {
      return value;
    }

    if (!this.isRecord(value)) {
      return value === undefined || value === null ? undefined : [value];
    }

    const nestedCandidates = [
      value.items,
      value.json,
      value.value,
      value.content,
      value.payload,
    ];

    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private coerceLoopItems(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (value === undefined || value === null) {
      return [];
    }

    return [value];
  }

  private extractOutputValue(input: Record<string, unknown>): unknown {
    if (Object.prototype.hasOwnProperty.call(input, 'content-in')) {
      return input['content-in'];
    }

    if (Object.prototype.hasOwnProperty.call(input, 'content')) {
      return input.content;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'json')) {
      return input.json;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'value')) {
      return input.value;
    }

    const values = Object.values(input);
    if (values.length === 1) {
      return values[0];
    }

    return input;
  }

  private extractStructuredModelConfigIds(value: unknown): string[] {
    if (!this.isRecord(value)) {
      return [];
    }

    if (Array.isArray(value.candidateModelIds)) {
      return value.candidateModelIds.filter(
        (modelId): modelId is string =>
          typeof modelId === 'string' && modelId.length > 0,
      );
    }

    const directId = this.readFirstString(
      value.selectedModelId,
      value.llmModelConfigId,
      value.modelConfigId,
    );

    if (directId) {
      return [directId];
    }

    return Object.values(value).flatMap((item) =>
      this.extractStructuredModelConfigIds(item),
    );
  }

  private stringifyOutputValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value === undefined) {
      return '';
    }

    return JSON.stringify(value ?? null);
  }

  private normalizeJsonOutputValue(value: unknown): Record<string, unknown> {
    if (this.isRecord(value)) {
      return value;
    }

    return { value };
  }

  private resolveSourceHandleValue(
    sourceStep: ExecutionStep,
    sourceHandle: string,
  ): unknown {
    if (!this.isRecord(sourceStep.result)) {
      return undefined;
    }

    const resolved = this.resolveJsonPath(sourceStep.result, sourceHandle);
    if (resolved !== undefined) {
      if (this.isConditionNode(sourceStep.nodeType)) {
        return this.unwrapConditionBranchPayload(sourceHandle, resolved);
      }

      return resolved;
    }

    switch (sourceStep.nodeType) {
      case 'agent':
      case 'chat-agent':
        if (
          sourceHandle === 'reply-out' ||
          sourceHandle === 'agent-out' ||
          sourceHandle === 'reply' ||
          sourceHandle === 'agent-output'
        ) {
          return sourceStep.result.content;
        }
        if (
          sourceHandle === 'structured-out' ||
          sourceHandle === 'structured' ||
          sourceHandle === 'structured-output'
        ) {
          return sourceStep.result.decision;
        }
        return undefined;
      case 'manual-trigger':
      case 'schedule-trigger':
      case 'webhook-trigger':
      case 'api-event-trigger':
        if (sourceHandle === 'payload-out' || sourceHandle === 'payload') {
          return sourceStep.result.payload;
        }
        if (sourceHandle === 'exec-out' || sourceHandle === 'exec_out') {
          return sourceStep.result['exec-out'] ?? sourceStep.result.exec_out;
        }
        if (this.isRecord(sourceStep.result.payload)) {
          return sourceStep.result.payload[sourceHandle];
        }
        return undefined;
      case 'llm-model':
        return sourceHandle === 'model-out' || sourceHandle === 'model-output'
          ? sourceStep.result
          : undefined;
      case 'smart-routing':
        return sourceHandle === 'model-out' ? sourceStep.result : undefined;
      case 'mcp-tool':
        return sourceHandle === 'tool-out' || sourceHandle === 'tool-output'
          ? sourceStep.result
          : undefined;
      case 'skill':
        return sourceHandle === 'skill-out' ? sourceStep.result : undefined;
      case 'knowledge-base':
        return sourceHandle === 'knowledge-out' || sourceHandle === 'knowledge'
          ? sourceStep.result
          : undefined;
      case 'sandbox':
        return sourceHandle === 'sandbox-out' ||
          sourceHandle === 'sandbox-output'
          ? sourceStep.result
          : undefined;
      case 'workspace':
        return sourceHandle === 'volume-out' || sourceHandle === 'volume-output'
          ? sourceStep.result
          : undefined;
      case 'memory':
        return sourceHandle === 'memory-out' || sourceHandle === 'memory-out-0'
          ? sourceStep.result
          : undefined;
      case 'merge':
        return sourceHandle === 'merged-out' || sourceHandle === 'merged'
          ? sourceStep.result
          : undefined;
      default:
        return undefined;
    }
  }

  private isConditionNode(nodeType: string | null | undefined): boolean {
    return nodeType === 'condition' || nodeType === 'conditional';
  }

  private unwrapConditionBranchPayload(
    sourceHandle: string,
    value: unknown,
  ): unknown {
    // 识别条件分支 handle（新格式 branch-N/else + 旧格式 matched/unmatched）
    const isConditionHandle =
      sourceHandle.startsWith('branch-') ||
      sourceHandle === 'else' ||
      sourceHandle === 'matched-out' ||
      sourceHandle === 'unmatched-out' ||
      sourceHandle === 'matched' ||
      sourceHandle === 'unmatched' ||
      sourceHandle === 'true' ||
      sourceHandle === 'false';

    if (!isConditionHandle) {
      return value;
    }

    if (!this.isRecord(value)) {
      return value;
    }

    const keys = Object.keys(value);
    if (keys.length === 1 && (keys[0] === 'input-in' || keys[0] === 'input')) {
      return value[keys[0]];
    }

    return value;
  }

  private normalizeConditionBranch(branch: string): string {
    // 新格式: branch-0, branch-1, ..., else
    if (branch.startsWith('branch-') || branch === 'else') {
      return branch;
    }

    // 旧格式: matched/true → branch-0, unmatched/false → else
    if (branch === 'true' || branch === 'matched') {
      return 'branch-0';
    }

    return 'else';
  }

  private normalizeConditionSourceHandle(
    sourceHandle?: string,
  ): string | undefined {
    if (!sourceHandle) {
      return undefined;
    }

    // 新格式 handle: branch-0, branch-1, ..., else
    if (sourceHandle.startsWith('branch-') || sourceHandle === 'else') {
      return sourceHandle;
    }

    // 旧格式 handle → 映射到新格式
    if (
      sourceHandle === 'matched-out' ||
      sourceHandle === 'true' ||
      sourceHandle === 'matched'
    ) {
      return 'branch-0';
    }

    if (
      sourceHandle === 'unmatched-out' ||
      sourceHandle === 'false' ||
      sourceHandle === 'unmatched'
    ) {
      return 'else';
    }

    return undefined;
  }

  /**
   * 条件节点分支处理：匹配分支正常调度，不匹配分支跳过。
   */
  private async handleConditionalBranching(
    executionId: string,
    conditionalNodeId: string,
    branch: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    const normalizedBranch = this.normalizeConditionBranch(branch);
    const outgoingEdges = snapshot.edges.filter(
      (e) => e.source === conditionalNodeId,
    );

    for (const edge of outgoingEdges) {
      const normalizedHandle = this.normalizeConditionSourceHandle(
        this.readEdgeHandle(edge, 'source'),
      );

      if (!normalizedHandle || normalizedHandle === normalizedBranch) {
        // 匹配分支：检查前驱后调度
        const decision = this.getSchedulingDecision(
          edge.target,
          snapshot.edges,
          steps,
        );
        if (decision === 'schedule') {
          await this.scheduleNode(
            executionId,
            edge.target,
            tenantId,
            snapshot,
            steps,
          );
        }
      } else {
        // 不匹配分支：跳过并级联
        await this.skipAndCascade(executionId, edge.target, steps, tenantId);
      }
    }
  }

  /**
   * 跳过节点并递归触发后续调度。
   */
  private async skipAndCascade(
    executionId: string,
    nodeId: string,
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    const latestState = await this.loadLatestSchedulingState(executionId);
    if (
      latestState &&
      (latestState.execution.status === 'failed' ||
        latestState.execution.status === 'cancelled' ||
        latestState.execution.status === 'completed')
    ) {
      return;
    }

    const step = (latestState?.steps ?? steps).find((s) => s.nodeId === nodeId);
    if (!step || step.status !== 'pending') return;

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'skipped');
    await this.onNodeCompleted(executionId, step.id, tenantId);
  }

  /**
   * 判断后继节点应当 schedule / skip / wait。
   *
   * - 所有前驱完成且至少一个非 skipped → schedule
   * - 所有前驱完成且全部 skipped → skip
   * - 存在未完成前驱 → wait
   */
  private getSchedulingDecision(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): SchedulingDecision {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    if (incomingEdges.length === 0) return 'schedule';

    const incomingDependencies: Array<{
      edge: ReactFlowEdge;
      sourceStep: ExecutionStep;
    }> = [];
    let allSkipped = true;

    for (const edge of incomingEdges) {
      const sourceStep = steps.find((s) => s.nodeId === edge.source);
      if (!sourceStep || !COMPLETED_STEP_STATUSES.has(sourceStep.status)) {
        return 'wait';
      }

      incomingDependencies.push({ edge, sourceStep });
      if (sourceStep.status !== 'skipped') {
        allSkipped = false;
      }
    }

    const requiredTargetHandles = this.getRequiredInputHandles(nodeId, steps);
    for (const requiredTargetHandle of requiredTargetHandles) {
      const connectedRequiredEdges = incomingDependencies.filter(
        ({ edge }) =>
          this.readEdgeHandle(edge, 'target') === requiredTargetHandle,
      );

      if (connectedRequiredEdges.length === 0) {
        continue;
      }

      if (
        connectedRequiredEdges.every(
          ({ sourceStep }) => sourceStep.status === 'skipped',
        )
      ) {
        return 'skip';
      }
    }

    return allSkipped ? 'skip' : 'schedule';
  }

  private getRequiredInputHandles(
    nodeId: string,
    steps: ExecutionStep[],
  ): Set<string> {
    const targetStep = steps.find((step) => step.nodeId === nodeId);
    if (!targetStep || !this.isRecord(targetStep.nodeData)) {
      return new Set();
    }

    const nodeData = targetStep.nodeData;
    const inputPorts = Array.isArray(nodeData.input_ports)
      ? nodeData.input_ports
      : Array.isArray(nodeData.inputPorts)
        ? nodeData.inputPorts
        : [];

    return new Set(
      inputPorts.flatMap((port) => {
        if (!this.isRecord(port) || port.required !== true) {
          return [];
        }

        return typeof port.id === 'string' && port.id.length > 0
          ? [port.id]
          : [];
      }),
    );
  }

  /**
   * 简单 JSON 路径解析（支持 `key.nested.field` 与 `items[0].name` 格式）。
   */
  private resolveJsonPath(obj: Record<string, unknown>, path: string): unknown {
    if (!path) {
      return obj;
    }

    const segments = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);

    return segments.reduce<unknown>((acc, key) => {
      if (Array.isArray(acc)) {
        const index = Number.parseInt(key, 10);
        return Number.isFinite(index) ? acc[index] : undefined;
      }

      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }

      return undefined;
    }, obj);
  }

  private setValueAtPath(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const segments = path.split('.').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    let cursor = target;

    for (const [index, segment] of segments.entries()) {
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        const existingValue = cursor[segment];
        if (existingValue === undefined) {
          cursor[segment] = value;
          return;
        }

        if (Array.isArray(existingValue)) {
          existingValue.push(value);
          cursor[segment] = existingValue;
          return;
        }

        cursor[segment] = [existingValue, value];
        return;
      }

      const next = cursor[segment];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[segment] = {};
      }

      cursor = cursor[segment] as Record<string, unknown>;
    }
  }

  /**
   * 扁平化输入：将 `{ [nodeId]: { field: value } }` 展开。
   *
   * 多个源节点有同名字段时后者覆盖前者。
   */
  // ── N-way 条件分支评估 ─────────────────────────────────────

  /**
   * 条件分支描述（统一新旧格式后的内部表示）
   */
  private resolveConditionBranches(nodeData: Record<string, unknown>): Array<{
    id: string;
    mode: 'visual' | 'expression';
    expression: string;
    conditions: {
      rules: Array<{
        sourcePortId: string;
        fieldPath: string;
        operator: string;
        value: string;
      }>;
      logic: 'and' | 'or';
    };
  }> {
    // 新格式: branches 数组
    if (Array.isArray(nodeData.branches)) {
      return nodeData.branches
        .filter((b) => this.isRecord(b))
        .map((b, index) => ({
          id: typeof b.id === 'string' ? b.id : `branch-${index}`,
          mode: b.mode === 'expression' ? 'expression' : 'visual',
          expression: typeof b.expression === 'string' ? b.expression : '',
          conditions: this.normalizeConditionGroup(b.conditions),
        }));
    }

    // 旧格式: mode + expression/conditionField
    const mode = nodeData.mode;

    if (mode === 'expression') {
      const expression =
        typeof nodeData.expression === 'string'
          ? nodeData.expression.trim()
          : '';
      return [
        {
          id: 'branch-0',
          mode: 'expression',
          expression,
          conditions: { rules: [], logic: 'and' },
        },
      ];
    }

    if (mode === 'field-comparison') {
      const field = this.readFirstString(
        nodeData.conditionField,
        nodeData.condition_field,
      );
      const value =
        nodeData.expectedValue != null
          ? String(nodeData.expectedValue)
          : nodeData.expected_value != null
            ? String(nodeData.expected_value)
            : '';
      return [
        {
          id: 'branch-0',
          mode: 'visual' as const,
          expression: '',
          conditions: {
            rules: [
              {
                sourcePortId: 'input-0',
                fieldPath: field ?? '',
                operator: 'equals',
                value,
              },
            ],
            logic: 'and' as const,
          },
        },
      ];
    }

    // 无条件配置但有 expression 或 conditionField（旧版兼容 fallback）
    const fallbackExpression = this.readFirstString(nodeData.expression);
    const fallbackField = this.readFirstString(
      nodeData.conditionField,
      nodeData.condition_field,
    );

    if (fallbackExpression) {
      return [
        {
          id: 'branch-0',
          mode: 'expression',
          expression: fallbackExpression,
          conditions: { rules: [], logic: 'and' },
        },
      ];
    }

    if (fallbackField) {
      const value =
        nodeData.expectedValue != null
          ? String(nodeData.expectedValue)
          : nodeData.expected_value != null
            ? String(nodeData.expected_value)
            : '';
      return [
        {
          id: 'branch-0',
          mode: 'visual',
          expression: '',
          conditions: {
            rules: [
              {
                sourcePortId: 'input-0',
                fieldPath: fallbackField,
                operator: 'equals',
                value,
              },
            ],
            logic: 'and',
          },
        },
      ];
    }

    // 完全空配置
    return [];
  }

  private normalizeConditionGroup(value: unknown): {
    rules: Array<{
      sourcePortId: string;
      fieldPath: string;
      operator: string;
      value: string;
    }>;
    logic: 'and' | 'or';
  } {
    if (!this.isRecord(value)) {
      return { rules: [], logic: 'and' };
    }

    const logic = value.logic === 'or' ? 'or' : 'and';
    const rawRules = Array.isArray(value.rules) ? value.rules : [];
    const rules = rawRules
      .filter((r) => this.isRecord(r))
      .map((r) => ({
        sourcePortId:
          typeof r.sourcePortId === 'string' && r.sourcePortId.length > 0
            ? r.sourcePortId
            : 'input-0',
        fieldPath:
          typeof r.fieldPath === 'string'
            ? r.fieldPath
            : typeof r.field === 'string'
              ? r.field
              : '',
        operator: typeof r.operator === 'string' ? r.operator : 'equals',
        value: typeof r.value === 'string' ? r.value : '',
      }));

    return { rules, logic };
  }

  /**
   * 评估单个分支是否匹配
   */
  private evaluateConditionBranch(
    branch: {
      mode: 'visual' | 'expression';
      expression: string;
      conditions: {
        rules: Array<{
          sourcePortId: string;
          fieldPath: string;
          operator: string;
          value: string;
        }>;
        logic: 'and' | 'or';
      };
    },
    input: Record<string, unknown>,
    flatInput: Record<string, unknown>,
  ): boolean {
    if (branch.mode === 'expression') {
      if (!branch.expression.trim()) {
        return false;
      }

      return !!this.evaluateExpression(branch.expression, input);
    }

    // 可视化模式: 评估条件规则组
    const { rules, logic } = branch.conditions;
    if (rules.length === 0) {
      return false;
    }

    if (logic === 'and') {
      return rules.every((rule) =>
        this.evaluateConditionRule(rule, input, flatInput),
      );
    }

    return rules.some((rule) =>
      this.evaluateConditionRule(rule, input, flatInput),
    );
  }

  /**
   * 评估单条规则（11 种运算符 + 向后兼容 expression 运算符）
   */
  private evaluateConditionRule(
    rule: {
      sourcePortId: string;
      fieldPath: string;
      operator: string;
      value: string;
    },
    input: Record<string, unknown>,
    flatInput: Record<string, unknown>,
  ): boolean {
    // expression 运算符: 整个 value 作为 JS 表达式
    if (rule.operator === 'expression') {
      const expr = rule.value.trim();
      if (!expr) {
        return false;
      }

      return !!this.evaluateExpression(expr, input);
    }

    const fieldValue = this.resolveConditionFieldValue(
      rule.sourcePortId,
      rule.fieldPath,
      input,
      flatInput,
    );
    const expected = rule.value;

    switch (rule.operator) {
      case 'equals':
        return String(fieldValue ?? '') === expected;
      case 'not_equals':
        return String(fieldValue ?? '') !== expected;
      case 'contains':
        return String(fieldValue ?? '').includes(expected);
      case 'not_contains':
        return !String(fieldValue ?? '').includes(expected);
      case 'gt':
        return Number(fieldValue) > Number(expected);
      case 'gte':
        return Number(fieldValue) >= Number(expected);
      case 'lt':
        return Number(fieldValue) < Number(expected);
      case 'lte':
        return Number(fieldValue) <= Number(expected);
      case 'starts_with':
        return String(fieldValue ?? '').startsWith(expected);
      case 'ends_with':
        return String(fieldValue ?? '').endsWith(expected);
      case 'is_empty':
        return (
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0)
        );
      case 'is_not_empty':
        return !(
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0)
        );
      case 'regex_match':
        try {
          return new RegExp(expected).test(String(fieldValue ?? ''));
        } catch {
          return false;
        }
      default:
        return String(fieldValue ?? '') === expected;
    }
  }

  /**
   * 解析条件规则中的字段值：先在 flatInput 中查找，再在 input 中做路径解析
   */
  private resolveConditionFieldValue(
    sourcePortId: string,
    fieldPath: string,
    input: Record<string, unknown>,
    flatInput: Record<string, unknown>,
  ): unknown {
    if (!sourcePortId) {
      return undefined;
    }

    const portValue = input[sourcePortId];
    if (!fieldPath) {
      return portValue;
    }

    const normalizedPath = fieldPath.startsWith('[')
      ? `${sourcePortId}${fieldPath}`
      : `${sourcePortId}.${fieldPath}`;

    // 直接查 flatInput
    if (Object.prototype.hasOwnProperty.call(flatInput, normalizedPath)) {
      return flatInput[normalizedPath];
    }

    // 路径解析
    return this.resolveJsonPath(input, normalizedPath);
  }

  private flattenInput(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = value;
      if (value && typeof value === 'object') {
        this.flattenInputInto(result, key, value);
      }
    }
    return result;
  }

  private flattenInputInto(
    target: Record<string, unknown>,
    prefix: string,
    value: unknown,
  ): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        const nextPath = `${prefix}[${index}]`;
        target[nextPath] = entry;
        if (entry && typeof entry === 'object') {
          this.flattenInputInto(target, nextPath, entry);
        }
      });
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    for (const [childKey, childValue] of Object.entries(value)) {
      const nextPath = `${prefix}.${childKey}`;
      target[nextPath] = childValue;
      if (childValue && typeof childValue === 'object') {
        this.flattenInputInto(target, nextPath, childValue);
      }
    }
  }

  private buildExpressionPorts(
    input: Record<string, unknown>,
  ): Record<number, unknown> {
    const ports: Record<number, unknown> = {};
    const orderedInputs = Object.entries(input)
      .filter(([key]) => key.startsWith('input-'))
      .sort(([left], [right]) =>
        left.localeCompare(right, undefined, { numeric: true }),
      );

    orderedInputs.forEach(([_, value], index) => {
      ports[index + 1] = value;
    });

    return ports;
  }

  // ── Loop 停止条件辅助方法 ─────────────────────────────────────

  /**
   * 从 nodeData 解析循环停止条件（visual 模式下的 ConditionGroup）
   */
  private resolveLoopStopCondition(nodeData: Record<string, unknown>):
    | {
        rules: Array<{
          sourcePortId: string;
          fieldPath: string;
          operator: string;
          value: string;
        }>;
        logic: 'and' | 'or';
      }
    | undefined {
    const raw = this.readFirstDefined(
      nodeData.stopCondition,
      nodeData.stop_condition,
    );

    if (!this.isRecord(raw)) {
      return undefined;
    }

    const logic = raw.logic === 'or' ? 'or' : 'and';
    const rawRules = Array.isArray(raw.rules) ? raw.rules : [];
    const rules = rawRules
      .filter((r) => this.isRecord(r))
      .map((r) => ({
        sourcePortId: 'input-0',
        fieldPath:
          typeof r.fieldPath === 'string'
            ? r.fieldPath
            : typeof r.field === 'string'
              ? r.field
              : '',
        operator: typeof r.operator === 'string' ? r.operator : 'equals',
        value: typeof r.value === 'string' ? r.value : '',
      }));

    if (rules.length === 0) {
      return undefined;
    }

    return { rules, logic };
  }

  /**
   * 从 nodeData 解析循环错误处理策略
   */
  private resolveLoopErrorStrategy(
    nodeData: Record<string, unknown>,
  ): 'stop' | 'skip' | 'collect' {
    const raw = this.readFirstString(
      nodeData.errorStrategy,
      nodeData.error_strategy,
    );

    return raw === 'skip' || raw === 'collect' ? raw : 'stop';
  }

  /**
   * 评估循环停止条件（visual 模式）
   *
   * 将当前迭代项包装为 input 对象后复用 evaluateConditionBranch
   */
  private evaluateLoopStopCondition(
    conditions: {
      rules: Array<{
        sourcePortId: string;
        fieldPath: string;
        operator: string;
        value: string;
      }>;
      logic: 'and' | 'or';
    },
    currentItem: unknown,
  ): boolean {
    const wrappedInput = this.wrapLoopItemAsInput(currentItem);
    const flatInput = this.flattenInput(wrappedInput);

    return this.evaluateConditionBranch(
      {
        mode: 'visual',
        expression: '',
        conditions,
      },
      wrappedInput,
      flatInput,
    );
  }

  /**
   * 评估循环停止表达式（expression 模式）
   */
  private evaluateLoopStopExpression(
    expression: string,
    currentItem: unknown,
  ): boolean {
    const wrappedInput = this.wrapLoopItemAsInput(currentItem);
    return !!this.evaluateExpression(expression, wrappedInput);
  }

  /**
   * 将循环迭代项包装为 evaluateConditionBranch 期望的 input 格式
   */
  private wrapLoopItemAsInput(item: unknown): Record<string, unknown> {
    if (this.isRecord(item)) {
      return item;
    }

    return { value: item };
  }
}
