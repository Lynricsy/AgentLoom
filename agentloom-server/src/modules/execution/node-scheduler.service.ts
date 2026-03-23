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
} from './node-handlers/input-preprocessor.handler';
import { AgentAdapterFactory } from './adapters/agent-adapter-factory';
import { getModelRoutingMeta } from '../llm/llm-provider-catalog';
import { SkillResolverService } from '../skill/skill-resolver.service';

/** 调度决策 */
type SchedulingDecision = 'schedule' | 'skip' | 'wait';

interface InterventionTimeoutOptions {
  readonly escalated?: boolean;
  readonly escalationCount?: number;
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

@Injectable()
export class NodeSchedulerService {
  private readonly logger = new Logger(NodeSchedulerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dagResolver: DagResolverService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly sandboxService: SandboxService,
    private readonly checkpointService: CheckpointService,
    private readonly eventBridge: EventBridgeService,
    private readonly interventionPolicyService: InterventionPolicyService,
    private readonly rbacCacheService: RbacCacheService,
    private readonly smartRoutingService: SmartRoutingService,
    private readonly routerRegistry: RouterRegistry,
    private readonly healthMonitorService: HealthMonitorService,
    private readonly embeddingService: EmbeddingIntegrationService,
    private readonly pluginService: PluginService,
    private readonly workflowAgentAdapterFactory: AgentAdapterFactory,
    private readonly sharedResourceRegistry: SharedResourceRegistry,
    @InjectQueue(AGENT_TASK_QUEUE)
    private readonly agentTaskQueue: Queue,
    @InjectQueue(PLUGIN_EXECUTION_QUEUE)
    private readonly pluginQueue: Queue,
    @Optional()
    @Inject(SkillResolverService)
    private readonly skillResolverService?: SkillResolverService,
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
    const plan = this.dagResolver.resolveDag(snapshot.nodes, snapshot.edges);

    // 空图直接收尾
    if (plan.layers.length === 0) {
      await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);
      return;
    }

