import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { DrizzleDB } from '../../database/database.module';
import {
  agentDefinitions,
  agentMemoryInstances,
  knowledgeBases,
  mcpServerConfigs,
  skills,
  workflowDefinitions,
} from '../../database/schema';
import { ResourceSourceNotFoundException } from './resource-source.exceptions';
import { ResourceSourceService } from './resource-source.service';

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RESOURCE_ID = '22222222-2222-2222-2222-222222222222';

function createSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

function createUpdateChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(result);
  return chain;
}

describe('ResourceSourceService.convertToManual', () => {
  let service: ResourceSourceService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let selectResults: unknown[][];

  beforeEach(() => {
    selectResults = [];
    db = {
      select: vi.fn(() => createSelectChain(selectResults.shift() ?? [])),
      update: vi.fn(),
    };
    vi.mocked(getTenantDb).mockReturnValue(db as unknown as DrizzleDB);
    service = new ResourceSourceService(db as unknown as DrizzleDB);
  });

  it.each([
    ['workflow_definition', workflowDefinitions],
    ['agent_definition', agentDefinitions],
    ['knowledge_base', knowledgeBases],
    ['memory_instance', agentMemoryInstances],
    ['mcp_server_config', mcpServerConfigs],
    ['skill', skills],
  ] as const)(
    '按 %s 对应的实际资源表校验存在性',
    async (resourceType, expectedTable) => {
      selectResults.push([{ id: RESOURCE_ID }], []);

      await expect(
        service.convertToManual(TENANT_ID, resourceType, RESOURCE_ID),
      ).resolves.toEqual({
        resourceType,
        resourceId: RESOURCE_ID,
        currentKind: 'manual',
      });

      const resourceSelect = db.select.mock.results[0]?.value as ReturnType<
        typeof createSelectChain
      >;
      expect(resourceSelect.from).toHaveBeenCalledWith(expectedTable);
    },
  );

  it.each(['资源不存在', '资源属于其他租户'])(
    '%s 时抛出 ResourceSourceNotFoundException',
    async () => {
      selectResults.push([]);

      await expect(
        service.convertToManual(TENANT_ID, 'workflow_definition', RESOURCE_ID),
      ).rejects.toBeInstanceOf(ResourceSourceNotFoundException);
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it('资源存在但无来源记录时按 manual 幂等返回', async () => {
    selectResults.push([{ id: RESOURCE_ID }], []);

    await expect(
      service.convertToManual(TENANT_ID, 'agent_definition', RESOURCE_ID),
    ).resolves.toEqual({
      resourceType: 'agent_definition',
      resourceId: RESOURCE_ID,
      currentKind: 'manual',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('来源记录已是 manual 时幂等返回', async () => {
    selectResults.push([{ id: RESOURCE_ID }], [{ currentKind: 'manual' }]);

    await expect(
      service.convertToManual(TENANT_ID, 'knowledge_base', RESOURCE_ID),
    ).resolves.toEqual({
      resourceType: 'knowledge_base',
      resourceId: RESOURCE_ID,
      currentKind: 'manual',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('share_imported 来源记录正常转换为 manual', async () => {
    selectResults.push(
      [{ id: RESOURCE_ID }],
      [{ currentKind: 'share_imported' }],
    );
    db.update.mockReturnValue(
      createUpdateChain([
        {
          resourceType: 'memory_instance',
          resourceId: RESOURCE_ID,
          currentKind: 'manual',
        },
      ]),
    );

    await expect(
      service.convertToManual(TENANT_ID, 'memory_instance', RESOURCE_ID),
    ).resolves.toEqual({
      resourceType: 'memory_instance',
      resourceId: RESOURCE_ID,
      currentKind: 'manual',
    });
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledOnce();
  });

  it('share_imported 更新 returning 为空时仍抛出 404', async () => {
    selectResults.push(
      [{ id: RESOURCE_ID }],
      [{ currentKind: 'share_imported' }],
    );
    db.update.mockReturnValue(createUpdateChain([]));

    await expect(
      service.convertToManual(TENANT_ID, 'skill', RESOURCE_ID),
    ).rejects.toBeInstanceOf(ResourceSourceNotFoundException);
  });
});
