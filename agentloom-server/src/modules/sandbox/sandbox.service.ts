import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { and, eq, notInArray, asc } from 'drizzle-orm';
import { Queue } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import type { SandboxConfig, SandboxLog, SandboxSession } from '../../database/schema';
import { SandboxNotFoundException } from './sandbox.exceptions';
import {
  SANDBOX_LIFECYCLE_QUEUE,
  type SandboxLifecycleJobData,
} from './sandbox.constants';

const TERMINAL_STATUSES = ['stopped', 'failed'] as const;

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @InjectQueue(SANDBOX_LIFECYCLE_QUEUE)
    private readonly lifecycleQueue: Queue<SandboxLifecycleJobData>,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async createSandboxSession(
    executionId: string,
    sandboxNodeId: string,
    config: SandboxConfig,
    tenantId: string,
  ): Promise<SandboxSession> {
    const existing = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(
        and(
          eq(schema.sandboxSessions.executionId, executionId),
          notInArray(schema.sandboxSessions.status, [...TERMINAL_STATUSES]),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      this.logger.debug(
        `Reusing existing sandbox session ${existing[0].id} (status=${existing[0].status}) for execution ${executionId}`,
      );
      return existing[0];
    }

    const [session] = await this.tenantDb
      .insert(schema.sandboxSessions)
      .values({
        executionId,
        sandboxNodeId,
        tenantId,
        config,
        status: 'creating',
      })
      .returning();

    await this.lifecycleQueue.add('create', {
      sessionId: session.id,
      executionId,
      tenantId,
      jobType: 'create',
    });

    this.logger.log(
      `Created sandbox session ${session.id} for execution ${executionId}`,
    );

    return session;
  }

  async getSandboxSession(
    executionId: string,
  ): Promise<SandboxSession | null> {
    const [session] = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(
        and(
          eq(schema.sandboxSessions.executionId, executionId),
          notInArray(schema.sandboxSessions.status, [...TERMINAL_STATUSES]),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async updateSessionStatus(
    sessionId: string,
    status: SandboxSession['status'],
    metadata?: Partial<
      Pick<SandboxSession, 'containerId' | 'workspacePath' | 'startedAt' | 'stoppedAt'>
    >,
  ): Promise<void> {
    const result = await this.tenantDb
      .update(schema.sandboxSessions)
      .set({ status, ...metadata })
      .where(eq(schema.sandboxSessions.id, sessionId))
      .returning({ id: schema.sandboxSessions.id });

    if (result.length === 0) {
      throw new SandboxNotFoundException(sessionId);
    }

    this.logger.log(
      `Updated sandbox session ${sessionId} status to ${status}`,
    );
  }

  async destroySandbox(executionId: string, tenantId: string): Promise<void> {
    const session = await this.getSandboxSession(executionId);

    if (!session) {
      this.logger.warn(
        `No active sandbox session found for execution ${executionId}, skipping destroy`,
      );
      return;
    }

    await this.updateSessionStatus(session.id, 'stopping');

    await this.lifecycleQueue.add('destroy', {
      sessionId: session.id,
      executionId,
      tenantId,
      jobType: 'destroy',
    });

    this.logger.log(
      `Enqueued destroy for sandbox session ${session.id}`,
    );
  }

  async getSandboxLogs(sessionId: string): Promise<SandboxLog[]> {
    return this.tenantDb
      .select()
      .from(schema.sandboxLogs)
      .where(eq(schema.sandboxLogs.sessionId, sessionId))
      .orderBy(asc(schema.sandboxLogs.createdAt));
  }
}
