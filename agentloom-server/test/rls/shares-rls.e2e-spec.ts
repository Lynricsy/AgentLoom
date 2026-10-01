import * as crypto from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runInTenantTransaction } from '../../src/common/interceptors/tenant-transaction.context';
import { agentShares, workflowShares } from '../../src/database/schema';
import { ShareService } from '../../src/modules/share/share.service';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  withTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type ShareTable = typeof agentShares | typeof workflowShares;

interface ShareKind {
  tableName: 'agent_shares' | 'workflow_shares';
  table: ShareTable;
  resourceColumn: 'agent_definition_id' | 'workflow_definition_id';
  seedPublishedResource: (
    context: RlsTestContext,
    tenantId: string,
    userId: string,
  ) => Promise<string>;
  createShare: (
    service: ShareService,
    tenantId: string,
    userId: string,
    resourceId: string,
  ) => Promise<{ id: string; shareToken: string }>;
  listShareIds: (
    service: ShareService,
    tenantId: string,
    resourceId: string,
  ) => Promise<string[]>;
  getByToken: (
    service: ShareService,
    token: string,
  ) => Promise<{ tenantId: string }>;
  revoke: (
    service: ShareService,
    tenantId: string,
    shareId: string,
  ) => Promise<void>;
}

const configService = {
  get: (key: string) =>
    key === 'APP_FRONTEND_URL' ? 'http://localhost:5173' : undefined,
} as unknown as ConfigService;

const EMPTY_SNAPSHOT_METADATA = {
  nodeCount: 0,
  edgeCount: 0,
  createdFromVersion: 1,
};

const SHARE_KINDS: ShareKind[] = [
  {
    tableName: 'agent_shares',
    table: agentShares,
    resourceColumn: 'agent_definition_id',
    async seedPublishedResource(context, tenantId, userId) {
      const agentId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      await context.adminSql`
        INSERT INTO agent_definitions (
          id, tenant_id, name, slug, runtime_mode, status, created_by, updated_by
        ) VALUES (
          ${agentId}::uuid, ${tenantId}::uuid, 'Agent', ${`agent-${agentId}`},
          'no_sandbox', 'published', ${userId}::uuid, ${userId}::uuid
        )
      `;
      await context.adminSql`
        INSERT INTO agent_versions (
          id, agent_definition_id, tenant_id, version_number, snapshot,
          published_at, created_by
        ) VALUES (
          ${versionId}::uuid, ${agentId}::uuid, ${tenantId}::uuid, 1,
          ${context.adminSql.json({
            runtimeMode: 'no_sandbox',
            nodes: [],
            edges: [],
            viewport: null,
            metadata: EMPTY_SNAPSHOT_METADATA,
          })},
          now(), ${userId}::uuid
        )
      `;
      await context.adminSql`
        UPDATE agent_definitions SET published_version_id = ${versionId}::uuid
        WHERE id = ${agentId}::uuid
      `;
      return agentId;
    },
    createShare: (service, tenantId, userId, resourceId) =>
      service.createAgentShare(tenantId, userId, {
        agent_definition_id: resourceId,
        share_type: 'copyable',
      }),
    listShareIds: async (service, tenantId, resourceId) =>
      (
        await service.findSharesByAgent(tenantId, {
          page: 1,
          page_size: 20,
          agent_definition_id: resourceId,
        })
      ).data.map((share) => share.id),
    getByToken: (service, token) => service.getAgentShareByToken(token),
    revoke: (service, tenantId, shareId) =>
      service.revokeAgentShare(tenantId, shareId),
  },
  {
    tableName: 'workflow_shares',
    table: workflowShares,
    resourceColumn: 'workflow_definition_id',
    async seedPublishedResource(context, tenantId, userId) {
      const workflowId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      await context.adminSql`
        INSERT INTO workflow_definitions (
          id, tenant_id, name, slug, status, created_by, updated_by
        ) VALUES (
          ${workflowId}::uuid, ${tenantId}::uuid, 'Workflow',
          ${`workflow-${workflowId}`}, 'published', ${userId}::uuid, ${userId}::uuid
        )
      `;
      await context.adminSql`
        INSERT INTO workflow_versions (
          id, workflow_definition_id, tenant_id, version_number, snapshot,
          published_at, created_by
        ) VALUES (
          ${versionId}::uuid, ${workflowId}::uuid, ${tenantId}::uuid, 1,
          ${context.adminSql.json({
            nodes: [],
            edges: [],
            viewport: null,
            metadata: EMPTY_SNAPSHOT_METADATA,
          })},
          now(), ${userId}::uuid
        )
      `;
      await context.adminSql`
        UPDATE workflow_definitions SET published_version_id = ${versionId}::uuid
        WHERE id = ${workflowId}::uuid
      `;
      return workflowId;
    },
    createShare: (service, tenantId, userId, resourceId) =>
      service.createShare(tenantId, userId, {
        workflow_definition_id: resourceId,
        share_type: 'copyable',
      }),
    listShareIds: async (service, tenantId, resourceId) =>
      (
        await service.findSharesByWorkflow(tenantId, {
          page: 1,
          page_size: 20,
          workflow_definition_id: resourceId,
        })
      ).data.map((share) => share.id),
    getByToken: (service, token) => service.getShareByToken(token),
    revoke: (service, tenantId, shareId) =>
      service.revokeShare(tenantId, shareId),
  },
];

