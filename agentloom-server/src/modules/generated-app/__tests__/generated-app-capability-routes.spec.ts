import { ConfigService } from '@nestjs/config';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { DrizzleDB } from '../../../database/database.module';
import { GeneratedAppController } from '../generated-app.controller';
import {
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppRepairAttemptNotFoundException,
} from '../generated-app.exceptions';
import { GeneratedAppRepository } from '../generated-app.repository';
import type { GeneratedAppService } from '../generated-app.service';
import {
  UpdateGeneratedAppSchema,
  type UpdateGeneratedAppDtoType,
} from '../dto';
import {
  APP_ID,
  GENERATION_RUN_ID,
  REPAIR_ATTEMPT_ID,
  TENANT_ID,
  createConfigService,
  createGeneratedApp,
  createUpdateReturningChain,
  mockTenantDb,
} from './generated-app-test-support';

const OTHER_ID = '99999999-9999-4999-8999-999999999999';

type SqlLike = { queryChunks?: unknown[]; value?: unknown };

function collectSqlParameterValues(value: unknown, seen = new Set<object>()): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSqlParameterValues(entry, seen));
  }

  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return [];
  }

  seen.add(value);
  const sqlLike = value as SqlLike;
  if (value.constructor.name === 'Param') {
    return [sqlLike.value];
  }

  return (sqlLike.queryChunks ?? []).flatMap((entry) =>
    collectSqlParameterValues(entry, seen),
  );
}

function createSelectNotFoundChain() {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
}

