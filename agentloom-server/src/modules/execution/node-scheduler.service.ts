import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
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
  type AgentTaskJobData,
} from './execution.constants';
import { NodeInputResolutionException } from './execution.exceptions';

/** 调度决策 */
type SchedulingDecision = 'schedule' | 'skip' | 'wait';

@Injectable()
export class NodeSchedulerService {
  private readonly logger = new Logger(NodeSchedulerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dagResolver: DagResolverService,
    private readonly stepStateMachine: StepStateMachineService,
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

    // 顺序调度第一层（避免内联节点并发竞争）
    for (const nodeId of plan.layers[0]) {
      await this.scheduleNode(executionId, nodeId, tenantId, snapshot, steps);
    }
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

    const { snapshot, steps } = await this.loadExecutionContext(executionId);
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
  }

  /**
   * 调度单个节点执行。
   */
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

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      step.id,
      'queued',
    );

    // 按 nodeType 分发
    switch (step.nodeType) {
      case 'agent':
        await this.agentTaskQueue.add('agent-task', {
          executionId,
          stepId: step.id,
          tenantId,
        } satisfies AgentTaskJobData);
        break;

      case 'data_transform':
        await this.executeDataTransform(step, input, tenantId, executionId);
        break;

      case 'conditional':
        await this.executeConditional(step, input, tenantId, executionId);
        break;

      default:
        this.logger.warn(`未知节点类型 "${step.nodeType}"，按 agent 处理`);
        await this.agentTaskQueue.add('agent-task', {
          executionId,
          stepId: step.id,
          tenantId,
        } satisfies AgentTaskJobData);
    }
  }

  /**
   * 解析节点输入：收集所有入边对应源节点的 result。
   *
   * 返回 `{ [sourceNodeId]: result }`。
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

      input[edge.source] = sourceStep.result;
    }

    return input;
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
      const mapping = nodeData.mapping as
        | Record<string, string>
        | undefined;

      let result: Record<string, unknown>;

      if (mapping) {
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
        { errorMessage: message },
      );
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
      const conditionField = nodeData.conditionField as string;
      const expectedValue = nodeData.expectedValue;

      const flatInput = this.flattenInput(input);
      const actualValue = flatInput[conditionField];
      const branch = actualValue === expectedValue ? 'true' : 'false';

      const result = {
        branch,
        evaluatedField: conditionField,
        actualValue,
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
        { errorMessage: message },
      );
    }
  }

  // ── 私有辅助 ───────────────────────────────────────────────

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

    return { snapshot, steps };
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
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
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
    for (const value of Object.values(input)) {
      if (value && typeof value === 'object') {
        Object.assign(result, value);
      }
    }
    return result;
  }
}
