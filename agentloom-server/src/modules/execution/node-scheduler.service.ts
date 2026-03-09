import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Script } from 'node:vm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
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
  type AgentTaskJobData,
  type InterventionResolution,
} from './execution.constants';
import {
  NodeInputResolutionException,
  InterventionNotAllowedException,
  AgentExecutionException,
} from './execution.exceptions';
import { SandboxService } from '../sandbox/sandbox.service';
import { CheckpointService } from './checkpoint.service';
import { EventBridgeService } from './services/event-bridge.service';

/** 调度决策 */
type SchedulingDecision = 'schedule' | 'skip' | 'wait';

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
  async startExecution(
    executionId: string,
    tenantId: string,
  ): Promise<void> {
    const { snapshot, steps } = await this.loadExecutionContext(executionId);
    const plan = this.dagResolver.resolveDag(snapshot.nodes, snapshot.edges);

    // 空图直接收尾
    if (plan.layers.length === 0) {
      await this.stepStateMachine.updateExecutionStatus(
        executionId,
        tenantId,
      );
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

    const { execution, snapshot, steps } = await this.loadExecutionContext(
      executionId,
    );

    if (execution.status === 'failed' || execution.status === 'cancelled') {
      return;
    }

    const plan = this.dagResolver.resolveDag(snapshot.nodes, snapshot.edges);

    const successors =
      plan.adjacencyMap.get(completedStep.nodeId) ?? [];

    // 条件节点需要分支处理
    if (
      completedStep.nodeType === 'conditional' &&
      completedStep.status === 'completed' &&
      completedStep.result
    ) {
      await this.handleConditionalBranching(
        executionId,
        completedStep.nodeId,
        (completedStep.result as Record<string, unknown>).branch as string,
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
          await this.skipAndCascade(
            executionId,
            successorId,
            steps,
            tenantId,
          );
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

    // 解析上游输入
    const input = this.resolveNodeInput(nodeId, snapshot.edges, steps);

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
        await this.agentTaskQueue.add('agent-task', {
          executionId,
          stepId: step.id,
          tenantId,
          input,
          nodeData: (step.nodeData ?? {}) as Record<string, unknown>,
          hasSandbox: this.hasSandboxUpstream(nodeId, snapshot.edges, steps),
        } satisfies AgentTaskJobData);
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

      default:
        this.logger.warn(`未知节点类型 "${step.nodeType}"，按 agent 处理`);
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'queued',
        );
        await this.agentTaskQueue.add('agent-task', {
          executionId,
          stepId: step.id,
          tenantId,
          input,
          nodeData: (step.nodeData ?? {}) as Record<string, unknown>,
        } satisfies AgentTaskJobData);
    }
  }

  /**
   * 解析节点输入：收集所有入边对应源节点的 result。
   * 被跳过的源节点不提供输入，根节点返回空对象。
   */
  resolveNodeInput(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
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

      const sourceHandle = edge.sourceHandle ?? undefined;
      const targetHandle = edge.targetHandle ?? undefined;

      if (targetHandle) {
        this.setValueAtPath(
          input,
          targetHandle,
          sourceHandle
            ? this.resolveJsonPath(
                sourceStep.result as Record<string, unknown>,
                sourceHandle,
              )
            : sourceStep.result,
        );
        continue;
      }

      if (sourceHandle) {
        this.setValueAtPath(
          input,
          sourceHandle,
          this.resolveJsonPath(
            sourceStep.result as Record<string, unknown>,
            sourceHandle,
          ),
        );
        continue;
      }

      input[edge.source] = sourceStep.result;
    }

    return input;
  }

  /**
   * 恢复调度：找出所有前驱已完成的 pending 节点并调度。
   *
   * 在 CheckpointService.resumeExecution 重置步骤后调用。
   */
  async resumeScheduling(
    executionId: string,
    tenantId: string,
  ): Promise<void> {
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

    const failureMessage =
      this.extractErrorMessage(failedStep.errorMessage) ?? '节点执行失败';

    await this.stepStateMachine.markExecutionFailed(
      executionId,
      tenantId,
      { message: failureMessage },
    );
    await this.cleanupSandboxIfTerminal(executionId, tenantId);
  }  async resolveIntervention(
    executionId: string,
    stepId: string,
    tenantId: string,
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

    const checkpoint = step.checkpointData as Record<string, unknown> | null;
    const sessionId = checkpoint?.sessionId as string | undefined;

    if (!sessionId) {
      throw new AgentExecutionException('步骤检查点数据缺少 sessionId');
    }

    this.eventBridge.emitInterventionResolved(tenantId, executionId, {
      stepId,
      nodeId: step.nodeId,
      action: resolution.action,
      ...(resolution.feedback ? { feedback: resolution.feedback } : {}),
    });
    await this.removeInterventionTimeout(stepId);

    await this.agentTaskQueue.add('agent-task', {
      executionId,
      stepId,
      tenantId,
      input: ((step.input ?? {}) as Record<string, unknown>) ?? {},
      nodeData: ((step.nodeData ?? {}) as Record<string, unknown>) ?? {},
      resumeSessionId: sessionId,
      intervention: resolution,
    } satisfies AgentTaskJobData);

    this.logger.log(`干预恢复任务已排队: ${JSON.stringify({ executionId, stepId })}`);
  }

  async enqueueInterventionTimeout(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<void> {
    await this.agentTaskQueue.add(
      'intervention-timeout',
      { executionId, stepId, tenantId } satisfies AgentTaskJobData,
      {
        delay: INTERVENTION_TIMEOUT_MS,
        jobId: `intervention-timeout:${stepId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log(`Intervention timeout enqueued (24h): ${JSON.stringify({ executionId, stepId })}`);
  }

  private async removeInterventionTimeout(stepId: string): Promise<void> {
    const jobId = `intervention-timeout:${stepId}`;
    const job = await this.agentTaskQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Intervention timeout removed: ${jobId}`);
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
    await this.stepStateMachine.updateStepStatus(
      tenantId,
      step.id,
      'running',
    );

    try {
      const nodeData = (step.nodeData ?? {}) as Record<string, unknown>;
      const expression =
        typeof nodeData.expression === 'string'
          ? nodeData.expression.trim()
          : '';
      const mapping = nodeData.mapping as
        | Record<string, string>
        | undefined;

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

      const message =
        error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        { errorMessage: { message } },
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
    await this.stepStateMachine.updateStepStatus(
      tenantId,
      step.id,
      'running',
    );

    try {
      const nodeData = (step.nodeData ?? {}) as Record<string, unknown>;
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
      const branch = Boolean(evaluation) ? 'true' : 'false';

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

      const message =
        error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        { errorMessage: { message } },
      );
      await this.onNodeFailed(executionId, step.id, tenantId);
    }
  }

  // ── 私有辅助 ───────────────────────────────────────────────

  async executeSandboxNode(
    step: ExecutionStep,
    _input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(
      tenantId,
      step.id,
      'running',
    );

    try {
      const nodeData = (step.nodeData ?? {}) as Record<string, unknown>;
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

      const message =
        error instanceof Error ? error.message : String(error);
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        { errorMessage: { message } },
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
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
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
        await this.skipAndCascade(
          executionId,
          edge.target,
          steps,
          tenantId,
        );
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

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      step.id,
      'skipped',
    );
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
  private resolveJsonPath(
    obj: Record<string, unknown>,
    path: string,
  ): unknown {
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
