import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DagResolverService } from './dag-resolver.service';
import {
  ExecutionNotFoundException,
  ExecutionNotResumableException,
} from './execution.exceptions';
import { COMPLETED_STEP_STATUSES } from './step-state-machine.service';
import { EventBridgeService } from './services/event-bridge.service';

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

    const existing = (completedStep.checkpointData ?? {}) as Record<
      string,
      unknown
    >;

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
   * - 有 fromNodeId：重置目标节点及其所有下游节点为 pending
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
      // 目标节点 + 所有下游
      const snapshot = execution.definitionSnapshot as {
        nodes: schema.ReactFlowNode[];
        edges: schema.ReactFlowEdge[];
      };
      const plan = this.dagResolver.resolveDag(snapshot.nodes, snapshot.edges);
      const downstreamIds = this.getDownstreamNodeIds(
        fromNodeId,
        plan.adjacencyMap,
      );
      downstreamIds.add(fromNodeId);

      for (const step of steps) {
        if (downstreamIds.has(step.nodeId)) {
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

    // 批量重置步骤
    if (stepsToReset.length > 0) {
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
    }

    // 恢复执行状态为 running
    const now = new Date();
    const [updated] = await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'running',
        updatedAt: now,
        failedAt: null,
      })
      .where(eq(schema.workflowExecutions.id, executionId))
      .returning();

    // 发布执行状态变更事件
    this.eventBridge.emitExecutionStatusChanged(tenantId, executionId, {
      executionId,
      status: 'running',
      completedSteps: steps.filter((s) =>
        COMPLETED_STEP_STATUSES.has(s.status),
      ).length,
      totalSteps: steps.length,
    });

    this.logger.log(
      `Execution resumed: ${JSON.stringify({ executionId, fromNodeId, resetSteps: stepsToReset.length })}`,
    );

    return updated;
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
