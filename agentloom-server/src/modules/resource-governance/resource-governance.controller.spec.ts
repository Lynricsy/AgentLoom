import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleRef } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ExecutionService } from '../execution/execution.service';
import type { ResourceGovernanceService } from './resource-governance.service';
import { ResourceGovernanceController } from './resource-governance.controller';

const NOW = new Date('2026-03-18T00:00:00.000Z');
const ORGANIZATION_ID = '019577a0-0000-7000-8000-000000001001';
const TENANT_ID = '019577a0-0000-7000-8000-000000001005';
const USER_ID = '019577a0-0000-7000-8000-000000001002';
const EXECUTION_ID = '019577a0-0000-7000-8000-000000001100';
const WORKFLOW_ID = '019577a0-0000-7000-8000-000000001101';

function getMethodRoles(methodName: keyof ResourceGovernanceController) {
  const handler = Object.getOwnPropertyDescriptor(
    ResourceGovernanceController.prototype,
    methodName,
  )?.value;

  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

describe('ResourceGovernanceController', () => {
  let controller: ResourceGovernanceController;
  let service: {
    getEffectiveState: ReturnType<typeof vi.fn>;
    upsertTenantQuota: ReturnType<typeof vi.fn>;
    upsertExecutionGovernanceControls: ReturnType<typeof vi.fn>;
    resolveGovernanceEffectedAt: ReturnType<typeof vi.fn>;
    buildGovernanceActionResponse: ReturnType<typeof vi.fn>;
    finalizeAnomalousExecutionTermination: ReturnType<typeof vi.fn>;
  };
  let executionService: {
    cancelExecution: ReturnType<typeof vi.fn>;
  };
  let moduleRef: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    service = {
      getEffectiveState: vi.fn(),
      upsertTenantQuota: vi.fn(),
      upsertExecutionGovernanceControls: vi.fn(),
      resolveGovernanceEffectedAt: vi.fn(),
      buildGovernanceActionResponse: vi.fn(),
      finalizeAnomalousExecutionTermination: vi.fn(),
    };

    executionService = {
      cancelExecution: vi.fn(),
    };

    moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === ExecutionService) {
          return executionService;
        }

        throw new Error(`Unexpected token: ${String(token)}`);
      }),
    };

    controller = new ResourceGovernanceController(
      service as unknown as ResourceGovernanceService,
      moduleRef as unknown as ModuleRef,
    );
  });

  it('applies owner/admin roles to all resource governance handlers', () => {
    expect(getMethodRoles('getResourceGovernanceState')).toEqual([
      'owner',
      'admin',
    ]);
    expect(getMethodRoles('updateQuota')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('updateControls')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('terminateExecution')).toEqual(['owner', 'admin']);
  });

  it('wraps getResourceGovernanceState responses in a data envelope', async () => {
    service.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      quota: { apiRateLimitPerMinute: 100 },
      governance: { version: 0 },
    });

    const result = await controller.getResourceGovernanceState(
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(service.getEffectiveState).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      USER_ID,
    );
    expect(result).toEqual({
      data: {
        organizationId: ORGANIZATION_ID,
        quota: { apiRateLimitPerMinute: 100 },
        governance: { version: 0 },
      },
    });
  });

  it('passes quota updates through to the service and wraps the response', async () => {
    const dto = { apiRateLimitPerMinute: 180 };
    service.upsertTenantQuota.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      apiRateLimitPerMinute: 180,
      version: 1,
    });

    const result = await controller.updateQuota(
      ORGANIZATION_ID,
      dto as never,
      USER_ID,
    );

    expect(service.upsertTenantQuota).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      dto,
      USER_ID,
    );
    expect(result).toEqual({
      data: {
        organizationId: ORGANIZATION_ID,
        tenantId: TENANT_ID,
        apiRateLimitPerMinute: 180,
        version: 1,
      },
    });
  });

  it('passes governance control updates through to the service and wraps the response', async () => {
    const dto = {
      tenantControl: {
        status: 'paused',
        reason: 'incident response',
      },
    };
    service.upsertExecutionGovernanceControls.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      tenantControl: dto.tenantControl,
      workflowControls: [],
      version: 1,
    });
    service.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      quota: { apiRateLimitPerMinute: 100 },
      governance: { version: 1 },
    });
    service.resolveGovernanceEffectedAt.mockReturnValue(NOW.toISOString());
    service.buildGovernanceActionResponse = vi.fn().mockReturnValue({
      organizationId: ORGANIZATION_ID,
      action: 'governance_update',
      scope: 'tenant',
      operator: USER_ID,
      requestedAt: NOW.toISOString(),
      effectedAt: NOW.toISOString(),
      reason: 'incident response',
      effectiveState: {
        organizationId: ORGANIZATION_ID,
        quota: { apiRateLimitPerMinute: 100 },
        governance: { version: 1 },
      },
      affectedSummary: {
        requested: 1,
        affected: 1,
        skipped: 0,
        workflowTargetIds: [],
      },
      metadata: {
        tenantControlUpdated: true,
      },
    });

    const result = await controller.updateControls(
      ORGANIZATION_ID,
      dto as never,
      USER_ID,
    );

    expect(service.upsertExecutionGovernanceControls).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      dto,
      USER_ID,
    );
    expect(service.getEffectiveState).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      USER_ID,
    );
    expect(service.buildGovernanceActionResponse).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedBy: USER_ID,
      requestedAt: NOW.toISOString(),
      effectedAt: NOW.toISOString(),
      reason: 'incident response',
      effectiveState: {
        organizationId: ORGANIZATION_ID,
        quota: { apiRateLimitPerMinute: 100 },
        governance: { version: 1 },
      },
      workflowTargetIds: [],
      tenantControlUpdated: true,
    });
    expect(result).toEqual({
      data: {
        organizationId: ORGANIZATION_ID,
        action: 'governance_update',
        scope: 'tenant',
        operator: USER_ID,
        requestedAt: NOW.toISOString(),
        effectedAt: NOW.toISOString(),
        reason: 'incident response',
        effectiveState: {
          organizationId: ORGANIZATION_ID,
          quota: { apiRateLimitPerMinute: 100 },
          governance: { version: 1 },
        },
        affectedSummary: {
          requested: 1,
          affected: 1,
          skipped: 0,
          workflowTargetIds: [],
        },
        metadata: {
          tenantControlUpdated: true,
        },
      },
    });
  });

  it('在仅更新 workflow 控制时也应复用统一的 effectedAt 解析逻辑', async () => {
    const dto = {
      workflowControls: [
        {
          scope: 'workflow',
          targetId: WORKFLOW_ID,
          status: 'paused',
          reason: 'workflow anomaly',
        },
      ],
    };
    service.upsertExecutionGovernanceControls.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      tenantControl: {
        scope: 'tenant',
        targetId: TENANT_ID,
        status: 'active',
        reason: null,
        updatedAt: '2026-03-18T03:00:00.000Z',
        updatedBy: USER_ID,
      },
      workflowControls: [
        {
          scope: 'workflow',
          targetId: WORKFLOW_ID,
          status: 'paused',
          reason: 'workflow anomaly',
          updatedAt: '2026-03-18T04:01:00.000Z',
          updatedBy: USER_ID,
        },
      ],
      version: 2,
    });
    service.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      quota: { apiRateLimitPerMinute: 100 },
      governance: { version: 2 },
    });
    service.resolveGovernanceEffectedAt.mockReturnValue(
      '2026-03-18T04:01:00.000Z',
    );
    service.buildGovernanceActionResponse.mockReturnValue({
      organizationId: ORGANIZATION_ID,
      action: 'governance_update',
      scope: 'workflow',
      operator: USER_ID,
      requestedAt: NOW.toISOString(),
      effectedAt: '2026-03-18T04:01:00.000Z',
      reason: 'workflow anomaly',
      effectiveState: {
        organizationId: ORGANIZATION_ID,
        quota: { apiRateLimitPerMinute: 100 },
        governance: { version: 2 },
      },
      affectedSummary: {
        requested: 1,
        affected: 1,
        skipped: 0,
        workflowTargetIds: [WORKFLOW_ID],
      },
      metadata: {
        tenantControlUpdated: false,
      },
    });

    const result = await controller.updateControls(
      ORGANIZATION_ID,
      dto as never,
      USER_ID,
    );

    expect(service.resolveGovernanceEffectedAt).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowControls: [
          expect.objectContaining({
            targetId: WORKFLOW_ID,
            updatedAt: '2026-03-18T04:01:00.000Z',
          }),
        ],
      }),
      NOW.toISOString(),
    );
    expect(service.buildGovernanceActionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        effectedAt: '2026-03-18T04:01:00.000Z',
        workflowTargetIds: [WORKFLOW_ID],
        tenantControlUpdated: false,
      }),
    );
    expect(result).toEqual({
      data: expect.objectContaining({
        scope: 'workflow',
        effectedAt: '2026-03-18T04:01:00.000Z',
      }),
    });
  });

  it('reuses cancelExecution for anomalous termination and returns an action envelope', async () => {
    service.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
    });
    executionService.cancelExecution.mockResolvedValue({
      id: EXECUTION_ID,
      workflowDefinitionId: WORKFLOW_ID,
      status: 'cancelled',
    });
    service.finalizeAnomalousExecutionTermination.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      action: 'execution_termination',
      scope: 'execution',
      executionId: EXECUTION_ID,
      workflowId: WORKFLOW_ID,
      operator: USER_ID,
      requestedAt: NOW.toISOString(),
      effectedAt: NOW.toISOString(),
      reason: 'detected anomalous execution pattern',
      effectiveState: {
        organizationId: ORGANIZATION_ID,
        quota: { apiRateLimitPerMinute: 100 },
        governance: { version: 1 },
      },
      affectedSummary: {
        requested: 1,
        affected: 1,
        skipped: 0,
        executionId: EXECUTION_ID,
        workflowId: WORKFLOW_ID,
        finalStatus: 'cancelled',
        timelineUrl: `/executions/${EXECUTION_ID}`,
      },
      execution: {
        id: EXECUTION_ID,
        workflowId: WORKFLOW_ID,
        status: 'cancelled',
        timelineUrl: `/executions/${EXECUTION_ID}`,
      },
      metadata: {
        finalStatus: 'cancelled',
        timelineUrl: `/executions/${EXECUTION_ID}`,
      },
    });

    const result = await controller.terminateExecution(
      ORGANIZATION_ID,
      EXECUTION_ID,
      { reason: 'detected anomalous execution pattern' } as never,
      TENANT_ID,
      USER_ID,
    );

    expect(service.getEffectiveState).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      USER_ID,
    );
    expect(moduleRef.get).toHaveBeenCalledWith(ExecutionService, {
      strict: false,
    });
    expect(executionService.cancelExecution).toHaveBeenCalledWith(
      EXECUTION_ID,
      TENANT_ID,
    );
    expect(service.finalizeAnomalousExecutionTermination).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      executionId: EXECUTION_ID,
      workflowId: WORKFLOW_ID,
      requestedBy: USER_ID,
      reason: 'detected anomalous execution pattern',
      requestedAt: NOW.toISOString(),
      finalStatus: 'cancelled',
    });
    expect(result).toEqual({
      data: {
        organizationId: ORGANIZATION_ID,
        action: 'execution_termination',
        scope: 'execution',
        executionId: EXECUTION_ID,
        workflowId: WORKFLOW_ID,
        operator: USER_ID,
        requestedAt: NOW.toISOString(),
        effectedAt: NOW.toISOString(),
        reason: 'detected anomalous execution pattern',
        effectiveState: {
          organizationId: ORGANIZATION_ID,
          quota: { apiRateLimitPerMinute: 100 },
          governance: { version: 1 },
        },
        affectedSummary: {
          requested: 1,
          affected: 1,
          skipped: 0,
          executionId: EXECUTION_ID,
          workflowId: WORKFLOW_ID,
          finalStatus: 'cancelled',
          timelineUrl: `/executions/${EXECUTION_ID}`,
        },
        execution: {
          id: EXECUTION_ID,
          workflowId: WORKFLOW_ID,
          status: 'cancelled',
          timelineUrl: `/executions/${EXECUTION_ID}`,
        },
        metadata: {
          finalStatus: 'cancelled',
          timelineUrl: `/executions/${EXECUTION_ID}`,
        },
      },
    });
  });
});
