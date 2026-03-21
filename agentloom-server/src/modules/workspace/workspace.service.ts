import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, desc, ne } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DockerService } from '../sandbox/docker.service';
import { buildWorkspaceStorageKey } from './workspace.constants';

const CONTAINER_WORKSPACE = '/workspace/';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
    private readonly dockerService: DockerService,
  ) {}

  async createFromSandbox(
    tenantId: string,
    organizationId: string,
    userId: string,
    sandboxSessionId: string,
    name: string,
    description?: string,
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);
    const [session] = await tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(eq(schema.sandboxSessions.id, sandboxSessionId))
      .limit(1);

    if (!session || !session.containerId) {
      throw new NotFoundException(
        `Sandbox session ${sandboxSessionId} not found or container not ready`,
      );
    }

    const [snapshot] = await tenantDb
      .insert(schema.workspaceSnapshots)
      .values({
        organizationId,
        tenantId,
        name,
        description: description ?? null,
        storageKey: 'pending',
        status: 'creating',
        createdById: userId,
        config: { sourceSandboxSessionId: sandboxSessionId },
      })
      .returning();

    const storageKey = buildWorkspaceStorageKey(tenantId, snapshot.id);

    try {
      const archiveStream = await this.dockerService.getArchive(
        session.containerId,
        CONTAINER_WORKSPACE,
      );

      await this.storageService.upload(
        storageKey,
        archiveStream,
        undefined,
        'application/x-tar',
      );

      const [updated] = await tenantDb
        .update(schema.workspaceSnapshots)
        .set({
          storageKey,
          status: 'ready',
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaceSnapshots.id, snapshot.id))
        .returning();

      this.logger.log(
        `Workspace snapshot ${snapshot.id} created from sandbox ${sandboxSessionId}`,
      );

      return updated;
    } catch (error) {
      await tenantDb
        .update(schema.workspaceSnapshots)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(schema.workspaceSnapshots.id, snapshot.id));

      try {
        await this.storageService.delete(storageKey);
      } catch {
        // best-effort MinIO cleanup
      }

      this.logger.error(
        `Failed to create workspace snapshot from sandbox ${sandboxSessionId}`,
        error instanceof Error ? error.stack : error,
      );

      throw error;
    }
  }

  async restoreToSandbox(
    workspaceId: string,
    containerId: string,
    tenantId: string,
  ): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [snapshot] = await tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.id, workspaceId),
          eq(schema.workspaceSnapshots.status, 'ready'),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found or not ready`,
      );
    }

    this.logger.log(
      `Restoring workspace ${workspaceId} to container ${containerId}`,
    );

    const archiveStream = await this.storageService.download(
      snapshot.storageKey,
    );

    await this.dockerService.putArchive(
      containerId,
      archiveStream,
      CONTAINER_WORKSPACE,
    );

    this.logger.log(
      `Workspace ${workspaceId} restored to container ${containerId}`,
    );
  }

  async createEmpty(
    tenantId: string,
    organizationId: string,
    userId: string,
    name: string,
    description?: string,
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);

    const [snapshot] = await tenantDb
      .insert(schema.workspaceSnapshots)
      .values({
        organizationId,
        tenantId,
        name,
        description: description ?? null,
        storageKey: buildWorkspaceStorageKey(tenantId, 'empty'),
        status: 'ready',
        sizeBytes: 0,
        createdById: userId,
      })
      .returning();

    this.logger.log(`Empty workspace snapshot ${snapshot.id} created`);

    return snapshot;
  }

  async delete(tenantId: string, workspaceId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [snapshot] = await tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(eq(schema.workspaceSnapshots.id, workspaceId))
      .limit(1);

    if (!snapshot) {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found`,
      );
    }

    try {
      await this.storageService.delete(snapshot.storageKey);
    } catch (error) {
      this.logger.warn(
        `Failed to delete MinIO object for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await tenantDb
      .update(schema.workspaceSnapshots)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(schema.workspaceSnapshots.id, workspaceId));

    this.logger.log(`Workspace snapshot ${workspaceId} deleted`);
  }

  async findAll(tenantId: string): Promise<schema.WorkspaceSnapshot[]> {
    const tenantDb = getTenantDb(this.db);
    return tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(ne(schema.workspaceSnapshots.status, 'deleted'))
      .orderBy(desc(schema.workspaceSnapshots.createdAt));
  }

  async findOne(
    tenantId: string,
    workspaceId: string,
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);
    const [snapshot] = await tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.id, workspaceId),
          ne(schema.workspaceSnapshots.status, 'deleted'),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found`,
      );
    }

    return snapshot;
  }
}
