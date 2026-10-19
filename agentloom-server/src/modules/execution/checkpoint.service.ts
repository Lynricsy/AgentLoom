import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DagResolverService } from './dag-resolver.service';
import {
  ExecutionNotFoundException,
  ExecutionNotResumableException,
  ExecutionResumeNodeInsideContainerException,
  ExecutionResumeNodeNotFoundException,
} from './execution.exceptions';
import { COMPLETED_STEP_STATUSES } from './step-state-machine.service';
import { EventBridgeService } from './services/event-bridge.service';
import {
  filterTopLevelExecutionGraph,
  isTrackedExecutionStep,
  readCompoundParentNodeId,
} from './compound-runtime.util';

/** 可被恢复的步骤状态 */
const RESUMABLE_STEP_STATUSES = new Set(['failed', 'cancelled']);

@Injectable()
export class CheckpointService {
  private readonly logger = new Logger(CheckpointService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dagResolver: DagResolverService,
    private readonly eventBridge: EventBridgeService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 节点完成后保存检查点数据（含 DAG 状态快照）。
   *
   * 在节点完成回调中调用，记录当前 DAG 进度供断点恢复使用。
   */
  async saveCheckpoint(
    tenantId: string,
    executionId: string,
    stepId: string,
  ): Promise<void> {
    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    const completedStep = steps.find((s) => s.id === stepId);
    if (!completedStep) return;

    const dagState = {
      completedNodes: steps
        .filter((s) => COMPLETED_STEP_STATUSES.has(s.status))
        .map((s) => s.nodeId),
      pendingNodes: steps
        .filter(
          (s) =>
            s.status === 'pending' ||
            s.status === 'queued' ||
            s.status === 'running',
        )
        .map((s) => s.nodeId),
    };

    const existing = completedStep.checkpointData ?? {};

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        checkpointData: {
          ...existing,
          output: completedStep.result,
          completedAt:
            completedStep.completedAt?.toISOString() ??
            new Date().toISOString(),
          dagState,
        },
      })
      .where(eq(schema.executionSteps.id, stepId));

