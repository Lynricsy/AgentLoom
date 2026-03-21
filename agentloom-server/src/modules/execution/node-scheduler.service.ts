import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
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
  INTERVENTION_TIMEOUT_MS,
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
import type { RoutingStrategy, RoutingContext } from '../smart-routing/dto/routing-context.dto';
import { PluginService } from '../plugin/plugin.service';
import { PLUGIN_EXECUTION_QUEUE } from '../plugin/plugin.constants';
import {
  InputPreprocessorHandlerImpl,
  type InputPreprocessorConfig,
} from './node-handlers/input-preprocessor.handler';

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
    private readonly pluginService: PluginService,
    @InjectQueue(AGENT_TASK_QUEUE)
    private readonly agentTaskQueue: Queue,
    @InjectQueue(PLUGIN_EXECUTION_QUEUE)
    private readonly pluginQueue: Queue,
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
        : await this.resolveInterventionTimeoutMs(executionId, stepId, tenantId);

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
    executionId: string,
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
        { result },
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
      const nodeData = step.nodeData ?? {};
      const strategy =
        (nodeData.strategy as RoutingStrategy | undefined) ?? 'FALLBACK_CHAIN';

      const modelConfigIds = this.collectModelConfigIds(nodeData, input);
      const tokenThreshold =
        typeof nodeData.tokenThreshold === 'number' && nodeData.tokenThreshold > 0
          ? nodeData.tokenThreshold
          : 4096;
      const historicalMetrics =
        strategy === 'HISTORICAL_BEST'
          ? await this.smartRoutingService.getHistoricalMetrics(tenantId, step.nodeId)
          : undefined;

      const context: RoutingContext = {
        inputTokenCount: this.estimateTokenCount(input),
        tokenThreshold,
        ...(historicalMetrics && Object.keys(historicalMetrics).length > 0
          ? { historicalMetrics }
          : {}),
      };

      const decision = await this.smartRoutingService.evaluate(
        modelConfigIds,
        context,
        strategy,
        tenantId,
      );

      await this.smartRoutingService.recordDecision(
        step.id,
        tenantId,
        step.nodeId,
        decision,
      );

      const candidateModelIds = decision.evaluatedModels.map(
        (model) => model.modelId,
      );
      const currentModelIndex = Math.max(
        candidateModelIds.indexOf(decision.selectedModelId),
        0,
      );

      const result = {
        selectedModelId: decision.selectedModelId,
        llmModelConfigId: decision.selectedModelId,
        strategy: decision.strategy,
        reasoning: decision.reasoning,
        evaluatedModels: decision.evaluatedModels,
        latencyMs: decision.latencyMs,
        routingStepId: step.id,
        routingNodeId: step.nodeId,
        candidateModelIds,
        currentModelIndex,
        inputTokenCount: context.inputTokenCount,
        tokenThreshold,
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
      ...(smartRouting?.strategy === 'FALLBACK_CHAIN'
        ? { options: { attempts: 1 } }
        : {}),
    };
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

  // ── 私有辅助 ───────────────────────────────────────────────

  async executeSandboxNode(
    step: ExecutionStep,
    _input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = step.nodeData ?? {};
      const sandboxConfigSource = this.getSandboxConfigSource(nodeData);
      const config: SandboxConfig = {
        cpu:
          typeof sandboxConfigSource.cpu === 'number'
            ? sandboxConfigSource.cpu
            : 1,
        memory:
          typeof sandboxConfigSource.memory === 'number'
            ? sandboxConfigSource.memory
            : 512,
        disk:
          typeof sandboxConfigSource.disk === 'number'
            ? sandboxConfigSource.disk
            : 2,
        timeout:
          typeof sandboxConfigSource.timeout === 'number'
            ? sandboxConfigSource.timeout
            : 2,
        ...(typeof sandboxConfigSource.persistencePath === 'string'
          ? { persistencePath: sandboxConfigSource.persistencePath }
          : {}),
      };

      const session = await this.sandboxService.createSandboxSession(
        executionId,
        step.nodeId,
        config,
        tenantId,
      );

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

  private getSandboxConfigSource(
    nodeData: Record<string, unknown>,
  ): Record<string, unknown> {
    const nestedConfig = nodeData.config;

    if (this.isRecord(nestedConfig)) {
      return nestedConfig;
    }

    return nodeData;
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

  private extractErrorMessage(errorMessage: unknown): string | undefined {
    if (typeof errorMessage === 'string') {
      return errorMessage;
    }

    if (errorMessage && typeof errorMessage === 'object') {
      const message = (errorMessage as { message?: unknown }).message;
      return typeof message === 'string' ? message : undefined;
    }

    return undefined;
  }
}
