import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  agentMemoryInstances,
  getTenantId,
  memoryNodes,
  type MemoryNode,
  type MemoryNodeMetadata,
} from '../../../database/schema';

export interface CreateMemoryNodeInput {
  contentType?: string;
  metadata?: MemoryNodeMetadata;
  disclosureLevel?: number;
}

export interface UpdateMemoryNodeMetadataInput {
  metadata: MemoryNodeMetadata;
  contentType?: string;
  disclosureLevel?: number;
}

export interface ListMemoryNodesOptions {
  page?: number;
  limit?: number;
  contentType?: string;
}

export interface DeleteMemoryNodeResult {
  id: string;
  deleted: true;
}

@Injectable()
export class MemoryNodeService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createNode(
    instanceId: string,
    data: CreateMemoryNodeInput,
  ): Promise<MemoryNode> {
    const tenantDb = getTenantDb(this.db);

    await this.ensureInstanceExists(instanceId);

    const [node] = await tenantDb
      .insert(memoryNodes)
      .values({
        instanceId,
        tenantId: getTenantId,
        contentType: data.contentType ?? 'text',
        metadata: data.metadata,
        disclosureLevel: data.disclosureLevel ?? 0,
      })
      .returning();

    return node;
  }

  async getNode(nodeId: string): Promise<MemoryNode> {
    return this.findNodeOrThrow(nodeId);
  }

  async getNodeByUuid(uuid: string): Promise<MemoryNode> {
    return this.findNodeOrThrow(uuid);
  }

  async updateNodeMetadata(
    nodeId: string,
    data: UpdateMemoryNodeMetadataInput,
  ): Promise<MemoryNode> {
    const tenantDb = getTenantDb(this.db);

    await this.findNodeOrThrow(nodeId);

    const [node] = await tenantDb
      .update(memoryNodes)
      .set({
        metadata: data.metadata,
        contentType: data.contentType,
        disclosureLevel: data.disclosureLevel,
      })
      .where(eq(memoryNodes.id, nodeId))
      .returning();

    if (!node) {
      throw new NotFoundException(`Memory node ${nodeId} not found`);
    }

    return node;
  }

  async deleteNode(nodeId: string): Promise<DeleteMemoryNodeResult> {
    const tenantDb = getTenantDb(this.db);

    await this.findNodeOrThrow(nodeId);

    const [deletedNode] = await tenantDb
      .delete(memoryNodes)
      .where(eq(memoryNodes.id, nodeId))
      .returning({ id: memoryNodes.id });

    if (!deletedNode) {
      throw new NotFoundException(`Memory node ${nodeId} not found`);
    }

    return {
      id: deletedNode.id,
      deleted: true,
    };
  }

  async listNodes(
    instanceId: string,
    options: ListMemoryNodesOptions = {},
  ): Promise<{ data: MemoryNode[]; total: number }> {
    const tenantDb = getTenantDb(this.db);

    await this.ensureInstanceExists(instanceId);

    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.max(options.limit ?? 20, 1);
    const offset = (page - 1) * limit;
    const predicate = options.contentType
      ? and(
          eq(memoryNodes.instanceId, instanceId),
          eq(memoryNodes.contentType, options.contentType),
        )
      : eq(memoryNodes.instanceId, instanceId);

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(memoryNodes)
        .where(predicate)
        .orderBy(desc(memoryNodes.createdAt))
        .limit(limit)
        .offset(offset),
      tenantDb
        .select({ total: count() })
        .from(memoryNodes)
        .where(predicate),
    ]);

    return {
      data,
      total: countRow?.total ?? 0,
    };
  }

  private async ensureInstanceExists(instanceId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [instance] = await tenantDb
      .select()
      .from(agentMemoryInstances)
      .where(eq(agentMemoryInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      throw new NotFoundException(`Memory instance ${instanceId} not found`);
    }
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
}
