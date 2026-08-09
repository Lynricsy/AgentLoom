import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt, or, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import * as schema from '../../database/schema';

export interface WorkspaceRuntimeLeaseToken {
  workspaceId: string;
  sandboxSessionId: string;
  fencingToken: number;
}

@Injectable()
export class WorkspaceRuntimeLeaseService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async acquire(
    tenantId: string,
    workspaceId: string,
    sandboxSessionId: string,
    ttlMs: number,
  ): Promise<WorkspaceRuntimeLeaseToken> {
    const leaseExpiresAt = new Date(Date.now() + Math.max(ttlMs, 60_000));
    const [lease] = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) =>
        tenantDb
          .insert(schema.workspaceRuntimeLeases)
          .values({
            tenantId,
            workspaceId,
            sandboxSessionId,
            fencingToken: 1,
            leaseExpiresAt,
          })
          .onConflictDoUpdate({
            target: schema.workspaceRuntimeLeases.workspaceId,
            set: {
              sandboxSessionId,
              fencingToken: sql`${schema.workspaceRuntimeLeases.fencingToken} + 1`,
              leaseExpiresAt,
              updatedAt: new Date(),
            },
            where: or(
              eq(
                schema.workspaceRuntimeLeases.sandboxSessionId,
                sandboxSessionId,
              ),
              lt(schema.workspaceRuntimeLeases.leaseExpiresAt, new Date()),
            ),
          })
          .returning({
            fencingToken: schema.workspaceRuntimeLeases.fencingToken,
          }),
    );
    if (!lease) {
      throw new ConflictException(
        `Workspace ${workspaceId} is already attached to another active sandbox`,
      );
    }
    return { workspaceId, sandboxSessionId, fencingToken: lease.fencingToken };
  }

  async renew(
    tenantId: string,
    token: WorkspaceRuntimeLeaseToken,
    ttlMs: number,
  ): Promise<WorkspaceRuntimeLeaseToken> {
    const [lease] = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) =>
        tenantDb
          .update(schema.workspaceRuntimeLeases)
          .set({
            leaseExpiresAt: new Date(Date.now() + Math.max(ttlMs, 60_000)),
            updatedAt: new Date(),
          })
          .where(this.tokenPredicate(token))
          .returning({
            fencingToken: schema.workspaceRuntimeLeases.fencingToken,
          }),
    );
    if (!lease) {
      throw new ConflictException(
        `Workspace ${token.workspaceId} lease is stale`,
      );
    }
    return token;
  }

  async renewOwned(
    tenantId: string,
    workspaceId: string,
    sandboxSessionId: string,
    ttlMs: number,
  ): Promise<WorkspaceRuntimeLeaseToken> {
    const [lease] = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) =>
        tenantDb
          .update(schema.workspaceRuntimeLeases)
          .set({
            leaseExpiresAt: new Date(Date.now() + Math.max(ttlMs, 60_000)),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.workspaceRuntimeLeases.workspaceId, workspaceId),
              eq(
                schema.workspaceRuntimeLeases.sandboxSessionId,
                sandboxSessionId,
              ),
            ),
          )
          .returning({
            fencingToken: schema.workspaceRuntimeLeases.fencingToken,
          }),
    );
    if (!lease) {
      throw new ConflictException(
        `Workspace ${workspaceId} is not leased by sandbox ${sandboxSessionId}`,
      );
    }
    return { workspaceId, sandboxSessionId, fencingToken: lease.fencingToken };
  }

  async release(
    tenantId: string,
    token: WorkspaceRuntimeLeaseToken,
  ): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
      await tenantDb
        .delete(schema.workspaceRuntimeLeases)
        .where(this.tokenPredicate(token));
    });
  }

  async assertHeld(
    tenantId: string,
    token: WorkspaceRuntimeLeaseToken,
  ): Promise<void> {
    const [lease] = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) =>
        tenantDb
          .select({ id: schema.workspaceRuntimeLeases.id })
          .from(schema.workspaceRuntimeLeases)
          .where(
            and(
              this.tokenPredicate(token),
              gt(schema.workspaceRuntimeLeases.leaseExpiresAt, new Date()),
            ),
          )
          .limit(1),
    );
    if (!lease) {
      throw new ConflictException(
        `Workspace ${token.workspaceId} lease is stale`,
      );
    }
  }
  private tokenPredicate(token: WorkspaceRuntimeLeaseToken) {
    return and(
      eq(schema.workspaceRuntimeLeases.workspaceId, token.workspaceId),
      eq(
        schema.workspaceRuntimeLeases.sandboxSessionId,
        token.sandboxSessionId,
      ),
      eq(schema.workspaceRuntimeLeases.fencingToken, token.fencingToken),
    );
  }
}