    this.logger.log(
      `Checkpoint saved: ${JSON.stringify({ executionId, stepId, completedNodes: dagState.completedNodes.length })}`,
    );
  }

  /**
   * 恢复失败的执行。
   *
   * - 无 fromNodeId：重置所有 failed/cancelled 步骤为 pending
   * - 有 fromNodeId：重置目标节点及其所有下游节点（含已完成的）为 pending，并同时重置
   *   其余 failed/cancelled 步骤。节点失败时调度器会把所有未开始的步骤（包括不在失败节点
   *   下游的兄弟分支）级联取消；只重置起点与下游会让这些兄弟永远停在 cancelled，执行既
   *   不能 completed 也不会 failed，永久停在 running（D-154）。
   * - fromNodeId 只能是顶层节点：恢复调度只调度顶层节点，容器内部节点随容器整体重跑，
   *   指定内部节点返回 422 并指明应从哪个容器节点恢复（D-155）。
   *
   * 步骤计数与执行实体同一口径：只统计顶层步骤（容器算一个步骤，内部节点不计），
   * completed 与 skipped 都算已完成（D-156）。
   *
   * @returns 更新后的执行记录
   */
  async resumeExecution(
    tenantId: string,
    executionId: string,
    fromNodeId?: string,
  ): Promise<schema.WorkflowExecution> {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    // 仅 failed 状态可恢复；paused 需先干预
    if (execution.status !== 'failed') {
      throw new ExecutionNotResumableException(executionId, execution.status);
    }

    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    const stepsToReset: schema.ExecutionStep[] = [];

    if (fromNodeId) {
      const snapshot = execution.definitionSnapshot as {
        nodes: schema.ReactFlowNode[];
        edges: schema.ReactFlowEdge[];
      };
      const fromNode = snapshot.nodes.find((node) => node.id === fromNodeId);
      if (!fromNode) {
        throw new ExecutionResumeNodeNotFoundException(executionId, fromNodeId);
      }
      if (readCompoundParentNodeId(fromNode)) {
        throw new ExecutionResumeNodeInsideContainerException(
          executionId,
          fromNodeId,
          this.findTopLevelAncestorId(fromNode, snapshot.nodes),
        );
      }
      // 与 resumeScheduling 一致，只在顶层图上计算下游
      const topLevelGraph = filterTopLevelExecutionGraph(snapshot);
      const plan = this.dagResolver.resolveDag(
        topLevelGraph.nodes,
        topLevelGraph.edges,
      );
      const downstreamIds = this.getDownstreamNodeIds(
        fromNodeId,
        plan.adjacencyMap,
      );
      downstreamIds.add(fromNodeId);

      for (const step of steps) {
        if (
          downstreamIds.has(step.nodeId) ||
          RESUMABLE_STEP_STATUSES.has(step.status)
        ) {
          stepsToReset.push(step);
        }
      }
    } else {
      // 重置所有 failed/cancelled 步骤
      for (const step of steps) {
        if (RESUMABLE_STEP_STATUSES.has(step.status)) {
          stepsToReset.push(step);
        }
      }
    }

    // 没有可重置的步骤时不能把执行改回 running：恢复任务找不到可调度步骤，
    // 执行会永久停在 running 并占用并发配额。
    if (stepsToReset.length === 0) {
      throw new ExecutionNotResumableException(
        executionId,
        execution.status,
        fromNodeId
          ? `执行 ${executionId} 中节点 ${fromNodeId} 及其下游没有可恢复的步骤`
          : `执行 ${executionId} 没有 failed/cancelled 状态的步骤可恢复`,
      );
    }

    // 批量重置步骤
    const now = new Date();
    const stepIds = stepsToReset.map((s) => s.id);

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: 'pending',
        attemptCount: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(inArray(schema.executionSteps.id, stepIds));

    // 对于 fromNodeId 场景，也需要清除已完成步骤的 result
    if (fromNodeId) {
      await this.tenantDb
        .update(schema.executionSteps)
        .set({ result: null })
        .where(inArray(schema.executionSteps.id, stepIds));
    }

    const resetStepIds = new Set(stepsToReset.map((step) => step.id));
    const trackedSteps = steps.filter((step) => isTrackedExecutionStep(step));
    const completedSteps = trackedSteps.filter(
      (step) =>
        COMPLETED_STEP_STATUSES.has(step.status) && !resetStepIds.has(step.id),
    ).length;

    // 恢复执行状态为 running
    const [updated] = await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'running',
        completedSteps,
        totalSteps: trackedSteps.length,
        updatedAt: now,
        failedAt: null,
      })
      .where(eq(schema.workflowExecutions.id, executionId))
      .returning();

    // 发布执行状态变更事件
    this.eventBridge.emitExecutionStatusChanged(tenantId, executionId, {
      executionId,
      status: 'running',
      completedSteps,
      totalSteps: trackedSteps.length,
    });

    this.logger.log(
      `Execution resumed: ${JSON.stringify({ executionId, fromNodeId, resetSteps: stepsToReset.length })}`,
    );

    return updated;
  }

  /** 沿 parentId 找到内部节点所属的顶层容器节点。 */
  private findTopLevelAncestorId(
    node: schema.ReactFlowNode,
    nodes: schema.ReactFlowNode[],
  ): string {
    const nodesById = new Map(nodes.map((item) => [item.id, item]));
    const visited = new Set<string>();
    let current = node;
    let parentId = readCompoundParentNodeId(current);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodesById.get(parentId);
      if (!parent) {
        return parentId;
      }
      current = parent;
      parentId = readCompoundParentNodeId(current);
    }
    return current.id;
  }

  /**
   * BFS 找出目标节点的所有下游节点。
   */
  private getDownstreamNodeIds(
    nodeId: string,
    adjacencyMap: Map<string, string[]>,
  ): Set<string> {
    const downstream = new Set<string>();
    const queue = [...(adjacencyMap.get(nodeId) ?? [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (downstream.has(current)) continue;
      downstream.add(current);
      const successors = adjacencyMap.get(current) ?? [];
      queue.push(...successors);
    }

    return downstream;
  }
}