function createDeleteReturningChain(result: Array<{ id: string }>) {
  return {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

describe('Generated App capability routes', () => {
  let repository: GeneratedAppRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService() as ConfigService,
    );
  });

  it('PATCH 白名单拒绝 Gate 字段、状态和公开 token', () => {
    const forbiddenFields = [
      'prompt',
      'appSpec',
      'generationPlan',
      'gateResults',
      'status',
      'token',
      'publicShareToken',
    ];

    for (const field of forbiddenFields) {
      expect(
        UpdateGeneratedAppSchema.safeParse({
          appName: '允许的名称',
          [field]: '不得写入',
        }).success,
        field,
      ).toBe(false);
    }

    expect(UpdateGeneratedAppSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateGeneratedAppSchema.parse({
        appName: '  新名称  ',
        description: '  新描述  ',
      }),
    ).toEqual({ appName: '新名称', description: '新描述' });
  });

  it('注册五条完整路由并沿用读写角色边界', () => {
    const prototype = GeneratedAppController.prototype;
    const cases = [
      ['update', ':appId', RequestMethod.PATCH, ['owner', 'admin', 'creator']],
      ['delete', ':appId', RequestMethod.DELETE, ['owner', 'admin']],
      [
        'findGenerationRun',
        ':appId/generation-runs/:runId',
        RequestMethod.GET,
        ['owner', 'admin', 'creator', 'operator', 'viewer'],
      ],
      [
        'findRepairAttempt',
        ':appId/generation-runs/:runId/repair-attempts/:repairAttemptId',
        RequestMethod.GET,
        ['owner', 'admin', 'creator', 'operator', 'viewer'],
      ],
      [
        'deleteRepairAttempt',
        ':appId/generation-runs/:runId/repair-attempts/:repairAttemptId',
        RequestMethod.DELETE,
        ['owner', 'admin'],
      ],
    ] as const;

    for (const [methodName, path, method, roles] of cases) {
      const handler = prototype[methodName] as (...args: never[]) => unknown;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(roles);
    }
  });

  it('PATCH 与三条详情路由返回 data 信封，删除路由返回 204 空体语义', async () => {
    const data = { id: APP_ID };
    const service = {
      update: vi.fn().mockResolvedValue(data),
      delete: vi.fn().mockResolvedValue(undefined),
      findGenerationRun: vi.fn().mockResolvedValue(data),
      findRepairAttempt: vi.fn().mockResolvedValue(data),
      deleteRepairAttempt: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new GeneratedAppController(
      service as unknown as GeneratedAppService,
    );

    await expect(
      controller.update(
        APP_ID,
        { appName: '新名称' },
        TENANT_ID,
        OTHER_ID,
      ),
    ).resolves.toEqual({ data });
    await expect(
      controller.findGenerationRun(APP_ID, GENERATION_RUN_ID, TENANT_ID),
    ).resolves.toEqual({ data });
    await expect(
      controller.findRepairAttempt(
        APP_ID,
        GENERATION_RUN_ID,
        REPAIR_ATTEMPT_ID,
        TENANT_ID,
      ),
    ).resolves.toEqual({ data });
    await expect(controller.delete(APP_ID, TENANT_ID)).resolves.toBeUndefined();
    await expect(
      controller.deleteRepairAttempt(
        APP_ID,
        GENERATION_RUN_ID,
        REPAIR_ATTEMPT_ID,
        TENANT_ID,
      ),
    ).resolves.toBeUndefined();
  });

  it('DELETE 应先关闭公开分享再删除父记录且处于同一事务', async () => {
    const order: string[] = [];
    const updateChain = createUpdateReturningChain([{ id: APP_ID }]);
    updateChain.set.mockImplementation((payload) => {
      expect(payload).toEqual(
        expect.objectContaining({
          publicShareEnabled: false,
          publicShareToken: null,
          publicShareDisabledAt: expect.any(Date),
        }),
      );
      order.push('disable-public-share');
      return updateChain;
    });
    const deleteChain = createDeleteReturningChain([{ id: APP_ID }]);

    Object.assign(mockTenantDb, {
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (operation: (tx: DrizzleDB) => Promise<unknown>) => {
        order.push('transaction-start');
        const result = await operation(mockTenantDb as unknown as DrizzleDB);
        order.push('transaction-commit');
        return result;
      }),
      delete: vi.fn(() => {
        order.push('delete-parent');
        return deleteChain;
      }),
    });
    mockTenantDb.update.mockReturnValue(updateChain);

    await repository.delete(TENANT_ID, APP_ID);

    expect(order).toEqual([
      'transaction-start',
      'disable-public-share',
      'delete-parent',
      'transaction-commit',
    ]);
  });
  it('子资源错配复用 RFC problem+json 404 异常', () => {
    const runError = new GeneratedAppGenerationRunNotFoundException(
      GENERATION_RUN_ID,
    );
    const repairError = new GeneratedAppRepairAttemptNotFoundException(
      REPAIR_ATTEMPT_ID,
    );

    expect(runError.getStatus()).toBe(404);
    expect(runError.type).toBe(
      'https://agentloom.dev/errors/generated-app-generation-run-not-found',
    );
    expect(repairError.getStatus()).toBe(404);
    expect(repairError.type).toBe(
      'https://agentloom.dev/errors/generated-app-repair-attempt-not-found',
    );
  });

  it('GET generation-run 在 tenantId/appId/runId 任一错配时返回 404', async () => {
    const mismatches = [
      [OTHER_ID, APP_ID, GENERATION_RUN_ID],
      [TENANT_ID, OTHER_ID, GENERATION_RUN_ID],
      [TENANT_ID, APP_ID, OTHER_ID],
    ] as const;

    for (const [tenantId, appId, runId] of mismatches) {
      const chain = createSelectNotFoundChain();
      mockTenantDb.select.mockReturnValueOnce(chain);

      await expect(
        repository.findGenerationRun(tenantId, appId, runId),
      ).rejects.toBeInstanceOf(GeneratedAppGenerationRunNotFoundException);
      expect(collectSqlParameterValues(chain.where.mock.calls[0]?.[0])).toEqual(
        expect.arrayContaining([tenantId, appId, runId]),
      );
    }
  });

  it('GET repair-attempt 在完整父链任一错配时返回 404', async () => {
    const mismatches = [
      [OTHER_ID, APP_ID, GENERATION_RUN_ID, REPAIR_ATTEMPT_ID],
      [TENANT_ID, OTHER_ID, GENERATION_RUN_ID, REPAIR_ATTEMPT_ID],
      [TENANT_ID, APP_ID, OTHER_ID, REPAIR_ATTEMPT_ID],
      [TENANT_ID, APP_ID, GENERATION_RUN_ID, OTHER_ID],
    ] as const;

    for (const [tenantId, appId, runId, repairAttemptId] of mismatches) {
      const chain = createSelectNotFoundChain();
      mockTenantDb.select.mockReturnValueOnce(chain);

      await expect(
        repository.findRepairAttempt(tenantId, appId, runId, repairAttemptId),
      ).rejects.toBeInstanceOf(GeneratedAppRepairAttemptNotFoundException);
      expect(collectSqlParameterValues(chain.where.mock.calls[0]?.[0])).toEqual(
        expect.arrayContaining([tenantId, appId, runId, repairAttemptId]),
      );
    }
  });

  it('DELETE repair-attempt 在完整父链任一错配时返回 404', async () => {
    const mismatches = [
      [OTHER_ID, APP_ID, GENERATION_RUN_ID, REPAIR_ATTEMPT_ID],
      [TENANT_ID, OTHER_ID, GENERATION_RUN_ID, REPAIR_ATTEMPT_ID],
      [TENANT_ID, APP_ID, OTHER_ID, REPAIR_ATTEMPT_ID],
      [TENANT_ID, APP_ID, GENERATION_RUN_ID, OTHER_ID],
    ] as const;

    for (const [tenantId, appId, runId, repairAttemptId] of mismatches) {
      const chain = createDeleteReturningChain([]);
      Object.assign(mockTenantDb, { delete: vi.fn(() => chain) });

      await expect(
        repository.deleteRepairAttempt(
          tenantId,
          appId,
          runId,
          repairAttemptId,
        ),
      ).rejects.toBeInstanceOf(GeneratedAppRepairAttemptNotFoundException);
      expect(collectSqlParameterValues(chain.where.mock.calls[0]?.[0])).toEqual(
        expect.arrayContaining([tenantId, appId, runId, repairAttemptId]),
      );
    }
  });

  it('PATCH 仓储只持久化命名 DTO 的展示字段', async () => {
    const updated = {
      ...createGeneratedApp(),
      appName: '新名称',
      description: '新描述',
    };
    const chain = createUpdateReturningChain([updated]);
    mockTenantDb.update.mockReturnValue(chain);

    await expect(
      repository.update(
        TENANT_ID,
        OTHER_ID,
        APP_ID,
        {
          appName: '新名称',
          description: '新描述',
        } satisfies UpdateGeneratedAppDtoType,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ appName: '新名称', description: '新描述' }),
    );

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '新名称',
        description: '新描述',
        updatedBy: OTHER_ID,
      }),
    );
    expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('prompt');
  });
});
