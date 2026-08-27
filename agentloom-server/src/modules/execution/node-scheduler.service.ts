import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from '../../common/exceptions/tool-call.exceptions';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import * as schema from '../../database/schema';
import type { ReactFlowEdge } from '../../database/schema';
import type { ExecutionStep } from '../../database/schema';
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
  type ToolPermissionResolution,
} from './execution.constants';
import type {
  InterventionCheckpointRecord,
  InterventionRequiredPayload,
} from './types/execution-event.types';
import {
  NodeInputResolutionException,
  InterventionNotAllowedException,
  AgentExecutionException,
  InterventionPermissionDeniedException,
  InvalidStepTransitionException,
  NodeTypeMismatchException,
  isPortTypeCompatible,
} from './execution.exceptions';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import { SandboxService } from '../sandbox/sandbox.service';
import { CheckpointService } from './checkpoint.service';
import { EventBridgeService } from './services/event-bridge.service';
import { InterventionPolicyService } from '../intervention-policy/intervention-policy.service';
import {
  filterTopLevelExecutionGraph,
  isCompoundInternalStep,
} from './compound-runtime.util';
import {
  isRecord,
  readEdgeHandle,
  setValueAtPath,
} from './node-value.util';
import {
  normalizeConditionBranch,
  normalizeConditionSourceHandle,
} from './condition-evaluator.util';
import { resolveSourceHandleValue } from './node-output-port.util';
import {
  getExecutionSandboxBinding,
  getSandboxSourceStep,
  getUpstreamMemorySessionIds,
} from './workflow-runtime-input.util';
import { NodeDispatcherService } from './node-dispatcher.service';
import { CompoundExecutionService, type CompoundExecutionRuntime } from './compound-execution.service';
import type { NodeExecutionContext } from './node-executors/node-executor.interface';

/** 调度决策 */
type SchedulingDecision = 'schedule' | 'skip' | 'wait';

interface ScheduleNodeOptions {
  readonly skipLatestState?: boolean;
}

interface InterventionTimeoutOptions {
  readonly escalated?: boolean;
  readonly escalationCount?: number;
}

interface PauseForInterventionParams {
  readonly executionId: string;
  readonly tenantId: string;
  readonly step: ExecutionStep;
  readonly sessionId: string;
  readonly partialContent: string;
  readonly toolCalls?: readonly unknown[];
  readonly segments?: readonly unknown[];
  readonly decision?: Record<string, unknown>;
  readonly executionType?: 'workflow' | 'conversation';
}

// BullMQ 5 的 validateOptions 拒绝含 `:` 的 custom jobId。
// 之前用冒号形态会让 enqueueInterventionTimeout 直接抛错：暂停已写入
// waiting_intervention 后异常冒泡到节点执行器的 catch，catch 又尝试
// waiting_intervention → failed（非法转换），最终把整个 execution 打成 failed。
function buildInterventionTimeoutJobId(stepId: string): string {
  return `intervention-timeout-${stepId}`;
}

function buildEscalatedInterventionTimeoutJobId(
  stepId: string,
  escalationCount: number,
): string {
  return `intervention-timeout-${stepId}-escalated-${escalationCount}`;
}


@Injectable()
export class NodeSchedulerService implements CompoundExecutionRuntime {
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
    private readonly nodeDispatcher: NodeDispatcherService,
    private readonly compoundExecution: CompoundExecutionService,
    @InjectQueue(AGENT_TASK_QUEUE)
    private readonly agentTaskQueue: Queue,
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
      await this.compoundExecution.onCompoundInternalNodeCompleted(
        executionId,
        completedStep,
        steps,
        tenantId,
        this,
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
      if (error instanceof InvalidStepTransitionException) throw error;
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

    const sandboxBinding = getExecutionSandboxBinding(
      nodeId,
      executionId,
      resolvedSnapshot.edges,
      resolvedSteps,
      input,
    );
    const memorySessionIds = getUpstreamMemorySessionIds(
      nodeId,
      resolvedSnapshot.edges,
      resolvedSteps,
    );

    const dispatched = await this.nodeDispatcher.dispatch({
      executionId,
      tenantId,
      step,
      input,
      snapshot: resolvedSnapshot,
      steps: resolvedSteps,
      ...(sandboxBinding ? { sandboxBinding } : {}),
      memorySessionIds,
      runtime: this,
    });

    if (!dispatched) {
      await this.failUnschedulableNode(
        tenantId,
        executionId,
        step,
        `不支持的节点类型 "${step.nodeType}"`,
      );
    }

  }

