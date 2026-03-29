import * as crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { knowledgeNodes } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type KnowledgeNodeFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  userOneId: string;
  userTwoId: string;
  knowledgeBaseOneId: string;
  knowledgeBaseTwoId: string;
  documentOneId: string;
  documentTwoId: string;
  knowledgeNodeOneId: string;
  knowledgeNodeTwoId: string;
};

function createFixture(): KnowledgeNodeFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    userOneId: crypto.randomUUID(),
    userTwoId: crypto.randomUUID(),
    knowledgeBaseOneId: crypto.randomUUID(),
    knowledgeBaseTwoId: crypto.randomUUID(),
    documentOneId: crypto.randomUUID(),
    documentTwoId: crypto.randomUUID(),
    knowledgeNodeOneId: `node-${crypto.randomUUID()}`,
    knowledgeNodeTwoId: `node-${crypto.randomUUID()}`,
  };
}

function createEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function seedKnowledgeBase(
  sqlClient: RlsTestContext['adminSql'],
  options: {
    id: string;
    tenantId: string;
    name: string;
    createdBy: string;
  },
) {
  const [row] = await sqlClient`
    INSERT INTO knowledge_bases (
      id,
      tenant_id,
      name,
      description,
      visibility,
      created_by
    )
    VALUES (
      ${options.id}::uuid,
      ${options.tenantId}::uuid,
      ${options.name},
      null,
      'private'::knowledge_base_visibility,
      ${options.createdBy}::uuid
    )
    RETURNING *
  `;

  return row;
}

async function seedDocument(
  sqlClient: RlsTestContext['adminSql'],
  options: {
    id: string;
    knowledgeBaseId: string;
    tenantId: string;
    uploadedBy: string;
    fileName: string;
  },
) {
  const [row] = await sqlClient`
    INSERT INTO documents (
      id,
      knowledge_base_id,
      tenant_id,
      file_name,
      mime_type,
      size_bytes,
      storage_key,
      status,
      uploaded_by
    )
    VALUES (
      ${options.id}::uuid,
      ${options.knowledgeBaseId}::uuid,
      ${options.tenantId}::uuid,
      ${options.fileName},
      'text/plain',
      128,
      ${`knowledge/${options.id}.txt`},
      'ready'::document_status,
      ${options.uploadedBy}::uuid
    )
    RETURNING *
  `;

  return row;
}

async function seedKnowledgeNode(
  sqlClient: RlsTestContext['adminSql'],
  options: {
    id: string;
    documentId: string;
    tenantId: string;
    knowledgeBaseId: string;
    nodeIndex: number;
    content: string;
  },
) {
  const [row] = await sqlClient`
    INSERT INTO knowledge_nodes (
      id,
      document_id,
      tenant_id,
      knowledge_base_id,
      node_index,
      node_type,
      content,
      token_count,
      metadata,
      payload
    )
    VALUES (
      ${options.id},
      ${options.documentId}::uuid,
      ${options.tenantId}::uuid,
      ${options.knowledgeBaseId}::uuid,
      ${options.nodeIndex},
      'text',
      ${options.content},
      16,
      ${sqlClient.json({ source: 'rls-test' })},
      ${sqlClient.json({ text: options.content })}
    )
    RETURNING *
  `;

  return row;
}

describe('KnowledgeNodes RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: KnowledgeNodeFixture;

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
      fixture.userOneId,
      createEmail('knowledge-user-one'),
    );
    await seedAppUser(
      context.adminSql,
      fixture.userTwoId,
      createEmail('knowledge-user-two'),
    );

    await seedKnowledgeBase(context.adminSql, {
      id: fixture.knowledgeBaseOneId,
      tenantId: fixture.tenantOneId,
      name: 'Tenant One KB',
      createdBy: fixture.userOneId,
    });
    await seedKnowledgeBase(context.adminSql, {
      id: fixture.knowledgeBaseTwoId,
      tenantId: fixture.tenantTwoId,
      name: 'Tenant Two KB',
      createdBy: fixture.userTwoId,
    });

    await seedDocument(context.adminSql, {
      id: fixture.documentOneId,
      knowledgeBaseId: fixture.knowledgeBaseOneId,
      tenantId: fixture.tenantOneId,
      uploadedBy: fixture.userOneId,
      fileName: 'tenant-one.txt',
    });
    await seedDocument(context.adminSql, {
      id: fixture.documentTwoId,
      knowledgeBaseId: fixture.knowledgeBaseTwoId,
      tenantId: fixture.tenantTwoId,
      uploadedBy: fixture.userTwoId,
      fileName: 'tenant-two.txt',
    });

    await seedKnowledgeNode(context.adminSql, {
      id: fixture.knowledgeNodeOneId,
      documentId: fixture.documentOneId,
      tenantId: fixture.tenantOneId,
      knowledgeBaseId: fixture.knowledgeBaseOneId,
      nodeIndex: 0,
      content: 'tenant one content',
    });
    await seedKnowledgeNode(context.adminSql, {
      id: fixture.knowledgeNodeTwoId,
      documentId: fixture.documentTwoId,
      tenantId: fixture.tenantTwoId,
      knowledgeBaseId: fixture.knowledgeBaseTwoId,
      nodeIndex: 0,
      content: 'tenant two content',
    });
  });

  it('T1 SELECT 只返回 T1 knowledge_nodes', async () => {
    const rows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) => tx.query.knowledgeNodes.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.knowledgeNodeOneId);
    expect(rows[0]?.tenantId).toBe(fixture.tenantOneId);
  });

  it('T1 INSERT 带入 T2 tenant_id 会被拒绝', async () => {
    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .insert(knowledgeNodes)
          .values({
            id: `node-${crypto.randomUUID()}`,
            documentId: fixture.documentOneId,
            tenantId: fixture.tenantTwoId,
            knowledgeBaseId: fixture.knowledgeBaseOneId,
            nodeIndex: 1,
            nodeType: 'text',
            content: 'cross tenant',
            tokenCount: 12,
            metadata: { source: 'cross-tenant' },
            payload: { text: 'cross tenant' },
          })
          .returning(),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(
      /permission denied|row-level security/i,
    );
  });

  it('T1 无法 DELETE T2 knowledge_nodes', async () => {
    const deletedRows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .delete(knowledgeNodes)
          .where(eq(knowledgeNodes.id, fixture.knowledgeNodeTwoId))
          .returning({ id: knowledgeNodes.id }),
    );

    expect(deletedRows).toHaveLength(0);

    const [row] = await context.adminSql`
      SELECT id
      FROM knowledge_nodes
      WHERE id = ${fixture.knowledgeNodeTwoId}
    `;

    expect(row?.id).toBe(fixture.knowledgeNodeTwoId);
  });

  it('没有 tenant context 时 SELECT 返回空数组', async () => {
    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.query.knowledgeNodes.findMany(),
    );

    expect(rows).toEqual([]);
  });
});
