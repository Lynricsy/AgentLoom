import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  getTenantId,
  memoryNodes,
  memoryVersions,
  type MemoryVersion,
} from '../../../database/schema';

export interface PatchMemoryVersionInput {
  oldString: string;
  newString: string;
}

export type MemoryVersionReviewDecision = 'approved' | 'rejected';

type VersionQueryClient = Pick<DrizzleDB, 'select' | 'insert' | 'update'>;

@Injectable()
export class MemoryVersionService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createVersion(
    nodeId: string,
    content: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);

    await this.findNodeOrThrow(nodeId);

    const existingVersion = await this.findLatestVersion(tenantDb, nodeId);

    if (existingVersion) {
      throw new ConflictException(
        `Memory version chain already exists for node ${nodeId}`,
      );
    }

    const [createdVersion] = await tenantDb
      .insert(memoryVersions)
      .values({
        nodeId,
        tenantId: getTenantId,
        content,
        version: 1,
        reviewStatus: 'pending',
        createdBy: createdBy ?? null,
      })
      .returning();

    return createdVersion;
  }

  async patchVersion(
    nodeId: string,
    patch: PatchMemoryVersionInput,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb.transaction(async (tx) => {
      const latestVersion = await this.findLatestVersionOrThrow(tx, nodeId);

      if (!latestVersion.content.includes(patch.oldString)) {
        throw new ConflictException(
          'Patch failed: old_string not found in current content',
        );
      }

      const newContent = latestVersion.content.replace(
        patch.oldString,
        patch.newString,
      );

      const [createdVersion] = await tx
        .insert(memoryVersions)
        .values({
          nodeId,
          tenantId: getTenantId,
          content: newContent,
          version: latestVersion.version + 1,
          reviewStatus: 'pending',
          patchSummary: 'patch: oldString -> newString',
          createdBy: createdBy ?? null,
        })
        .returning();

      await this.deprecateLatestVersionOrThrow(
        tx,
        latestVersion,
        createdVersion.id,
      );

      return createdVersion;
    });
  }

  async appendVersion(
    nodeId: string,
    appendContent: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb.transaction(async (tx) => {
      const latestVersion = await this.findLatestVersionOrThrow(tx, nodeId);
      const [createdVersion] = await tx
        .insert(memoryVersions)
        .values({
          nodeId,
          tenantId: getTenantId,
          content: `${latestVersion.content}\n${appendContent}`,
          version: latestVersion.version + 1,
          reviewStatus: 'pending',
          patchSummary: 'append: add content to tail',
          createdBy: createdBy ?? null,
        })
        .returning();

      await this.deprecateLatestVersionOrThrow(
        tx,
        latestVersion,
        createdVersion.id,
      );

      return createdVersion;
    });
  }

  async getLatestVersion(nodeId: string): Promise<MemoryVersion | null> {
    const tenantDb = getTenantDb(this.db);

    return this.findLatestVersion(tenantDb, nodeId);
  }

  async getVersionHistory(nodeId: string): Promise<MemoryVersion[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryVersions)
      .where(eq(memoryVersions.nodeId, nodeId))
      .orderBy(desc(memoryVersions.version));
  }

  async rollbackToVersion(
    nodeId: string,
    targetVersionId: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb.transaction(async (tx) => {
      const [targetVersion] = await tx
        .select()
        .from(memoryVersions)
        .where(
          and(
            eq(memoryVersions.id, targetVersionId),
            eq(memoryVersions.nodeId, nodeId),
          ),
        )
        .limit(1);

      if (!targetVersion) {
        throw new NotFoundException(
          `Memory version ${targetVersionId} not found for node ${nodeId}`,
        );
      }

      const latestVersion = await this.findLatestVersionOrThrow(tx, nodeId);
      const [createdVersion] = await tx
        .insert(memoryVersions)
        .values({
          nodeId,
          tenantId: getTenantId,
          content: targetVersion.content,
          version: latestVersion.version + 1,
          reviewStatus: 'pending',
          patchSummary: `rollback: restore version ${targetVersion.version}`,
          createdBy: createdBy ?? null,
        })
        .returning();

      await this.deprecateLatestVersionOrThrow(
        tx,
        latestVersion,
        createdVersion.id,
      );

      return createdVersion;
    });
  }

  async updateReviewStatus(
    versionId: string,
    status: MemoryVersionReviewDecision,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);
    const [updatedVersion] = await tenantDb
      .update(memoryVersions)
      .set({ reviewStatus: status })
      .where(eq(memoryVersions.id, versionId))
      .returning();

    if (!updatedVersion) {
      throw new NotFoundException(`Memory version ${versionId} not found`);
    }

    return updatedVersion;
  }

  private async findNodeOrThrow(nodeId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [node] = await tenantDb
      .select()
      .from(memoryNodes)
      .where(eq(memoryNodes.id, nodeId))
      .limit(1);

    if (!node) {
      throw new NotFoundException(`Memory node ${nodeId} not found`);
    }
  }

  private async findLatestVersion(
    dbClient: VersionQueryClient,
    nodeId: string,
  ): Promise<MemoryVersion | null> {
    const [latestVersion] = await dbClient
      .select()
      .from(memoryVersions)
      .where(
        and(
          eq(memoryVersions.nodeId, nodeId),
          eq(memoryVersions.deprecated, false),
        ),
      )
      .orderBy(desc(memoryVersions.version))
      .limit(1);

    return latestVersion ?? null;
  }

  private async findLatestVersionOrThrow(
    dbClient: VersionQueryClient,
    nodeId: string,
  ): Promise<MemoryVersion> {
    const latestVersion = await this.findLatestVersion(dbClient, nodeId);

    if (!latestVersion) {
      throw new NotFoundException(
        `Memory version for node ${nodeId} not found`,
      );
    }

    return latestVersion;
  }

  private async deprecateLatestVersionOrThrow(
    dbClient: VersionQueryClient,
    latestVersion: MemoryVersion,
    successorVersionId: string,
  ): Promise<void> {
    const [updatedVersion] = await dbClient
      .update(memoryVersions)
      .set({
        deprecated: true,
        migratedTo: successorVersionId,
      })
      .where(
        and(
          eq(memoryVersions.id, latestVersion.id),
          eq(memoryVersions.nodeId, latestVersion.nodeId),
          eq(memoryVersions.version, latestVersion.version),
          eq(memoryVersions.deprecated, false),
        ),
      )
      .returning({ id: memoryVersions.id });

    if (!updatedVersion) {
      throw new ConflictException(
        'Latest memory version changed during update',
      );
    }
  }
}