    await Promise.all(
      plan.layers[0].map((nodeId) =>
        this.scheduleNode(executionId, nodeId, tenantId, snapshot, steps),
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

    const plan = this.dagResolver.resolveDag(snapshot.nodes, snapshot.edges);

    const successors = plan.adjacencyMap.get(completedStep.nodeId) ?? [];

    // 条件节点需要分支处理
    if (
      completedStep.nodeType === 'conditional' &&
      completedStep.status === 'completed' &&
      completedStep.result
    ) {
      await this.handleConditionalBranching(
        executionId,
        completedStep.nodeId,
        completedStep.result.branch as string,
        snapshot,
        steps,
        tenantId,
      );
    } else {
      // 普通完成或被跳过：逐个检查后继
      for (const successorId of successors) {
        const decision = this.getSchedulingDecision(
          successorId,
          snapshot.edges,
          steps,
        );

        if (decision === 'schedule') {
          await this.scheduleNode(
            executionId,
            successorId,
            tenantId,
            snapshot,
            steps,
          );
        } else if (decision === 'skip') {
          await this.skipAndCascade(executionId, successorId, steps, tenantId);
        }
        // 'wait' → 不操作
      }
    }

    await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);
    await this.cleanupSandboxIfTerminal(executionId, tenantId);
    await this.checkpointService.saveCheckpoint(tenantId, executionId, stepId);
  }
  async scheduleNode(
    executionId: string,
    nodeId: string,
    tenantId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    steps: ExecutionStep[],
  ): Promise<void> {
    const step = steps.find((s) => s.nodeId === nodeId);
    if (!step) return;

    let input: Record<string, unknown>;
    try {
      input = this.resolveNodeInput(
        nodeId,
        snapshot.edges,
        steps,
        snapshot.nodes,
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

    switch (step.nodeType) {
      case 'agent':
        if (this.getWorkflowAgentDefinitionId(step.nodeData ?? {})) {
          await this.executeWorkflowAgentNode(
            step,
            input,
            tenantId,
            executionId,
            snapshot.edges,
            steps,
          );
          break;
        }

        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'queued',
        );
        {
          const { data, options } = this.buildAgentTaskJobData({
            executionId,
            tenantId,
            step,
            input,
            hasSandbox: this.hasSandboxUpstream(nodeId, snapshot.edges, steps),
          });
          await this.agentTaskQueue.add('agent-task', data, options);
        }
        break;

      case 'sandbox':
        await this.executeSandboxNode(step, input, tenantId, executionId);
        break;

      case 'memory':
        await this.executeMemoryNode(step, tenantId, executionId);
        break;

      case 'data_transform':
        await this.executeDataTransform(step, input, tenantId, executionId);
        break;

      case 'conditional':
        await this.executeConditional(step, input, tenantId, executionId);
        break;

      case 'smart-routing':
        await this.executeSmartRouting(step, input, tenantId, executionId);
        break;

      case 'plugin':
        await this.executePlugin(step, input, tenantId, executionId);
        break;

      case 'input-preprocessor':
        await this.executeInputPreprocessor(step, input, tenantId, executionId);
        break;

      case 'skill':
        await this.executeSkillNode(step, input, tenantId, executionId);
        break;

      case 'sub-agent':
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'queued',
        );
        {
          const { data, options } = this.buildAgentTaskJobData({
            executionId,
            tenantId,
            step,
            input,
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
          const { data, options } = this.buildAgentTaskJobData({
            executionId,
            tenantId,
            step,
            input,
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
    const orgId = typeof nodeData.orgId === 'string' ? nodeData.orgId : undefined;

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

      const sourceHandle = edge.sourceHandle ?? undefined;
      const targetHandle = edge.targetHandle ?? undefined;

      if (targetHandle) {
        this.setValueAtPath(
          input,
          targetHandle,
          sourceHandle
            ? this.resolveJsonPath(sourceStep.result, sourceHandle)
            : sourceStep.result,
        );
        continue;
      }

      if (sourceHandle) {
        this.setValueAtPath(
          input,
          sourceHandle,
          this.resolveJsonPath(sourceStep.result, sourceHandle),
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
    if (!edge.sourceHandle || !edge.targetHandle) return;

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
      (p) => p.name === edge.sourceHandle,
    );
    const targetPort = targetPortMeta?.inputs?.find(
      (p) => p.name === edge.targetHandle,
    );
    if (!sourcePort?.dataType || !targetPort?.dataType) return;

    if (!isPortTypeCompatible(sourcePort.dataType, targetPort.dataType)) {
      throw new NodeTypeMismatchException({
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourcePortId: edge.sourceHandle,
        targetPortId: edge.targetHandle,
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
    const plan = this.dagResolver.resolveDag(snapshot.nodes, snapshot.edges);

    for (const layer of plan.layers) {
      for (const nodeId of layer) {
        const step = steps.find((s) => s.nodeId === nodeId);
        if (!step || step.status !== 'pending') continue;

        const decision = this.getSchedulingDecision(
          nodeId,
          snapshot.edges,
          steps,
        );
        if (decision === 'schedule') {
          await this.scheduleNode(
            executionId,
            nodeId,
            tenantId,
            snapshot,
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
      const workflowDefinitionId = await this.loadWorkflowDefinitionId(executionId);
      const resolvedPolicy = await this.interventionPolicyService.resolvePolicy(
        tenantId,
        workflowDefinitionId,
        step.nodeId,
      );
      const userRole = await this.rbacCacheService.getUserRole(tenantId, userId);

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

    for (let escalationCount = 1; escalationCount <= MAX_ESCALATION_ATTEMPTS; escalationCount += 1) {
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
        { result: result as Record<string, unknown> },
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
      const nodeData = this.isRecord(step.nodeData) ? step.nodeData : {};

      const config: InputPreprocessorConfig = {
        transformType:
          typeof nodeData.transformType === 'string'
            ? (nodeData.transformType as InputPreprocessorConfig['transformType'])
            : 'jmespath',
        expression:
          typeof nodeData.expression === 'string'
            ? nodeData.expression
            : '',
        ...(typeof nodeData.outputFormat === 'string'
          ? { outputFormat: nodeData.outputFormat }
          : {}),
      };

      const handler = new InputPreprocessorHandlerImpl();
      const { output, outputFormat } = await handler.execute(input, config);

      const result: Record<string, unknown> =
        typeof output === 'string' ? { text: output } : output;

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
      const config = this.isRecord(nodeData.config) ? nodeData.config : nodeData;
      const skillId =
        typeof config.skillId === 'string' && config.skillId.trim().length > 0
          ? config.skillId.trim()
          : undefined;

      if (!skillId) {
        this.logger.warn(`Skill node ${step.nodeId} has no skillId configured`);
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: { warning: 'No skillId configured', skills: [] },
          },
        );
        await this.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      if (!this.skillResolverService) {
        this.logger.warn(
          `SkillResolverService unavailable for skill node ${step.nodeId}`,
        );
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: { warning: 'Skill resolver unavailable', skills: [] },
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
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              warning: `Skill ${skillId} not found or inactive`,
              skills: [],
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

      await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'completed', {
        result: { skills: skillPayloads },
      });
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
      const nodeData = step.nodeData ?? {};
      const expression =
        typeof nodeData.expression === 'string'
          ? nodeData.expression.trim()
          : '';
      const conditionField = nodeData.conditionField as string;
      const expectedValue = nodeData.expectedValue;

      const flatInput = this.flattenInput(input);
      const evaluation = expression
        ? this.evaluateExpression(expression, input)
        : flatInput[conditionField] === expectedValue;
      const branch = evaluation ? 'true' : 'false';

      const result = expression
        ? {
            branch,
            expression,
            evaluatedValue: evaluation,
          }
        : {
            branch,
            evaluatedField: conditionField,
            actualValue: flatInput[conditionField],
            expectedValue,
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

  async executeSmartRouting(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = this.isRecord(step.nodeData) ? step.nodeData : {};
      const rawStrategy = this.resolveSmartRoutingStrategyValue(nodeData);
      const strategyName = this.normalizeSmartRoutingStrategyName(rawStrategy);
      const strategyConfig = this.resolveSmartRoutingStrategyConfig(nodeData);
      const router = this.routerRegistry.get(strategyName);

      const modelConfigIds = this.collectModelConfigIds(nodeData, input);
      const tokenThreshold =
        typeof nodeData.tokenThreshold === 'number' && nodeData.tokenThreshold > 0
          ? nodeData.tokenThreshold
          : 4096;
      const queryText = this.extractSmartRoutingQueryText(nodeData, input);
      const taskCategory = this.extractSmartRoutingTaskCategory(nodeData, input);
      const inputTokenCount = this.estimateTokenCount(input);
      const historicalMetrics =
        strategyName === 'historical_best'
          ? await this.smartRoutingService.getHistoricalMetrics(tenantId, step.nodeId)
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

      const candidates = await this.loadRoutingCandidates(modelConfigIds, tenantId);
      const healthyCandidates = await this.healthMonitorService.filterHealthyCandidates(
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

  private buildAgentTaskJobData(params: {
    executionId: string;
    tenantId: string;
    step: ExecutionStep;
    input: Record<string, unknown>;
    hasSandbox?: boolean;
  }): {
    data: AgentTaskJobData;
    options?: { attempts: number };
  } {
    const { executionId, tenantId, step, input, hasSandbox } = params;
    const smartRouting = this.extractSmartRoutingContext(input);
    const nodeData = { ...(step.nodeData ?? {}) };

    if (smartRouting) {
      nodeData.llmModelConfigId = smartRouting.selectedModelId;
    }

    return {
      data: {
        executionId,
        stepId: step.id,
        tenantId,
        input,
        nodeData,
        ...(smartRouting ? { smartRouting } : {}),
        ...(hasSandbox ? { hasSandbox } : {}),
      },
      ...(this.isFallbackChainStrategy(smartRouting?.strategy)
        ? { options: { attempts: 1 } }
        : {}),
    };
  }

  private resolveSmartRoutingStrategyValue(
    nodeData: Record<string, unknown>,
  ): string {
    if (typeof nodeData.strategyName === 'string' && nodeData.strategyName.length > 0) {
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
      strategy && this.normalizeSmartRoutingStrategyName(strategy) === 'fallback_chain',
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
      this.findFirstStringByKeys(nodeData, ['taskCategory', 'category', 'intent']) ??
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
        provider: schema.llmModelConfigs.provider,
        modelName: schema.llmModelConfigs.modelName,
      })
      .from(schema.llmModelConfigs)
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

    const configsById = new Map(modelConfigs.map((config) => [config.id, config]));
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
          modelConfig.provider,
          modelConfig.modelName,
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
          provider: routingMetadata?.providerName ?? modelConfig.provider,
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
              this.readNumber(rawRoutingMeta?.contextWindow, fallbackMeta.contextWindow),
            ),
            eloRating: this.readNumber(routingMetadata?.eloRating, 1200),
          },
          healthStatus: 'healthy',
        });
    }

    return candidates;
  }

  private mapRoutingDecisionScores(
    decision: RouterDecision,
  ): Array<{
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

    return Object.values(value).flatMap((item) => this.extractModelConfigIds(item));
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

  // ── 私有辅助 ───────────────────────────────────────────────

  private getWorkflowAgentDefinitionId(
    nodeData: Record<string, unknown>,
  ): string | undefined {
    if (typeof nodeData.agentDefinitionId === 'string') {
      return nodeData.agentDefinitionId;
    }

    if (typeof nodeData.agent_definition_id === 'string') {
      return nodeData.agent_definition_id;
    }

    return undefined;
  }

  private async executeWorkflowAgentNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = step.nodeData ?? {};
      const agentDefinitionId = this.getWorkflowAgentDefinitionId(nodeData);

      if (!agentDefinitionId) {
        throw new Error(`Workflow agent node ${step.nodeId} 缺少 agentDefinitionId`);
      }

      const workflowSandboxConfig = this.getWorkflowSandboxOverride(
        step.nodeId,
        edges,
        steps,
      );
      const adapter = this.workflowAgentAdapterFactory.createFromAgentDefinition(
        agentDefinitionId,
        workflowSandboxConfig,
      );

      const result = await adapter.execute({
        executionId,
        step,
        input,
        tenantId,
        ...(workflowSandboxConfig
          ? { sandboxBinding: { executionId } }
          : {}),
        ...(typeof nodeData.agentVersionId === 'string'
          ? { agentVersionId: nodeData.agentVersionId }
          : typeof nodeData.agent_version_id === 'string'
            ? { agentVersionId: nodeData.agent_version_id }
            : {}),
      });

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

  private getWorkflowSandboxOverride(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): SandboxConfig | undefined {
    const incomingEdges = edges.filter((edge) => edge.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceStep = steps.find((candidate) => candidate.nodeId === edge.source);
      if (sourceStep?.nodeType !== 'sandbox') {
        continue;
      }

      return this.resolveSandboxConfig(sourceStep.nodeData ?? {});
    }

    return undefined;
  }

  private resolveSandboxConfig(nodeData: Record<string, unknown>): SandboxConfig {
    const sandboxConfigSource = this.getSandboxConfigSource(nodeData);

    return {
      cpu: typeof sandboxConfigSource.cpu === 'number' ? sandboxConfigSource.cpu : 1,
      memory:
        typeof sandboxConfigSource.memory === 'number'
          ? sandboxConfigSource.memory
          : 512,
      disk: typeof sandboxConfigSource.disk === 'number' ? sandboxConfigSource.disk : 2,
      timeout:
        typeof sandboxConfigSource.timeout === 'number'
          ? sandboxConfigSource.timeout
          : 2,
      ...(typeof sandboxConfigSource.persistencePath === 'string'
        ? { persistencePath: sandboxConfigSource.persistencePath }
        : {}),
    };
  }

  async executeSandboxNode(
    step: ExecutionStep,
    _input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const config = this.resolveSandboxConfig(step.nodeData ?? {});

      const session = await this.sandboxService.createSandboxSession({
        executionId,
        sandboxNodeId: step.nodeId,
        config,
        tenantId,
      });

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            sessionId: session.id,
            status: session.status,
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
      const config = this.resolveMemoryConfig(step.nodeData ?? {}, tenantId, executionId);
      const instance =
        await this.sharedResourceRegistry.createResource<
          MemoryResourceConfig,
          MemoryResourceInstance
        >('memory', config);

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            sessionId: instance.sessionId,
            instanceId: config.memoryInstanceId,
            role: config.role,
            status: instance.session.status,
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
    const memoryConfigSource = this.isRecord(nodeData.config)
      ? nodeData.config
      : nodeData;
    const memoryInstanceId = memoryConfigSource.memoryInstanceId;

    if (typeof memoryInstanceId !== 'string' || memoryInstanceId.length === 0) {
      throw new Error('Memory node requires memoryInstanceId');
    }

    return {
      memoryInstanceId,
      role: memoryConfigSource.role === 'readonly' ? 'readonly' : 'primary',
      bootUris: Array.isArray(memoryConfigSource.bootUris)
        ? memoryConfigSource.bootUris.filter(
            (uri): uri is string => typeof uri === 'string',
          )
        : [],
      fusionPriority:
        typeof memoryConfigSource.fusionPriority === 'number'
          ? memoryConfigSource.fusionPriority
          : 0,
      tenantId,
      executionId,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasSandboxUpstream(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): boolean {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    return incomingEdges.some((edge) => {
      const sourceStep = steps.find((s) => s.nodeId === edge.source);
      return sourceStep?.nodeType === 'sandbox';
    });
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

  private evaluateExpression(
    expression: string,
    input: Record<string, unknown>,
  ): unknown {
    const script = new Script(`(${expression})`);

    return script.runInNewContext(
      {
        input,
        flatInput: this.flattenInput(input),
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
    const outgoingEdges = snapshot.edges.filter(
      (e) => e.source === conditionalNodeId,
    );

    for (const edge of outgoingEdges) {
      if (edge.sourceHandle === branch) {
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
    const step = steps.find((s) => s.nodeId === nodeId);
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

    let allSkipped = true;

    for (const edge of incomingEdges) {
      const sourceStep = steps.find((s) => s.nodeId === edge.source);
      if (!sourceStep || !COMPLETED_STEP_STATUSES.has(sourceStep.status)) {
        return 'wait';
      }
      if (sourceStep.status !== 'skipped') {
        allSkipped = false;
      }
    }

    return allSkipped ? 'skip' : 'schedule';
  }

  /**
   * 简单 JSON 路径解析（支持 `key.nested.field` 格式）。
   */
  private resolveJsonPath(obj: Record<string, unknown>, path: string): unknown {
    if (!path) {
      return obj;
    }

    return path.split('.').reduce<unknown>((acc, key) => {
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
        cursor[segment] = value;
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
  private flattenInput(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = value;
      if (value && typeof value === 'object') {
        Object.assign(result, value);
      }
    }
    return result;
  }
}
