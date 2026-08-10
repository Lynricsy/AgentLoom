import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogService } from '../evidence/audit-log.service';
import type { ResourceGovernanceStateResponseDto } from './dto/resource-governance-response.dto';
import { OrganizationNotFoundException } from '../organization/organization.exceptions';
import { ResourceGovernanceAccessDeniedException } from './resource-governance.exceptions';
import { ResourceGovernanceEventName } from './resource-governance.events';
import {
  ResourceGovernanceService,
  SYSTEM_DEFAULT_EXECUTION_GOVERNANCE,
  SYSTEM_DEFAULT_TENANT_QUOTA,
} from './resource-governance.service';

const ORG_ID = '019577a0-0000-7000-8000-000000001001';
const OWNER_ID = '019577a0-0000-7000-8000-000000001002';
const ADMIN_ID = '019577a0-0000-7000-8000-000000001003';
const CREATOR_ID = '019577a0-0000-7000-8000-000000001004';
const TENANT_ID = '019577a0-0000-7000-8000-000000001005';
const NOW = new Date('2026-03-18T00:00:00.000Z');

function createInsertChain(result: unknown[] = []) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[] = []) {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function createDeleteChain() {
  const chain = {
    where: vi.fn().mockResolvedValue(undefined),
  };
  return chain;
}

function createSelectCountChain(count: number) {
  const chain = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue([{ count }]),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

function makeOrganization(
  overrides: Partial<{
    id: string;
    tenantId: string;
  }> = {},
) {
  return {
    id: ORG_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function makeMembership(
  overrides: Partial<{
    organizationId: string;
    userId: string;
    role: 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';
  }> = {},
) {
  return {
    organizationId: ORG_ID,
    userId: OWNER_ID,
    role: 'owner' as const,
    ...overrides,
  };
}

function makeQuota(
  overrides: Partial<{
    id: string;
    organizationId: string;
    tenantId: string;
    apiRateLimitPerMinute: number;
    maxConcurrentExecutions: number | null;
    dailyExecutionLimit: number | null;
    dailyApiCallLimit: number | null;
    storageQuotaMb: number | null;
    maxSandboxCpuPercent: number | null;
    maxSandboxMemoryMb: number | null;
    version: number;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: '019577a0-0000-7000-8000-000000001006',
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    apiRateLimitPerMinute: 100,
    maxConcurrentExecutions: null,
    dailyExecutionLimit: null,
    dailyApiCallLimit: null,
    storageQuotaMb: null,
    maxSandboxCpuPercent: null,
    maxSandboxMemoryMb: null,
    version: 1,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeGovernanceControl(
  overrides: Partial<{
    id: string;
    organizationId: string;
    tenantId: string;
    scope: 'tenant' | 'workflow';
    targetId: string;
    status: 'active' | 'paused';
    reason: string | null;
    version: number;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: '019577a0-0000-7000-8000-000000001007',
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    scope: 'tenant' as const,
    targetId: TENANT_ID,
    status: 'active' as const,
    reason: null,
    version: 1,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ResourceGovernanceService', () => {
  let service: ResourceGovernanceService;
  let db: {
    query: {
      organizations: { findFirst: ReturnType<typeof vi.fn> };
      organizationMembers: { findFirst: ReturnType<typeof vi.fn> };
      tenantQuotas: { findFirst: ReturnType<typeof vi.fn> };
      executionGovernanceControls: { findMany: ReturnType<typeof vi.fn> };
    };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
  let auditLogService: { record: ReturnType<typeof vi.fn> };
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = {
      query: {
        organizations: { findFirst: vi.fn() },
        organizationMembers: { findFirst: vi.fn() },
        tenantQuotas: { findFirst: vi.fn() },
        executionGovernanceControls: { findMany: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
      select: vi.fn(),
    };

    db.transaction.mockImplementation(
      async (callback: (tx: typeof db) => unknown) => callback(db),
    );

    auditLogService = {
      record: vi.fn().mockResolvedValue(null),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    service = new ResourceGovernanceService(
      db as unknown as ConstructorParameters<
        typeof ResourceGovernanceService
      >[0],
      auditLogService as unknown as AuditLogService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('getEffectiveState', () => {
    it('returns default effective quota and governance state when no stored rows exist', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({ userId: ADMIN_ID, role: 'admin' }),
      );
      db.query.tenantQuotas.findFirst.mockResolvedValue(null);
      db.query.executionGovernanceControls.findMany.mockResolvedValue([]);

      await expect(
        service.getEffectiveState(ORG_ID, ADMIN_ID),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        quota: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          ...SYSTEM_DEFAULT_TENANT_QUOTA,
          version: 0,
        },
        governance: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          tenantControl: {
            scope: 'tenant',
            targetId: TENANT_ID,
            status: SYSTEM_DEFAULT_EXECUTION_GOVERNANCE.tenantControlStatus,
            reason: null,
            updatedAt: null,
            updatedBy: null,
          },
          workflowControls: [],
          version: 0,
        },
      });
    });

    it('throws when the target organization does not exist', async () => {
      db.query.organizations.findFirst.mockResolvedValue(null);

      await expect(
        service.getEffectiveState(ORG_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(OrganizationNotFoundException);
    });

    it('rejects non-owner and non-admin access', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({ userId: CREATOR_ID, role: 'creator' }),
      );

      await expect(
        service.getEffectiveState(ORG_ID, CREATOR_ID),
      ).rejects.toBeInstanceOf(ResourceGovernanceAccessDeniedException);
    });
  });

  describe('upsertTenantQuota', () => {
    it('inserts a new tenant quota row and records an audit event', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({ userId: ADMIN_ID, role: 'admin' }),
      );
      db.query.tenantQuotas.findFirst.mockResolvedValue(null);
      db.insert.mockReturnValue(
        createInsertChain([
          makeQuota({
            apiRateLimitPerMinute: 180,
            maxConcurrentExecutions: 8,
            dailyExecutionLimit: 1200,
            dailyApiCallLimit: 2400,
            storageQuotaMb: 4096,
            maxSandboxCpuPercent: 80,
            maxSandboxMemoryMb: 2048,
          }),
        ]),
      );

      await expect(
        service.upsertTenantQuota(
          ORG_ID,
          {
            apiRateLimitPerMinute: 180,
            maxConcurrentExecutions: 8,
            dailyExecutionLimit: 1200,
            dailyApiCallLimit: 2400,
            storageQuotaMb: 4096,
            maxSandboxCpuPercent: 80,
            maxSandboxMemoryMb: 2048,
          },
          ADMIN_ID,
        ),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        apiRateLimitPerMinute: 180,
        maxConcurrentExecutions: 8,
        dailyExecutionLimit: 1200,
        dailyApiCallLimit: 2400,
        storageQuotaMb: 4096,
        maxSandboxCpuPercent: 80,
        maxSandboxMemoryMb: 2048,
        version: 1,
        createdBy: OWNER_ID,
        updatedBy: OWNER_ID,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.update).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: ADMIN_ID,
          actorType: 'user',
          eventType: 'resource-governance.quota.updated',
          resourceType: 'organization',
          resourceId: ORG_ID,
          summary: 'Tenant quota updated',
          before: {
            ...SYSTEM_DEFAULT_TENANT_QUOTA,
            version: 0,
          },
          after: {
            apiRateLimitPerMinute: 180,
            maxConcurrentExecutions: 8,
            dailyExecutionLimit: 1200,
            dailyApiCallLimit: 2400,
            storageQuotaMb: 4096,
            maxSandboxCpuPercent: 80,
            maxSandboxMemoryMb: 2048,
            version: 1,
          },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceGovernanceEventName.QUOTA_UPDATED,
        expect.objectContaining({
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          actor: {
            actorId: ADMIN_ID,
            actorType: 'user',
          },
          quota: expect.objectContaining({
            apiRateLimitPerMinute: 180,
          }),
        }),
      );
    });

    it('updates an existing tenant quota row and records an audit event', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.tenantQuotas.findFirst.mockResolvedValue(
        makeQuota({
          apiRateLimitPerMinute: 120,
          maxConcurrentExecutions: 4,
          dailyExecutionLimit: 500,
          dailyApiCallLimit: 900,
          storageQuotaMb: 1024,
          maxSandboxCpuPercent: 70,
          maxSandboxMemoryMb: 1536,
          version: 3,
        }),
      );
      db.update.mockReturnValue(
        createUpdateChain([
          makeQuota({
            apiRateLimitPerMinute: 140,
            maxConcurrentExecutions: 6,
            dailyExecutionLimit: 700,
            dailyApiCallLimit: 1400,
            storageQuotaMb: 2048,
            maxSandboxCpuPercent: 75,
            maxSandboxMemoryMb: 1792,
            version: 4,
          }),
        ]),
      );

      await expect(
        service.upsertTenantQuota(
          ORG_ID,
          {
            apiRateLimitPerMinute: 140,
            maxConcurrentExecutions: 6,
            dailyExecutionLimit: 700,
            dailyApiCallLimit: 1400,
            storageQuotaMb: 2048,
            maxSandboxCpuPercent: 75,
            maxSandboxMemoryMb: 1792,
          },
          OWNER_ID,
        ),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        apiRateLimitPerMinute: 140,
        maxConcurrentExecutions: 6,
        dailyExecutionLimit: 700,
        dailyApiCallLimit: 1400,
        storageQuotaMb: 2048,
        maxSandboxCpuPercent: 75,
        maxSandboxMemoryMb: 1792,
        version: 4,
        createdBy: OWNER_ID,
        updatedBy: OWNER_ID,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'resource-governance.quota.updated',
          resourceId: ORG_ID,
          actorId: OWNER_ID,
          before: {
            apiRateLimitPerMinute: 120,
            maxConcurrentExecutions: 4,
            dailyExecutionLimit: 500,
            dailyApiCallLimit: 900,
            storageQuotaMb: 1024,
            maxSandboxCpuPercent: 70,
            maxSandboxMemoryMb: 1536,
            version: 3,
          },
          after: {
            apiRateLimitPerMinute: 140,
            maxConcurrentExecutions: 6,
            dailyExecutionLimit: 700,
            dailyApiCallLimit: 1400,
            storageQuotaMb: 2048,
            maxSandboxCpuPercent: 75,
            maxSandboxMemoryMb: 1792,
            version: 4,
          },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceGovernanceEventName.QUOTA_UPDATED,
        expect.objectContaining({
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          actor: {
            actorId: OWNER_ID,
            actorType: 'user',
          },
          quota: expect.objectContaining({
            apiRateLimitPerMinute: 140,
          }),
        }),
      );
    });

    it('returns stored governance controls when a control row exists alongside quotas', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.tenantQuotas.findFirst.mockResolvedValue(
        makeQuota({ apiRateLimitPerMinute: 160, version: 2 }),
      );
      db.query.executionGovernanceControls.findMany.mockResolvedValue([
        makeGovernanceControl({
          scope: 'tenant',
          targetId: TENANT_ID,
          status: 'paused',
          reason: 'tenant maintenance',
          version: 3,
        }),
        makeGovernanceControl({
          id: '019577a0-0000-7000-8000-000000001099',
          scope: 'workflow',
          targetId: '019577a0-0000-7000-8000-000000009999',
          status: 'paused',
          reason: 'maintenance',
          version: 4,
        }),
      ]);

      await expect(
        service.getEffectiveState(ORG_ID, OWNER_ID),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        quota: expect.objectContaining({
          organizationId: ORG_ID,
          apiRateLimitPerMinute: 160,
          version: 2,
        }),
        governance: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          tenantControl: {
            scope: 'tenant',
            targetId: TENANT_ID,
            status: 'paused',
            reason: 'tenant maintenance',
            updatedAt: NOW.toISOString(),
            updatedBy: OWNER_ID,
          },
          workflowControls: [
            {
              scope: 'workflow',
              targetId: '019577a0-0000-7000-8000-000000009999',
              status: 'paused',
              reason: 'maintenance',
              updatedAt: NOW.toISOString(),
              updatedBy: OWNER_ID,
            },
          ],
          version: 4,
        },
      });
    });
  });

  describe('upsertExecutionGovernanceControls', () => {
    it('upserts tenant and workflow governance controls and records an audit event', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({ userId: ADMIN_ID, role: 'admin' }),
      );
      db.query.executionGovernanceControls.findMany.mockResolvedValue([]);
      db.insert
        .mockReturnValueOnce(
          createInsertChain([
            makeGovernanceControl({
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'paused',
              reason: 'incident response',
              createdBy: ADMIN_ID,
              updatedBy: ADMIN_ID,
            }),
          ]),
        )
        .mockReturnValueOnce(
          createInsertChain([
            makeGovernanceControl({
              id: '019577a0-0000-7000-8000-000000001088',
              scope: 'workflow',
              targetId: '019577a0-0000-7000-8000-000000009999',
              status: 'paused',
              reason: 'workflow anomaly',
              createdBy: ADMIN_ID,
              updatedBy: ADMIN_ID,
            }),
          ]),
        );
      db.delete.mockReturnValue(createDeleteChain());

      await expect(
        service.upsertExecutionGovernanceControls(
          ORG_ID,
          {
            tenantControl: {
              status: 'paused',
              reason: 'incident response',
            },
            workflowControls: [
              {
                scope: 'workflow',
                targetId: '019577a0-0000-7000-8000-000000009999',
                status: 'paused',
                reason: 'workflow anomaly',
              },
            ],
          },
          ADMIN_ID,
        ),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        tenantControl: {
          scope: 'tenant',
          targetId: TENANT_ID,
          status: 'paused',
          reason: 'incident response',
          updatedAt: NOW.toISOString(),
          updatedBy: ADMIN_ID,
        },
        workflowControls: [
          {
            scope: 'workflow',
            targetId: '019577a0-0000-7000-8000-000000009999',
            status: 'paused',
            reason: 'workflow anomaly',
            updatedAt: NOW.toISOString(),
            updatedBy: ADMIN_ID,
          },
        ],
        version: 1,
      });

      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'resource-governance.controls.updated',
          resourceId: ORG_ID,
          actorId: ADMIN_ID,
          before: {
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'active',
              reason: null,
              updatedAt: null,
              updatedBy: null,
            },
            workflowControls: [],
            version: 0,
          },
          after: {
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'paused',
              reason: 'incident response',
              updatedAt: NOW.toISOString(),
              updatedBy: ADMIN_ID,
            },
            workflowControls: [
              {
                scope: 'workflow',
                targetId: '019577a0-0000-7000-8000-000000009999',
                status: 'paused',
                reason: 'workflow anomaly',
                updatedAt: NOW.toISOString(),
                updatedBy: ADMIN_ID,
              },
            ],
            version: 1,
          },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceGovernanceEventName.CONTROLS_UPDATED,
        expect.objectContaining({
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          actor: {
            actorId: ADMIN_ID,
            actorType: 'user',
          },
          governance: expect.objectContaining({
            tenantControl: expect.objectContaining({
              status: 'paused',
            }),
          }),
        }),
      );
    });
  });

  describe('recordBlockedDecision', () => {
    it('records blocked API decisions with nullable system actors', async () => {
      await service.recordBlockedDecision({
        tenantId: TENANT_ID,
        actorId: null,
        actorType: 'system',
        block: {
          decision: 'blocked',
          action: 'api_request',
          category: 'api_rate_limit',
          scope: 'api',
          reason: 'tenant daily API quota has been exceeded',
          effectiveState: {
            organizationId: ORG_ID,
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'active',
              reason: null,
              updatedAt: null,
              updatedBy: null,
            },
            workflowControl: null,
          },
          blockedAt: NOW.toISOString(),
          metadata: {
            metric: 'dailyApiCallLimit',
            limit: 2,
            currentValue: 3,
          },
        },
      });

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: null,
          actorType: 'system',
          eventType: 'resource-governance.api-request.blocked',
          resourceId: ORG_ID,
          metadata: expect.objectContaining({
            block: expect.objectContaining({
              action: 'api_request',
            }),
          }),
        }),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        ResourceGovernanceEventName.EXECUTION_START_BLOCKED,
        expect.anything(),
      );
    });

    it('emits a governance event for blocked execution starts', async () => {
      await service.recordBlockedDecision({
        tenantId: TENANT_ID,
        actorId: ADMIN_ID,
        actorType: 'user',
        block: {
          decision: 'blocked',
          action: 'execution_start',
          category: 'workflow_pause',
          scope: 'workflow',
          reason:
            'workflow governance pause is preventing new workflow executions',
          effectiveState: {
            organizationId: ORG_ID,
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'active',
              reason: null,
              updatedAt: null,
              updatedBy: null,
            },
            workflowControl: {
              scope: 'workflow',
              targetId: '019577a0-0000-7000-8000-000000001500',
              status: 'paused',
              reason: 'workflow anomaly',
              updatedAt: NOW.toISOString(),
              updatedBy: ADMIN_ID,
            },
          },
          blockedAt: NOW.toISOString(),
          metadata: {
            workflowId: '019577a0-0000-7000-8000-000000001500',
          },
        },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceGovernanceEventName.EXECUTION_START_BLOCKED,
        expect.objectContaining({
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          workflowId: '019577a0-0000-7000-8000-000000001500',
          category: 'workflow_pause',
          scope: 'workflow',
        }),
      );
    });
  });

  describe('buildTerminationActionResponse', () => {
    it('builds canonical anomalous termination response metadata', () => {
      expect(
        service.buildTerminationActionResponse({
          organizationId: ORG_ID,
          executionId: '019577a0-0000-7000-8000-000000001500',
          workflowId: '019577a0-0000-7000-8000-000000001501',
          requestedBy: ADMIN_ID,
          reason: 'detected anomalous execution pattern',
          requestedAt: '2026-03-18T00:00:00.000Z',
          effectedAt: '2026-03-18T00:00:05.000Z',
          finalStatus: 'cancelled',
          effectiveState: {
            organizationId: ORG_ID,
            quota: {
              organizationId: ORG_ID,
              tenantId: TENANT_ID,
              ...SYSTEM_DEFAULT_TENANT_QUOTA,
              version: 0,
            },
            governance: {
              organizationId: ORG_ID,
              tenantId: TENANT_ID,
              tenantControl: {
                scope: 'tenant',
                targetId: TENANT_ID,
                status: 'active',
                reason: null,
                updatedAt: null,
                updatedBy: null,
              },
              workflowControls: [],
              version: 0,
            },
          },
        }),
      ).toEqual({
        organizationId: ORG_ID,
        action: 'execution_termination',
        scope: 'execution',
        executionId: '019577a0-0000-7000-8000-000000001500',
        workflowId: '019577a0-0000-7000-8000-000000001501',
        operator: ADMIN_ID,
        requestedAt: '2026-03-18T00:00:00.000Z',
        effectedAt: '2026-03-18T00:00:05.000Z',
        reason: 'detected anomalous execution pattern',
        effectiveState: {
          organizationId: ORG_ID,
          quota: {
            organizationId: ORG_ID,
            tenantId: TENANT_ID,
            ...SYSTEM_DEFAULT_TENANT_QUOTA,
            version: 0,
          },
          governance: {
            organizationId: ORG_ID,
            tenantId: TENANT_ID,
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'active',
              reason: null,
              updatedAt: null,
              updatedBy: null,
            },
            workflowControls: [],
            version: 0,
          },
        },
        affectedSummary: {
          requested: 1,
          affected: 1,
          skipped: 0,
          executionId: '019577a0-0000-7000-8000-000000001500',
          workflowId: '019577a0-0000-7000-8000-000000001501',
          finalStatus: 'cancelled',
          timelineUrl: '/executions/019577a0-0000-7000-8000-000000001500',
        },
        execution: {
          id: '019577a0-0000-7000-8000-000000001500',
          workflowId: '019577a0-0000-7000-8000-000000001501',
          status: 'cancelled',
          timelineUrl: '/executions/019577a0-0000-7000-8000-000000001500',
        },
        metadata: {
          finalStatus: 'cancelled',
          timelineUrl: '/executions/019577a0-0000-7000-8000-000000001500',
        },
      });
    });
  });

  describe('resolveGovernanceEffectedAt', () => {
    it('优先返回 tenant 与 workflow 控制中最新的更新时间', () => {
      expect(
        service.resolveGovernanceEffectedAt(
          {
            organizationId: ORG_ID,
            tenantId: TENANT_ID,
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'active',
              reason: null,
              updatedAt: '2026-03-18T03:00:00.000Z',
              updatedBy: OWNER_ID,
            },
            workflowControls: [
              {
                scope: 'workflow',
                targetId: '019577a0-0000-7000-8000-000000009999',
                status: 'paused',
                reason: 'workflow anomaly',
                updatedAt: '2026-03-18T04:01:00.000Z',
                updatedBy: ADMIN_ID,
              },
            ],
            version: 3,
          },
          NOW.toISOString(),
        ),
      ).toBe('2026-03-18T04:01:00.000Z');
    });

    it('在所有治理控制都没有更新时间时回退到请求时间', () => {
      expect(
        service.resolveGovernanceEffectedAt(
          {
            organizationId: ORG_ID,
            tenantId: TENANT_ID,
            tenantControl: {
              scope: 'tenant',
              targetId: TENANT_ID,
              status: 'active',
              reason: null,
              updatedAt: null,
              updatedBy: null,
            },
            workflowControls: [],
            version: 0,
          },
          NOW.toISOString(),
        ),
      ).toBe(NOW.toISOString());
    });
  });

  describe('runtime admission and quota precedence', () => {
    const WORKFLOW_ID = '019577a0-0000-7000-8000-000000001500';

    function makeRuntimeState(
      quota: Partial<ResourceGovernanceStateResponseDto['quota']> = {},
      controls: ReturnType<typeof makeGovernanceControl>[] = [],
    ) {
      const tenant = controls.find(
        (control) =>
          control.scope === 'tenant' && control.targetId === TENANT_ID,
      );
      return {
        organizationId: ORG_ID,
        quota: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          ...SYSTEM_DEFAULT_TENANT_QUOTA,
          ...quota,
          version: 1,
        },
        governance: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          tenantControl: tenant
            ? {
                scope: 'tenant' as const,
                targetId: TENANT_ID,
                status: tenant.status,
                reason: tenant.reason,
                updatedAt: NOW.toISOString(),
                updatedBy: OWNER_ID,
              }
            : {
                scope: 'tenant' as const,
                targetId: TENANT_ID,
                status: 'active' as const,
                reason: null,
                updatedAt: null,
                updatedBy: null,
              },
          workflowControls: controls
            .filter((control) => control.scope === 'workflow')
            .map((control) => ({
              scope: 'workflow' as const,
              targetId: control.targetId,
              status: control.status,
              reason: control.reason,
              updatedAt: NOW.toISOString(),
              updatedBy: OWNER_ID,
            })),
          version: controls.length,
        },
      };
    }

    it('returns null when a tenant has no organization and maps stored runtime state otherwise', async () => {
      db.query.organizations.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeOrganization());
      db.query.tenantQuotas.findFirst.mockResolvedValueOnce(
        makeQuota({ storageQuotaMb: 512, maxSandboxCpuPercent: 65 }),
      );
      db.query.executionGovernanceControls.findMany.mockResolvedValueOnce([
        makeGovernanceControl({
          scope: 'workflow',
          targetId: WORKFLOW_ID,
          status: 'paused',
        }),
      ]);
      const runtimeDb = {
        ...db,
        execute: vi.fn(),
      };

      await expect(
        service.resolveRuntimeStateForTenant(TENANT_ID, runtimeDb as never),
      ).resolves.toBeNull();
      await expect(
        service.resolveRuntimeStateForTenant(TENANT_ID, runtimeDb as never),
      ).resolves.toMatchObject({
        quota: {
          storageQuotaMb: 512,
          maxSandboxCpuPercent: 65,
        },
        governance: {
          workflowControls: [{ targetId: WORKFLOW_ID, status: 'paused' }],
        },
      });
    });

    it('gives tenant pause precedence over workflow and quota checks', async () => {
      vi.spyOn(service, 'resolveRuntimeStateForTenant').mockResolvedValueOnce(
        makeRuntimeState(
          { maxConcurrentExecutions: 1, dailyExecutionLimit: 1 },
          [
            makeGovernanceControl({
              status: 'paused',
              reason: null,
            }),
            makeGovernanceControl({
              scope: 'workflow',
              targetId: WORKFLOW_ID,
              status: 'paused',
            }),
          ],
        ),
      );

      await expect(
        service.resolveExecutionAdmissionDecision({
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
          dbClient: db as never,
        }),
      ).resolves.toMatchObject({
        category: 'tenant_pause',
        scope: 'tenant',
        reason: 'tenant governance pause is preventing new workflow executions',
        metadata: { workflowId: WORKFLOW_ID },
      });
      expect(db.select).not.toHaveBeenCalled();
    });

    it('gives workflow pause precedence over concurrency and preserves its reason', async () => {
      vi.spyOn(service, 'resolveRuntimeStateForTenant').mockResolvedValueOnce(
        makeRuntimeState({ maxConcurrentExecutions: 1 }, [
          makeGovernanceControl({
            scope: 'workflow',
            targetId: WORKFLOW_ID,
            status: 'paused',
            reason: 'operator pause',
          }),
        ]),
      );

      await expect(
        service.resolveExecutionAdmissionDecision({
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
          dbClient: db as never,
        }),
      ).resolves.toMatchObject({
        category: 'workflow_pause',
        scope: 'workflow',
        reason: 'operator pause',
      });
      expect(db.select).not.toHaveBeenCalled();
    });

    it('blocks concurrency before evaluating the daily quota', async () => {
      vi.spyOn(service, 'resolveRuntimeStateForTenant').mockResolvedValueOnce(
        makeRuntimeState({
          maxConcurrentExecutions: 3,
          dailyExecutionLimit: 10,
        }),
      );
      db.select.mockReturnValueOnce(createSelectCountChain(3));

      await expect(
        service.resolveExecutionAdmissionDecision({
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
          dbClient: db as never,
        }),
      ).resolves.toMatchObject({
        category: 'execution_quota',
        metadata: {
          metric: 'maxConcurrentExecutions',
          limit: 3,
          currentValue: 3,
        },
      });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('blocks the UTC daily quota after concurrency passes', async () => {
      vi.spyOn(service, 'resolveRuntimeStateForTenant').mockResolvedValueOnce(
        makeRuntimeState({
          maxConcurrentExecutions: 3,
          dailyExecutionLimit: 4,
        }),
      );
      db.select
        .mockReturnValueOnce(createSelectCountChain(2))
        .mockReturnValueOnce(createSelectCountChain(4));

      await expect(
        service.resolveExecutionAdmissionDecision({
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
          now: new Date('2026-03-18T19:30:00.000Z'),
          dbClient: db as never,
        }),
      ).resolves.toMatchObject({
        category: 'execution_quota',
        metadata: {
          metric: 'dailyExecutionLimit',
          limit: 4,
          currentValue: 4,
        },
      });
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('allows execution when nullable limits are disabled', async () => {
      vi.spyOn(service, 'resolveRuntimeStateForTenant').mockResolvedValueOnce(
        makeRuntimeState(),
      );
      db.select
        .mockReturnValueOnce(createSelectCountChain(999))
        .mockReturnValueOnce(createSelectCountChain(999));

      await expect(
        service.resolveExecutionAdmissionDecision({
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
          dbClient: db as never,
        }),
      ).resolves.toBeNull();
    });

    it('returns null without querying counts when runtime state is unavailable', async () => {
      vi.spyOn(service, 'resolveRuntimeStateForTenant').mockResolvedValueOnce(
        null,
      );

      await expect(
        service.resolveExecutionAdmissionDecision({
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
          dbClient: db as never,
        }),
      ).resolves.toBeNull();
      expect(db.select).not.toHaveBeenCalled();
    });

    it('preserves omitted quotas while allowing explicit null to disable storage and sandbox limits', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.tenantQuotas.findFirst.mockResolvedValue(
        makeQuota({
          apiRateLimitPerMinute: 120,
          maxConcurrentExecutions: 8,
          dailyExecutionLimit: 20,
          dailyApiCallLimit: 50,
          storageQuotaMb: 2048,
          maxSandboxCpuPercent: 80,
          maxSandboxMemoryMb: 4096,
        }),
      );
      const updateChain = createUpdateChain([
        makeQuota({
          apiRateLimitPerMinute: 120,
          maxConcurrentExecutions: 8,
          dailyExecutionLimit: 20,
          dailyApiCallLimit: 50,
          storageQuotaMb: null,
          maxSandboxCpuPercent: null,
          maxSandboxMemoryMb: null,
          version: 2,
        }),
      ]);
      db.update.mockReturnValue(updateChain);

      await service.upsertTenantQuota(
        ORG_ID,
        {
          storageQuotaMb: null,
          maxSandboxCpuPercent: null,
          maxSandboxMemoryMb: null,
        },
        OWNER_ID,
      );

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          apiRateLimitPerMinute: 120,
          maxConcurrentExecutions: 8,
          dailyExecutionLimit: 20,
          dailyApiCallLimit: 50,
          storageQuotaMb: null,
          maxSandboxCpuPercent: null,
          maxSandboxMemoryMb: null,
        }),
      );
    });
  });

  describe('governance update replacement and action scope', () => {
    const WORKFLOW_A = '019577a0-0000-7000-8000-000000001701';
    const WORKFLOW_B = '019577a0-0000-7000-8000-000000001702';

    it('updates existing controls, removes stale workflow scopes, and retains deterministic ordering', async () => {
      const tenantControl = makeGovernanceControl({
        id: '019577a0-0000-7000-8000-000000001710',
        status: 'paused',
        reason: 'old tenant pause',
      });
      const workflowA = makeGovernanceControl({
        id: '019577a0-0000-7000-8000-000000001711',
        scope: 'workflow',
        targetId: WORKFLOW_A,
        status: 'paused',
        reason: 'old workflow pause',
      });
      const workflowB = makeGovernanceControl({
        id: '019577a0-0000-7000-8000-000000001712',
        scope: 'workflow',
        targetId: WORKFLOW_B,
        status: 'paused',
        reason: 'stale workflow pause',
      });
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.executionGovernanceControls.findMany.mockResolvedValue([
        tenantControl,
        workflowB,
        workflowA,
      ]);
      db.delete.mockReturnValue(createDeleteChain());
      db.update
        .mockReturnValueOnce(
          createUpdateChain([
            makeGovernanceControl({
              ...tenantControl,
              status: 'active',
              reason: null,
              version: 2,
            }),
          ]),
        )
        .mockReturnValueOnce(
          createUpdateChain([
            makeGovernanceControl({
              ...workflowA,
              status: 'active',
              reason: 'restored',
              version: 3,
            }),
          ]),
        );

      const result = await service.upsertExecutionGovernanceControls(
        ORG_ID,
        {
          tenantControl: { status: 'active', reason: null },
          workflowControls: [
            {
              scope: 'workflow',
              targetId: WORKFLOW_A,
              status: 'active',
              reason: 'restored',
            },
          ],
        },
        OWNER_ID,
      );

      expect(db.update).toHaveBeenCalledTimes(2);
      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        tenantControl: { status: 'active', reason: null },
        workflowControls: [
          { targetId: WORKFLOW_A, status: 'active', reason: 'restored' },
        ],
        version: 3,
      });
      expect(result.workflowControls).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ targetId: WORKFLOW_B }),
        ]),
      );
    });

    it('uses workflow action scope only when workflow targets are the sole update', () => {
      const effectiveState = {
        organizationId: ORG_ID,
        quota: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          ...SYSTEM_DEFAULT_TENANT_QUOTA,
          version: 0,
        },
        governance: {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          tenantControl: {
            scope: 'tenant' as const,
            targetId: TENANT_ID,
            status: 'active' as const,
            reason: null,
            updatedAt: null,
            updatedBy: null,
          },
          workflowControls: [],
          version: 0,
        },
      };

      expect(
        service.buildGovernanceActionResponse({
          organizationId: ORG_ID,
          requestedBy: OWNER_ID,
          requestedAt: NOW.toISOString(),
          effectedAt: NOW.toISOString(),
          reason: 'workflow maintenance',
          effectiveState,
          workflowTargetIds: [WORKFLOW_A, WORKFLOW_B],
          tenantControlUpdated: false,
        }),
      ).toMatchObject({
        scope: 'workflow',
        affectedSummary: {
          requested: 2,
          affected: 2,
          skipped: 0,
          workflowTargetIds: [WORKFLOW_A, WORKFLOW_B],
        },
        metadata: { tenantControlUpdated: false },
      });

      expect(
        service.buildGovernanceActionResponse({
          organizationId: ORG_ID,
          requestedBy: null,
          requestedAt: NOW.toISOString(),
          effectedAt: NOW.toISOString(),
          reason: null,
          effectiveState,
          workflowTargetIds: [],
          tenantControlUpdated: false,
        }).scope,
      ).toBe('tenant');
    });
  });
});