describe.each(SHARE_KINDS)('$tableName RLS isolation (testcontainers)', (kind) => {
  let context: RlsTestContext;
  let tenantOneId: string;
  let tenantTwoId: string;
  let userOneId: string;
  let userTwoId: string;
  let resourceOneId: string;
  let shareOneToken: string;

  beforeAll(async () => {
    context = await createRlsTestContext();
    // Supabase 托管库对 public 新表默认 GRANT ALL TO authenticated。
    // 显式授予同等权限，让测试只回答“表级 RLS 是否挡住其他租户”。
    await context.adminSql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "${kind.tableName}" TO "authenticated"`,
    );
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM agent_shares`;
    await context.adminSql`DELETE FROM workflow_shares`;
    await context.adminSql`DELETE FROM agent_definitions`;
    await context.reset();

    userOneId = crypto.randomUUID();
    userTwoId = crypto.randomUUID();
    tenantOneId = crypto.randomUUID();
    tenantTwoId = crypto.randomUUID();
    await seedAppUser(context.adminSql, userOneId, `u1-${userOneId}@ex.com`);
    await seedAppUser(context.adminSql, userTwoId, `u2-${userTwoId}@ex.com`);

    resourceOneId = await kind.seedPublishedResource(
      context,
      tenantOneId,
      userOneId,
    );
    shareOneToken = crypto.randomBytes(32).toString('hex');
    await context.adminSql.unsafe(
      `INSERT INTO "${kind.tableName}" (${kind.resourceColumn}, tenant_id, share_token, share_type, created_by)
       VALUES ($1::uuid, $2::uuid, $3, 'copyable', $4::uuid)`,
      [resourceOneId, tenantOneId, shareOneToken, userOneId],
    );
  });

  it('启用 RLS 并带四条租户策略', async () => {
    const [table] = await context.adminSql<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = ${kind.tableName}
    `;
    const policies = await context.adminSql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies WHERE tablename = ${kind.tableName}
      ORDER BY policyname
    `;

    expect(table?.relrowsecurity).toBe(true);
    expect(policies.map((row) => row.policyname)).toEqual(
      ['delete', 'insert', 'select', 'update'].map(
        (op) => `${kind.tableName}_${op}_policy`,
      ),
    );
  });

  it('T2 读不到 T1 的分享行（含 share_token）', async () => {
    const rows = await withTenantContext(context.db, tenantTwoId, (db) =>
      db.select().from(kind.table),
    );

    expect(rows).toEqual([]);
  });

  it('T1 只读到自己的分享行', async () => {
    const rows = await withTenantContext(context.db, tenantOneId, (db) =>
      db.select().from(kind.table),
    );

    expect(rows.map((row) => row.shareToken)).toEqual([shareOneToken]);
  });

  it('T2 不能写入 tenant_id=T1 的分享', async () => {
    let caught: unknown;
    try {
      await withTenantContext(context.db, tenantTwoId, (db) =>
        db.execute(
          `INSERT INTO "${kind.tableName}" (${kind.resourceColumn}, tenant_id, share_token, created_by)
           VALUES ('${resourceOneId}', '${tenantOneId}', '${crypto.randomUUID()}', '${userTwoId}')`,
        ),
      );
    } catch (error) {
      caught = error;
    }

    expect(getErrorText(caught)).toMatch(/row-level security/i);
  });

  it('T2 无法撤销 T1 的分享', async () => {
    const updated = await withTenantContext(context.db, tenantTwoId, (db) =>
      db
        .update(kind.table)
        .set({ isRevoked: true })
        .returning({ id: kind.table.id }),
    );

    expect(updated).toEqual([]);
    const [row] = await context.adminSql.unsafe<{ is_revoked: boolean }[]>(
      `SELECT is_revoked FROM "${kind.tableName}" WHERE share_token = $1`,
      [shareOneToken],
    );
    expect(row?.is_revoked).toBe(false);
  });

  it('分享流程不受影响：T1 创建/列表，匿名与 T2 按 token 访问，T1 撤销', async () => {
    const service = new ShareService(context.db, configService);

    const created = await runInTenantTransaction(context.db, tenantOneId, () =>
      kind.createShare(service, tenantOneId, userOneId, resourceOneId),
    );

    const listed = await runInTenantTransaction(context.db, tenantOneId, () =>
      kind.listShareIds(service, tenantOneId, resourceOneId),
    );
    expect(listed).toContain(created.id);

    await expect(service.getPublicShare(created.shareToken)).resolves.toBeTruthy();

    const crossTenant = await runInTenantTransaction(
      context.db,
      tenantTwoId,
      () => kind.getByToken(service, created.shareToken),
    );
    expect(crossTenant.tenantId).toBe(tenantOneId);

    await runInTenantTransaction(context.db, tenantOneId, () =>
      kind.revoke(service, tenantOneId, created.id),
    );
    await expect(kind.getByToken(service, created.shareToken)).rejects.toThrow();
  });
});