  private async executeNodeType(
    nodeType: string,
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    edges: ReactFlowEdge[] = [],
    steps: ExecutionStep[] = [],
  ): Promise<void> {
    await this.nodeDispatcher.dispatchAs(nodeType, {
      executionId, tenantId, step, input, steps,
      snapshot: { nodes: [], edges }, memorySessionIds: [], runtime: this,
    });
  }

  async executeSubAgentNode(context: NodeExecutionContext): Promise<void> {
    await this.nodeDispatcher.dispatchAs('sub-agent', context);
  }

  /**
   * 把无法进入任何执行器的节点显式标记为失败，并推进调度。
   *
   * 覆盖两种情况：节点类型不受支持，以及 agent 节点没有绑定 Agent Definition。
   * 这两种都必须显式失败——静默降级到别的执行路径只会把配置缺失伪装成正常运行。
   */
  async failUnschedulableNode(
    tenantId: string,
    executionId: string,
    step: ExecutionStep,
    message: string,
  ): Promise<void> {
    this.logger.warn(`节点 ${step.nodeId} 无法调度：${message}`);
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'failed', {
      errorMessage: { message, nodeId: step.nodeId },
    });
    await this.onNodeFailed(executionId, step.id, tenantId);
  }

  async executePlugin( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('plugin', step, input, tenantId, executionId);
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

      const sourceHandle = readEdgeHandle(edge, 'source');
      const targetHandle = readEdgeHandle(edge, 'target');

      if (targetHandle) {
        setValueAtPath(
          input,
          targetHandle,
          sourceHandle
            ? resolveSourceHandleValue(sourceStep, sourceHandle)
            : sourceStep.result,
        );
        continue;
      }

      if (sourceHandle) {
        setValueAtPath(
          input,
          sourceHandle,
          resolveSourceHandleValue(sourceStep, sourceHandle),
        );
        continue;
      }

      input[edge.source] = sourceStep.result;
    }

    return input;
  }

  /**
   * 读取节点某个方向的端口 dataType。
   *
   * 两级查找：normalize 阶段已把内置节点的静态端口写入 data.inputPorts/outputPorts
   * （字段名 id），这是绝大多数边的唯一来源；portMappingMetadata 只有动态端口
   * （MCP 工具、可复用块）才会写，字段名是 name。两处都查不到时返回 undefined，
   * 调用方保持 no-op —— 动态端口在快照里可能确实没有类型信息，不能误报不兼容。
   */
  private resolvePortDataType(
    node: schema.ReactFlowNode,
    handle: string,
    direction: 'source' | 'target',
  ): string | undefined {
    const staticPorts = (
      direction === 'source'
        ? node.data?.outputPorts
        : node.data?.inputPorts
    ) as Array<{ id?: string; name?: string; dataType?: string }> | undefined;
    const staticPort = Array.isArray(staticPorts)
      ? staticPorts.find((p) => p?.id === handle || p?.name === handle)
      : undefined;
    if (staticPort?.dataType) return staticPort.dataType;

    const metadata = node.data?.portMappingMetadata as
      | {
          outputs?: Array<{ name: string; dataType: string }>;
          inputs?: Array<{ name: string; dataType: string }>;
        }
      | undefined;
    const dynamicPorts =
      direction === 'source' ? metadata?.outputs : metadata?.inputs;
    return dynamicPorts?.find((p) => p.name === handle)?.dataType;
  }

  private checkEdgePortTypeCompatibility(
    edge: ReactFlowEdge,
    nodes: schema.ReactFlowNode[],
  ): void {
    const sourceHandle = readEdgeHandle(edge, 'source');
    const targetHandle = readEdgeHandle(edge, 'target');
    if (!sourceHandle || !targetHandle) return;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) return;

    const sourceType = this.resolvePortDataType(
      sourceNode,
      sourceHandle,
      'source',
    );
    const targetType = this.resolvePortDataType(
      targetNode,
      targetHandle,
      'target',
    );
    if (!sourceType || !targetType) return;

    if (!isPortTypeCompatible(sourceType, targetType)) {
      throw new NodeTypeMismatchException({
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourcePortId: sourceHandle,
        targetPortId: targetHandle,
        sourceType,
        targetType,
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
      await this.compoundExecution.onCompoundInternalNodeFailed(
        executionId,
        failedStep,
        steps,
        tenantId,
        this,
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

  async pauseForIntervention(
    params: PauseForInterventionParams,
  ): Promise<void> {
    const requestedAt = new Date().toISOString();
    const nodeName = this.resolveNodeName(params.step, {});

    // 状态与 execution 的 paused 汇总必须处于同一租户事务，避免客户端看到半完成的干预状态。
    await runInTenantTransaction(this.db, params.tenantId, async () => {
      await this.stepStateMachine.updateStepStatus(
        params.tenantId,
        params.step.id,
        'waiting_intervention',
        {
          checkpointData: {
            sessionId: params.sessionId,
            partialContent: params.partialContent,
            stopReason: 'intervention_required',
            interventionRequestedAt: requestedAt,
            interventionNodeName: nodeName,
            ...(params.toolCalls && params.toolCalls.length > 0
              ? { toolCalls: params.toolCalls }
              : {}),
            ...(params.segments && params.segments.length > 0
              ? { segments: params.segments }
              : {}),
            ...(params.decision ? { decision: params.decision } : {}),
          },
          result: {
            content: params.partialContent,
            stopReason: 'intervention_required',
            ...(params.decision ? { decision: params.decision } : {}),
          },
        },
      );
      await this.stepStateMachine.updateExecutionStatus(
        params.executionId,
        params.tenantId,
      );
    });

    // 分界线：事务已提交，步骤此刻已经是 waiting_intervention。
    // 之后的副作用失败只做降级，绝不向上抛：一旦抛出，调用方的 catch 会把已处于
    // waiting_intervention 的步骤再写成 failed（非法转换），原始错误被掩盖成
    // 「步骤状态转换非法」；且 ExecutionWorker.onFailed 对任何 job 失败都无条件
    // markFailed，execution 会被打死，用户反而彻底无法处置这次干预。
    // 注意：事务本身失败必须继续向上抛——那时步骤仍是 running，调用方写 failed 合法。
    //
    // 广播与超时入队是两个**互相独立**的副作用，必须各自 try/catch：
    // 若合用一个 try，广播 listener 抛错会连带跳过入队，同时丢掉实时通知与自动超时兜底，
    // 留下最差的「孤儿暂停」。分开之后，任一侧失败都只损失自己那一份能力。
    try {
      this.eventBridge.emitInterventionRequired(
        params.tenantId,
        params.executionId,
        {
          stepId: params.step.id,
          nodeId: params.step.nodeId,
          nodeName,
          executionType: params.executionType ?? 'workflow',
          ...(params.decision
            ? {
                decision:
                  params.decision as InterventionRequiredPayload['decision'],
              }
            : {}),
          ...(params.partialContent
            ? { partialContent: params.partialContent }
            : {}),
          requestedAt,
        },
      );
    } catch (error) {
      this.logger.error(
        `步骤 ${params.step.id} 已暂停并落库为 waiting_intervention，但 intervention_required 广播失败：` +
          `客户端需靠轮询/重新拉取才能看到该干预。原因：${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }

    try {
      await this.enqueueInterventionTimeout(
        params.executionId,
        params.step.id,
        params.tenantId,
      );
    } catch (error) {
      this.logger.error(
        `步骤 ${params.step.id} 已暂停并落库为 waiting_intervention，但超时兜底任务入队失败：` +
          `自动超时处置缺失，该干预只能人工处置。原因：${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
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
  async executeDataTransform( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('data_transform', step, input, tenantId, executionId);
  }

  async executeInputPreprocessor( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('input-preprocessor', step, input, tenantId, executionId);
  }

  async executeHttpToolNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('http-tool', step, input, tenantId, executionId);
  }

  async executeCodeToolNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('code-tool', step, input, tenantId, executionId);
  }

  async executeSkillNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('skill', step, input, tenantId, executionId);
  }

  /** 内联处理 MCP 工具节点：同步完成，输出工具描述符供下游 agent 节点消费。 */
  async executeMcpToolNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('mcp-tool', step, input, tenantId, executionId);
  }

  /**
   * 内联执行条件节点。
   */
  async executeConditional( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('condition', step, input, tenantId, executionId);
  }

  async executeLoopNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.compoundExecution.executeLoopNode(step, input, tenantId, executionId, this);
  }

  async executeIterationNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.compoundExecution.executeIterationNode(step, input, tenantId, executionId, this);
  }

  async executeLoopStartNode(step: ExecutionStep, tenantId: string, executionId: string): Promise<void> {
    await this.compoundExecution.executeLoopStartNode(step, tenantId, executionId, this);
  }

  async executeIterationStartNode(step: ExecutionStep, tenantId: string, executionId: string): Promise<void> {
    await this.compoundExecution.executeIterationStartNode(step, tenantId, executionId, this);
  }

  async executeLoopStateNode(step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string): Promise<void> {
    await this.compoundExecution.executeLoopStateNode(step, input, tenantId, executionId, this);
  }

  async executeResultNode(step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string): Promise<void> {
    await this.compoundExecution.executeResultNode(step, input, tenantId, executionId, this);
  }

  async executeBreakNode(step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string): Promise<void> {
    await this.compoundExecution.executeBreakNode(step, input, tenantId, executionId, this);
  }

  async executeContinueNode(step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string): Promise<void> {
    await this.compoundExecution.executeContinueNode(step, input, tenantId, executionId, this);
  }

  async executeMerge( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('merge', step, input, tenantId, executionId);
  }



  async executeSmartRouting( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('smart-routing', step, input, tenantId, executionId);
  }



  // ── 私有辅助 ───────────────────────────────────────────────

  async executeWorkflowAgentNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, edges: ReactFlowEdge[], steps: ExecutionStep[], ): Promise<void> {
    await this.executeNodeType('agent', step, input, tenantId, executionId, edges, steps);
  }

  async executeSandboxNode( step: ExecutionStep, _input: Record<string, unknown>, tenantId: string, executionId: string, edges: ReactFlowEdge[], steps: ExecutionStep[], ): Promise<void> {
    await this.executeNodeType('sandbox', step, _input, tenantId, executionId, edges, steps);
  }

  async executeWorkspaceNode( step: ExecutionStep, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('workspace', step, {}, tenantId, executionId);
  }

  async executeMemoryNode( step: ExecutionStep, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('memory', step, {}, tenantId, executionId);
  }

  async executeTriggerNode( step: ExecutionStep, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('manual-trigger', step, {}, tenantId, executionId);
  }

  async executeLlmModelNode( step: ExecutionStep, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('llm-model', step, {}, tenantId, executionId);
  }

  async executeKnowledgeNode( step: ExecutionStep, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('knowledge-base', step, {}, tenantId, executionId);
  }

  async executeTextNode( step: ExecutionStep, tenantId: string, executionId: string, ): Promise<void> {
    await this.executeNodeType('text', step, {}, tenantId, executionId);
  }

  async executeOutputNode( step: ExecutionStep, input: Record<string, unknown>, tenantId: string, executionId: string, ): Promise<void> {
    const nodeType = step.nodeType === 'text-output' ? 'text-output' : 'json-output';
    await this.executeNodeType(nodeType, step, input, tenantId, executionId);
  }

  private async cleanupConnectedSandboxIfIdle(
    completedStep: ExecutionStep,
    executionId: string,
    tenantId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    steps: ExecutionStep[],
  ): Promise<void> {
    const sandboxSource = getSandboxSourceStep(
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
  async loadExecutionContext(executionId: string) {
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
    const normalizedBranch = normalizeConditionBranch(branch);
    const outgoingEdges = snapshot.edges.filter(
      (e) => e.source === conditionalNodeId,
    );

    for (const edge of outgoingEdges) {
      const normalizedHandle = normalizeConditionSourceHandle(
        readEdgeHandle(edge, 'source'),
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
  getSchedulingDecision(
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
        ({ edge }) => readEdgeHandle(edge, 'target') === requiredTargetHandle,
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
    if (!targetStep || !isRecord(targetStep.nodeData)) {
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
        if (!isRecord(port) || port.required !== true) {
          return [];
        }

        return typeof port.id === 'string' && port.id.length > 0
          ? [port.id]
          : [];
      }),
    );
  }
}
