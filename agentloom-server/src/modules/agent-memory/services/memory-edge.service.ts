import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
} from '../../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { MemoryGateway } from '../memory.gateway';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  getTenantId,
  memoryEdges,
  type MemoryEdge,
  memoryNodes,
  type MemoryNode,
} from '../../../database/schema';

export interface CreateMemoryEdgeInput {
  parentNodeId: string;
  childNodeId: string;
  name?: string | null;
  priority?: number;
  disclosure?: number;
}

export interface DeleteMemoryEdgeResult {
  id: string;
  deleted: true;
}

const MAX_CYCLE_DEPTH = 10;

@Injectable()
export class MemoryEdgeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly gateway: MemoryGateway,
  ) {}

  /** 有活跃租户事务时延迟到提交之后广播，避免回滚后客户端已收到「已创建」。 */
  private broadcastAfterCommit(emit: () => void): void {
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => emit());
      return;
    }

    emit();
  }

  async createEdge(
    instanceId: string,
    data: CreateMemoryEdgeInput,
  ): Promise<MemoryEdge> {
    const tenantDb = getTenantDb(this.db);

    await this.ensureNodesBelongToInstance(
      instanceId,
      data.parentNodeId,
      data.childNodeId,
    );

    const wouldCreateCycle = await this.wouldCreateCycle(
      data.parentNodeId,
      data.childNodeId,
    );

    if (wouldCreateCycle) {
      throw new ConflictException(
        'Cycle detected: creating this edge would form a cycle',
      );
    }

    try {
      const [edge] = await tenantDb
        .insert(memoryEdges)
        .values({
          instanceId,
          tenantId: getTenantId,
          parentNodeId: data.parentNodeId,
          childNodeId: data.childNodeId,
          name: data.name ?? null,
          priority: data.priority ?? 0,
          disclosure: data.disclosure ?? 0,
        })
        .returning();

      this.broadcastAfterCommit(() =>
        this.gateway.emitEdgeCreated(edge.tenantId, edge.instanceId, {
          edgeId: edge.id,
          parentNodeId: edge.parentNodeId,
          childNodeId: edge.childNodeId,
          name: edge.name,
          priority: edge.priority,
          disclosure: edge.disclosure,
        }),
      );

      return edge;
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Memory edge already exists between these nodes',
        );
      }

      throw error;
    }
  }

  async deleteEdge(edgeId: string): Promise<DeleteMemoryEdgeResult> {
    const tenantDb = getTenantDb(this.db);

    // 删除后行已不存在，租户/实例归属只能从删除前的快照取。
    const existing = await this.findEdgeOrThrow(edgeId);

    const [deletedEdge] = await tenantDb
      .delete(memoryEdges)
      .where(eq(memoryEdges.id, edgeId))
      .returning({ id: memoryEdges.id });

    if (!deletedEdge) {
      throw new NotFoundException(`Memory edge ${edgeId} not found`);
    }

    this.broadcastAfterCommit(() =>
      this.gateway.emitEdgeDeleted(existing.tenantId, existing.instanceId, {
        edgeId: deletedEdge.id,
        parentNodeId: existing.parentNodeId,
        childNodeId: existing.childNodeId,
      }),
    );

    return {
      id: deletedEdge.id,
      deleted: true,
    };
  }

  async getChildEdges(nodeId: string): Promise<MemoryEdge[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryEdges)
      .where(eq(memoryEdges.parentNodeId, nodeId))
      .orderBy(desc(memoryEdges.priority));
  }

  async getParentEdges(nodeId: string): Promise<MemoryEdge[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryEdges)
      .where(eq(memoryEdges.childNodeId, nodeId))
      .orderBy(desc(memoryEdges.priority));
  }

  async updateEdgePriority(
    edgeId: string,
    priority: number,
  ): Promise<MemoryEdge> {
    const tenantDb = getTenantDb(this.db);

    await this.findEdgeOrThrow(edgeId);

    const [edge] = await tenantDb
      .update(memoryEdges)
      .set({ priority })
      .where(eq(memoryEdges.id, edgeId))
      .returning();

    if (!edge) {
      throw new NotFoundException(`Memory edge ${edgeId} not found`);
    }

    return edge;
  }

  async updateEdgeDisclosure(
    edgeId: string,
    disclosure: number,
  ): Promise<MemoryEdge> {
    const tenantDb = getTenantDb(this.db);

    await this.findEdgeOrThrow(edgeId);

    const [edge] = await tenantDb
      .update(memoryEdges)
      .set({ disclosure })
      .where(eq(memoryEdges.id, edgeId))
      .returning();

    if (!edge) {
      throw new NotFoundException(`Memory edge ${edgeId} not found`);
    }

    return edge;
  }

  private async ensureNodesBelongToInstance(
    instanceId: string,
    parentNodeId: string,
    childNodeId: string,
  ): Promise<void> {
    const [parentNode, childNode] = await Promise.all([
      this.findNodeOrThrow(parentNodeId),
      this.findNodeOrThrow(childNodeId),
    ]);

    if (
      parentNode.instanceId !== instanceId ||
      childNode.instanceId !== instanceId ||
      parentNode.instanceId !== childNode.instanceId
    ) {
      throw new BadRequestException(
        'Cannot create edge across different memory instances',
      );
    }
  }

  private async wouldCreateCycle(
    parentNodeId: string,
    childNodeId: string,
  ): Promise<boolean> {
    const tenantDb = getTenantDb(this.db);

    if (parentNodeId === childNodeId) {
      return true;
    }

    const visited = new Set<string>([childNodeId]);
    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId: childNodeId, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current || current.depth >= MAX_CYCLE_DEPTH) {
        continue;
      }

      const edges = await tenantDb
        .select({ childNodeId: memoryEdges.childNodeId })
        .from(memoryEdges)
        .where(eq(memoryEdges.parentNodeId, current.nodeId));

      for (const edge of edges) {
        if (edge.childNodeId === parentNodeId) {
          return true;
        }

        if (!visited.has(edge.childNodeId)) {
          visited.add(edge.childNodeId);
          queue.push({ nodeId: edge.childNodeId, depth: current.depth + 1 });
        }
      }
    }

    return false;
  }

  private async findNodeOrThrow(nodeId: string): Promise<MemoryNode> {
    const tenantDb = getTenantDb(this.db);
    const [node] = await tenantDb
      .select()
      .from(memoryNodes)
      .where(eq(memoryNodes.id, nodeId))
      .limit(1);

    if (!node) {
      throw new NotFoundException(`Memory node ${nodeId} not found`);
    }

    return node;
  }

  private async findEdgeOrThrow(edgeId: string): Promise<MemoryEdge> {
    const tenantDb = getTenantDb(this.db);
    const [edge] = await tenantDb
      .select()
      .from(memoryEdges)
      .where(eq(memoryEdges.id, edgeId))
      .limit(1);

    if (!edge) {
      throw new NotFoundException(`Memory edge ${edgeId} not found`);
    }

    return edge;
  }

  private isUniqueViolation(error: unknown): boolean {
    const errorCode =
      error instanceof Error && 'code' in error
        ? (error as Record<string, unknown>).code
        : error instanceof Error &&
            'cause' in error &&
            typeof error.cause === 'object' &&
            error.cause !== null &&
            'code' in error.cause
          ? (error.cause as Record<string, unknown>).code
          : undefined;

    return error instanceof Error && errorCode === '23505';
  }
}
