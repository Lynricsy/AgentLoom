import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { WorkflowNotFoundException } from '../../workflow-definition/workflow-version.exceptions';
import {
  InterventionPolicyConflictException,
  InterventionPolicyNotFoundException,
} from '../intervention-policy.exceptions';
import {
  InterventionPolicyService,
  SYSTEM_DEFAULT_POLICY,
} from '../intervention-policy.service';

const OTHER_WORKFLOW_ID = '019577a0-0000-7000-8000-000000000200';
const POLICY_ID = '019577a0-0000-7000-8000-000000000101';
const USER_ID = '019577a0-0000-7000-8000-000000000102';

const CREATE_DTO = {
  nodeId: null,
  allowedRoles: ['owner', 'admin'] as Array<'owner' | 'admin'>,
  timeoutSeconds: 86400,
  timeoutAction: 'reject' as const,
  escalateToRole: null,
  notifyChannels: ['in_app'] as Array<'in_app'>,
  isActive: true,
};

function createInsertChain(returning: Mock) {
  return { values: vi.fn().mockReturnValue({ returning }) };
}

function createMutationChain(result: unknown) {
  const where = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(result),
  });
  return {
    where,
    set: vi.fn().mockReturnValue({ where }),
  };
}

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const WORKFLOW_ID = '019577a0-0000-7000-8000-000000000100';
const NODE_ID = 'node-review';
const NOW = new Date('2025-01-01T00:00:00Z');

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makePolicy(
  overrides: Partial<{
    id: string;
    workflowId: string;
    tenantId: string;
    nodeId: string | null;
    allowedRoles: string[];
    timeoutSeconds: number;
    timeoutAction: string;
    escalateToRole: string | null;
    notifyChannels: string[];
    isActive: boolean;
    version: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: '019577a0-0000-7000-8000-000000000101',
    workflowId: WORKFLOW_ID,
    tenantId: TENANT_ID,
    nodeId: null,
    allowedRoles: ['owner', 'admin'],
    timeoutSeconds: 1800,
    timeoutAction: 'reject',
    escalateToRole: null,
    notifyChannels: ['in_app'],
    isActive: true,
    version: 1,
    createdBy: '019577a0-0000-7000-8000-000000000102',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('InterventionPolicyService', () => {
  let service: InterventionPolicyService;
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    service = new InterventionPolicyService(
      db as unknown as ConstructorParameters<
        typeof InterventionPolicyService
      >[0],
    );
  });

  describe('resolvePolicy', () => {
    it('优先返回节点级策略而不是工作流级策略', async () => {
      const nodePolicy = makePolicy({
        nodeId: NODE_ID,
        allowedRoles: ['owner'],
        timeoutSeconds: 900,
        timeoutAction: 'escalate',
        escalateToRole: 'admin',
        notifyChannels: ['in_app', 'push'],
      });

      db.select.mockReturnValueOnce(createSelectChain([nodePolicy]));

      await expect(
        service.resolvePolicy(TENANT_ID, WORKFLOW_ID, NODE_ID),
      ).resolves.toEqual({
        allowedRoles: ['owner'],
        timeoutSeconds: 900,
        timeoutAction: 'escalate',
        escalateToRole: 'admin',
        notifyChannels: ['in_app', 'push'],
        source: 'node',
      });

      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('节点级策略不存在时回退到工作流级策略', async () => {
      const workflowPolicy = makePolicy({
        allowedRoles: ['owner', 'creator'],
        timeoutSeconds: 1200,
        timeoutAction: 'approve',
        notifyChannels: ['push'],
      });

      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([workflowPolicy]));

      await expect(
        service.resolvePolicy(TENANT_ID, WORKFLOW_ID, NODE_ID),
      ).resolves.toEqual({
        allowedRoles: ['owner', 'creator'],
        timeoutSeconds: 1200,
        timeoutAction: 'approve',
        escalateToRole: null,
        notifyChannels: ['push'],
        source: 'workflow',
      });
    });

    it('节点级与工作流级都不存在时返回扁平系统默认策略', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.resolvePolicy(TENANT_ID, WORKFLOW_ID, NODE_ID),
      ).resolves.toEqual({
        ...SYSTEM_DEFAULT_POLICY,
        source: 'system_default',
      });
    });
  });

  describe('create', () => {
    it('工作流不存在（含他租户工作流）时抛出 WorkflowNotFoundException 且不插入', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.create(TENANT_ID, USER_ID, WORKFLOW_ID, CREATE_DTO),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('同一工作流重复创建工作流级策略时把被 Drizzle 包装的 23505 映射为 409', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ id: WORKFLOW_ID }]));
      const wrapped = Object.assign(new Error('Failed query: insert ...'), {
        cause: Object.assign(new Error('duplicate key value'), {
          code: '23505',
          constraint_name: 'uq_intervention_policies_workflow_node',
        }),
      });
      db.insert.mockReturnValueOnce(
        createInsertChain(vi.fn().mockRejectedValue(wrapped)),
      );

      await expect(
        service.create(TENANT_ID, USER_ID, WORKFLOW_ID, CREATE_DTO),
      ).rejects.toBeInstanceOf(InterventionPolicyConflictException);
    });

    it('使用路由中的 workflowId 写入策略', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ id: WORKFLOW_ID }]));
      const insertChain = createInsertChain(
        vi.fn().mockResolvedValue([makePolicy()]),
      );
      db.insert.mockReturnValueOnce(insertChain);

      await service.create(TENANT_ID, USER_ID, WORKFLOW_ID, CREATE_DTO);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: WORKFLOW_ID,
          tenantId: TENANT_ID,
        }),
      );
    });
  });

  describe('按路由 workflowId 限定策略', () => {
    it('findById 的查询条件包含路由 workflowId，跨工作流读取返回 404', async () => {
      const chain = createSelectChain([]);
      db.select.mockReturnValueOnce(chain);

      await expect(
        service.findById(TENANT_ID, OTHER_WORKFLOW_ID, POLICY_ID),
      ).rejects.toBeInstanceOf(InterventionPolicyNotFoundException);

      const where = chain.from.mock.results[0].value.where.mock.calls[0][0];
      expect(new PgDialect().sqlToQuery(where).params).toEqual(
        expect.arrayContaining([TENANT_ID, OTHER_WORKFLOW_ID, POLICY_ID]),
      );
    });

    it('update 的条件包含路由 workflowId，跨工作流更新返回 404', async () => {
      const updateChain = createMutationChain([]);
      db.update.mockReturnValueOnce(updateChain);
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.update(TENANT_ID, OTHER_WORKFLOW_ID, POLICY_ID, {
          isActive: false,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(InterventionPolicyNotFoundException);

      expect(
        new PgDialect().sqlToQuery(updateChain.where.mock.calls[0][0]).params,
      ).toEqual(expect.arrayContaining([OTHER_WORKFLOW_ID, POLICY_ID]));
    });

    it('remove 的条件包含路由 workflowId，跨工作流删除返回 404', async () => {
      const deleteChain = createMutationChain([]);
      db.delete.mockReturnValueOnce(deleteChain);

      await expect(
        service.remove(TENANT_ID, OTHER_WORKFLOW_ID, POLICY_ID),
      ).rejects.toBeInstanceOf(InterventionPolicyNotFoundException);

      expect(
        new PgDialect().sqlToQuery(deleteChain.where.mock.calls[0][0]).params,
      ).toEqual(expect.arrayContaining([OTHER_WORKFLOW_ID, POLICY_ID]));
    });
  });

  describe('findAll', () => {
    it('工作流不存在或属于他租户时 404，不再返回空列表', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.findAll(TENANT_ID, WORKFLOW_ID, { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('按 page/pageSize 计算 offset 与 totalPages', async () => {
      const offset = vi.fn().mockResolvedValue([makePolicy()]);
      db.select
        .mockReturnValueOnce(createSelectChain([{ id: WORKFLOW_ID }]))
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 3 }]),
          }),
        });

      const result = await service.findAll(TENANT_ID, WORKFLOW_ID, {
        page: 2,
        pageSize: 2,
      });

      expect(offset).toHaveBeenCalledWith(2);
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      });
    });
  });
});
