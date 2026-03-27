import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterventionPolicyService,
  SYSTEM_DEFAULT_POLICY,
} from '../intervention-policy.service';

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
});
