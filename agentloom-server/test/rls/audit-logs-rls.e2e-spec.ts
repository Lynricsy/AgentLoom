import * as crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { JSONValue } from 'postgres';

import { auditLogArchives, auditLogs } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
  type TestSql,
} from './rls-test-utils';

type AuditLogFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  actorOneId: string;
  actorTwoId: string;
  hotLogId: string;
  archiveLogId: string;
};

type SeedAuditLogOptions = {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'service';
  eventType: string;
  resourceType: string;
  resourceId: string;
  executionId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function createFixture(): AuditLogFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    actorOneId: crypto.randomUUID(),
    actorTwoId: crypto.randomUUID(),
    hotLogId: crypto.randomUUID(),
    archiveLogId: crypto.randomUUID(),
  };
}

function createEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

function toJsonValue(value: Record<string, unknown>): JSONValue {
  return value as JSONValue;
}

async function seedAuditLog(
  sqlClient: TestSql,
  tableName: 'audit_logs' | 'audit_log_archives',
  options: SeedAuditLogOptions,
) {
  const statement =
    tableName === 'audit_logs'
      ? sqlClient`
          INSERT INTO audit_logs (
            id,
            tenant_id,
            actor_id,
            actor_type,
            event_type,
            resource_type,
            resource_id,
            execution_id,
            summary,
            before,
            after,
            metadata
          )
          VALUES (
            ${options.id}::uuid,
            ${options.tenantId}::uuid,
            ${options.actorId}::uuid,
            ${options.actorType}::audit_actor_type,
            ${options.eventType},
            ${options.resourceType},
            ${options.resourceId},
            ${options.executionId ?? null}::uuid,
            ${options.summary},
            ${options.before ? sqlClient.json(toJsonValue(options.before)) : null},
            ${options.after ? sqlClient.json(toJsonValue(options.after)) : null},
            ${options.metadata ? sqlClient.json(toJsonValue(options.metadata)) : null}
          )
          RETURNING *
        `
      : sqlClient`
          INSERT INTO audit_log_archives (
            id,
            tenant_id,
            actor_id,
            actor_type,
            event_type,
            resource_type,
            resource_id,
            execution_id,
            summary,
            before,
            after,
            metadata
          )
          VALUES (
            ${options.id}::uuid,
            ${options.tenantId}::uuid,
            ${options.actorId}::uuid,
            ${options.actorType}::audit_actor_type,
            ${options.eventType},
            ${options.resourceType},
            ${options.resourceId},
            ${options.executionId ?? null}::uuid,
            ${options.summary},
            ${options.before ? sqlClient.json(toJsonValue(options.before)) : null},
            ${options.after ? sqlClient.json(toJsonValue(options.after)) : null},
            ${options.metadata ? sqlClient.json(toJsonValue(options.metadata)) : null}
          )
          RETURNING *
        `;

  return statement;
}

