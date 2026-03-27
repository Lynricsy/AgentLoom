import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  memorySessions,
  type MemorySession,
  type MemorySessionConfig,
} from '../../database/schema';
import type { SharedResourceProvider } from '../shared-resources/shared-resource-registry';

export const MEMORY_RESOURCE_TYPE = 'memory' as const;

export interface MemoryResourceConfig {
  memoryInstanceId: string;
  role: 'primary' | 'readonly';
  bootUris: string[];
  fusionPriority: number;
  tenantId: string;
  executionId?: string;
  agentConversationId?: string;
}

export interface MemoryResourceInstance {
  sessionId: string;
  session: MemorySession;
  memoryInstanceId: string;
  tenantId: string;
}

interface MemorySessionShareRecord {
  consumerId: string;
  sharedAt: string;
}

interface MemorySessionShareMetadata extends MemorySessionConfig {
  sharedConsumers?: string[];
  shareCount?: number;
  shareLog?: MemorySessionShareRecord[];
}

@Injectable()
export class MemoryResourceProvider implements SharedResourceProvider<
  MemoryResourceConfig,
  MemoryResourceInstance
> {
  private readonly logger = new Logger(MemoryResourceProvider.name);

  readonly type = MEMORY_RESOURCE_TYPE;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(config: MemoryResourceConfig): Promise<MemoryResourceInstance> {
    const tenantDb = getTenantDb(this.db);

    const [session] = await tenantDb
      .insert(memorySessions)
      .values({
        memoryInstanceId: config.memoryInstanceId,
        executionId: config.executionId,
        agentConversationId: config.agentConversationId,
        tenantId: config.tenantId,
        role: config.role,
        status: 'active',
        config: {
          bootUris: config.bootUris,
          fusionPriority: config.fusionPriority,
        },
      })
      .returning();

    if (!session) {
      throw new Error('Failed to create memory session resource');
    }

    this.logger.debug(`Created memory resource: session ${session.id}`);

    return {
      sessionId: session.id,
      session,
      memoryInstanceId: config.memoryInstanceId,
      tenantId: config.tenantId,
    };
  }

  async destroy(instance: MemoryResourceInstance): Promise<void> {
    const tenantDb = getTenantDb(this.db);

    await tenantDb
      .update(memorySessions)
      .set({ status: 'disconnected' })
      .where(
        and(
          eq(memorySessions.id, instance.sessionId),
          eq(memorySessions.tenantId, instance.tenantId),
        ),
      )
      .returning({ id: memorySessions.id });

    instance.session = {
      ...instance.session,
      status: 'disconnected',
    };

    this.logger.debug(
      `Disconnected memory resource: session ${instance.sessionId}`,
    );
  }

  async share(
    instance: MemoryResourceInstance,
    consumerId: string,
  ): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const nextConfig = this.buildSharedConfig(
      instance.session.config,
      consumerId,
    );

    await tenantDb
      .update(memorySessions)
      .set({ config: nextConfig })
      .where(
        and(
          eq(memorySessions.id, instance.sessionId),
          eq(memorySessions.tenantId, instance.tenantId),
        ),
      )
      .returning({ id: memorySessions.id });

    instance.session = {
      ...instance.session,
      config: nextConfig,
    };

    this.logger.debug(
      `Shared memory resource ${instance.sessionId} with consumer ${consumerId}`,
    );
  }

  private buildSharedConfig(
    currentConfig: MemorySessionConfig | null,
    consumerId: string,
  ): MemorySessionShareMetadata {
    const baseConfig = currentConfig ?? {
      bootUris: [],
      fusionPriority: 0,
    };
    const existingShareConfig =
      currentConfig as MemorySessionShareMetadata | null;
    const sharedConsumers = [
      ...(existingShareConfig?.sharedConsumers ?? []),
      consumerId,
    ];
    const shareLog = [
      ...(existingShareConfig?.shareLog ?? []),
      {
        consumerId,
        sharedAt: new Date().toISOString(),
      },
    ];

    return {
      ...baseConfig,
      sharedConsumers,
      shareCount: sharedConsumers.length,
      shareLog,
    };
  }
}