describe('AuditLogs RLS append-only isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: AuditLogFixture;

  beforeAll(async () => {
    context = await createRlsTestContext();
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = createFixture();

    await seedAppUser(
      context.adminSql,
      fixture.actorOneId,
      createEmail('audit-actor-one'),
    );
    await seedAppUser(
      context.adminSql,
      fixture.actorTwoId,
      createEmail('audit-actor-two'),
    );
  });

  it('同租户可以 INSERT 并读取 audit_logs', async () => {
    const insertedRows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .insert(auditLogs)
          .values({
            id: fixture.hotLogId,
            tenantId: fixture.tenantOneId,
            actorId: fixture.actorOneId,
            actorType: 'user',
            eventType: 'workflow.updated',
            resourceType: 'workflow_definition',
            resourceId: 'workflow-1',
            executionId: null,
            summary: '更新工作流配置',
            before: { name: 'before' },
            after: { name: 'after' },
            metadata: { source: 'rls-test' },
          })
          .returning(),
    );

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.tenantId).toBe(fixture.tenantOneId);
    expect(insertedRows[0]?.id).toBe(fixture.hotLogId);

    const selectedRows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .select({ id: auditLogs.id, summary: auditLogs.summary })
          .from(auditLogs)
          .where(eq(auditLogs.id, fixture.hotLogId)),
    );

    expect(selectedRows).toEqual([
      {
        id: fixture.hotLogId,
        summary: '更新工作流配置',
      },
    ]);
  });

  it('跨租户无法读取 audit_logs', async () => {
    await seedAuditLog(context.adminSql, 'audit_logs', {
      id: fixture.hotLogId,
      tenantId: fixture.tenantTwoId,
      actorId: fixture.actorTwoId,
      actorType: 'user',
      eventType: 'workflow.updated',
      resourceType: 'workflow_definition',
      resourceId: 'workflow-2',
      summary: '租户二事件',
      before: { status: 'draft' },
      after: { status: 'published' },
      metadata: { source: 'admin-seed' },
    });

    const rows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) => tx.select({ id: auditLogs.id }).from(auditLogs),
    );

    expect(rows).toEqual([]);
  });

  it('没有 tenant context 时无法读取 audit_logs', async () => {
    await seedAuditLog(context.adminSql, 'audit_logs', {
      id: fixture.hotLogId,
      tenantId: fixture.tenantOneId,
      actorId: fixture.actorOneId,
      actorType: 'user',
      eventType: 'workflow.updated',
      resourceType: 'workflow_definition',
      resourceId: 'workflow-1',
      summary: '无租户上下文读取测试',
      metadata: { source: 'admin-seed' },
    });

    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.select({ id: auditLogs.id }).from(auditLogs),
    );

    expect(rows).toEqual([]);
  });

  it('同租户也不能 UPDATE audit_logs（append-only）', async () => {
    await seedAuditLog(context.adminSql, 'audit_logs', {
      id: fixture.hotLogId,
      tenantId: fixture.tenantOneId,
      actorId: fixture.actorOneId,
      actorType: 'user',
      eventType: 'workflow.updated',
      resourceType: 'workflow_definition',
      resourceId: 'workflow-1',
      summary: '原始摘要',
      metadata: { source: 'admin-seed' },
    });

    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .update(auditLogs)
          .set({ summary: '被篡改的摘要' })
          .where(eq(auditLogs.id, fixture.hotLogId))
          .returning({ id: auditLogs.id }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(
      /permission denied|row-level security/i,
    );

    const [row] = await context.adminSql`
      SELECT summary FROM audit_logs WHERE id = ${fixture.hotLogId}::uuid
    `;

    expect(row?.summary).toBe('原始摘要');
  });

  it('同租户也不能 DELETE audit_logs（append-only）', async () => {
    await seedAuditLog(context.adminSql, 'audit_logs', {
      id: fixture.hotLogId,
      tenantId: fixture.tenantOneId,
      actorId: fixture.actorOneId,
      actorType: 'user',
      eventType: 'workflow.updated',
      resourceType: 'workflow_definition',
      resourceId: 'workflow-1',
      summary: '待保留审计记录',
      metadata: { source: 'admin-seed' },
    });

    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .delete(auditLogs)
          .where(eq(auditLogs.id, fixture.hotLogId))
          .returning({ id: auditLogs.id }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(
      /permission denied|row-level security/i,
    );

    const [row] = await context.adminSql`
      SELECT id FROM audit_logs WHERE id = ${fixture.hotLogId}::uuid
    `;

    expect(row?.id).toBe(fixture.hotLogId);
  });

  it('同租户可以 INSERT 并读取 audit_log_archives', async () => {
    const insertedRows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .insert(auditLogArchives)
          .values({
            id: fixture.archiveLogId,
            tenantId: fixture.tenantOneId,
            actorId: fixture.actorOneId,
            actorType: 'user',
            eventType: 'workflow.archived',
            resourceType: 'workflow_definition',
            resourceId: 'workflow-archive-1',
            executionId: null,
            summary: '已归档的审计记录',
            before: { status: 'published' },
            after: { status: 'archived' },
            metadata: { source: 'archive-insert' },
          })
          .returning(),
    );

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.id).toBe(fixture.archiveLogId);

    const rows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .select({
            id: auditLogArchives.id,
            summary: auditLogArchives.summary,
          })
          .from(auditLogArchives)
          .where(eq(auditLogArchives.id, fixture.archiveLogId)),
    );

    expect(rows).toEqual([
      {
        id: fixture.archiveLogId,
        summary: '已归档的审计记录',
      },
    ]);
  });

  it('同租户也不能 UPDATE audit_log_archives（append-only）', async () => {
    await seedAuditLog(context.adminSql, 'audit_log_archives', {
      id: fixture.archiveLogId,
      tenantId: fixture.tenantOneId,
      actorId: fixture.actorOneId,
      actorType: 'user',
      eventType: 'workflow.archived',
      resourceType: 'workflow_definition',
      resourceId: 'workflow-archive-1',
      summary: '归档前摘要',
      metadata: { source: 'admin-seed' },
    });

    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .update(auditLogArchives)
          .set({ summary: '被篡改的归档摘要' })
          .where(eq(auditLogArchives.id, fixture.archiveLogId))
          .returning({ id: auditLogArchives.id }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(
      /permission denied|row-level security/i,
    );

    const [row] = await context.adminSql`
      SELECT summary FROM audit_log_archives WHERE id = ${fixture.archiveLogId}::uuid
    `;

    expect(row?.summary).toBe('归档前摘要');
  });

  it('同租户也不能 DELETE audit_log_archives（append-only）', async () => {
    await seedAuditLog(context.adminSql, 'audit_log_archives', {
      id: fixture.archiveLogId,
      tenantId: fixture.tenantOneId,
      actorId: fixture.actorOneId,
      actorType: 'user',
      eventType: 'workflow.archived',
      resourceType: 'workflow_definition',
      resourceId: 'workflow-archive-1',
      summary: '待保留的归档记录',
      metadata: { source: 'admin-seed' },
    });

    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .delete(auditLogArchives)
          .where(eq(auditLogArchives.id, fixture.archiveLogId))
          .returning({ id: auditLogArchives.id }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(
      /permission denied|row-level security/i,
    );

    const [row] = await context.adminSql`
      SELECT id FROM audit_log_archives WHERE id = ${fixture.archiveLogId}::uuid
    `;

    expect(row?.id).toBe(fixture.archiveLogId);
  });
});
