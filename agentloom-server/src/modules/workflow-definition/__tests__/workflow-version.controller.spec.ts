import { describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { VersionResponseDto } from '../dto/version-response.dto';
import { WorkflowVersionController } from '../workflow-version.controller';
import type { WorkflowVersionService } from '../workflow-version.service';

const WORKFLOW_ID = '00000000-0000-0000-0000-000000000001';
const VERSION_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000003';
const TENANT_ID = '00000000-0000-0000-0000-000000000004';

const MOCK_VERSION_DTO: VersionResponseDto = {
  id: VERSION_ID,
  workflowDefinitionId: WORKFLOW_ID,
  versionNumber: 1,
  label: null,
  snapshot: {
    nodes: [],
    edges: [],
    viewport: null,
    metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
  },
  publishedAt: null,
  archivedAt: null,
  createdBy: USER_ID,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const MOCK_INPUT_SCHEMA = {
  version: 1,
  collectionMode: 'form',
  fields: [],
};

function getRoles(controller: object, method: string): string[] | undefined {
  const handler = (controller as Record<string, unknown>)[method] as
    | ((...args: never[]) => unknown)
    | undefined;
  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

describe('WorkflowVersionController', () => {
  let controller: WorkflowVersionController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const setup = () => {
    service = {
      createVersion: vi.fn().mockResolvedValue(MOCK_VERSION_DTO),
      listVersions: vi.fn().mockResolvedValue({
        data: [MOCK_VERSION_DTO],
        meta: {
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      }),
      rollback: vi.fn().mockResolvedValue(MOCK_VERSION_DTO),
      publish: vi
        .fn()
        .mockResolvedValue({ data: MOCK_VERSION_DTO, warnings: [] }),
      archive: vi.fn().mockResolvedValue(undefined),
      getPublishedVersion: vi.fn().mockResolvedValue(MOCK_VERSION_DTO),
      getInputSchema: vi.fn().mockResolvedValue(MOCK_INPUT_SCHEMA),
    };

    controller = new WorkflowVersionController(
      service as unknown as WorkflowVersionService,
    );
  };

  describe('角色元数据', () => {
    setup();

    it('createVersion 应当要求 owner 或 admin', () => {
      expect(getRoles(controller, 'createVersion')).toEqual(['owner', 'admin']);
    });

    it('listVersions 应当允许所有可读组织角色', () => {
      expect(getRoles(controller, 'listVersions')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
    });

    it('rollback 应当要求 owner 或 admin', () => {
      expect(getRoles(controller, 'rollback')).toEqual(['owner', 'admin']);
    });

    it('publish 应当要求 owner 或 admin', () => {
      expect(getRoles(controller, 'publish')).toEqual(['owner', 'admin']);
    });

    it('archive 应当要求 owner 或 admin', () => {
      expect(getRoles(controller, 'archive')).toEqual(['owner', 'admin']);
    });

    it('getPublishedVersion 应当允许所有可读组织角色', () => {
      expect(getRoles(controller, 'getPublishedVersion')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
    });

    it('getInputSchema 应当允许 operator 及以上角色', () => {
      expect(getRoles(controller, 'getInputSchema')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
      ]);
    });
  });

  describe('createVersion', () => {
    it('应当调用 service 并返回 { data }', async () => {
      setup();
      const dto = { label: '测试版本' };
      const result = await controller.createVersion(WORKFLOW_ID, dto, USER_ID);

      expect(service.createVersion).toHaveBeenCalledWith(
        WORKFLOW_ID,
        dto,
        USER_ID,
      );
      expect(result).toEqual({ data: MOCK_VERSION_DTO });
    });
  });

  describe('listVersions', () => {
    it('应当调用 service 并透传分页结果', async () => {
      setup();
      const query = { page: 1, pageSize: 10 };
      const result = await controller.listVersions(WORKFLOW_ID, query);

      expect(service.listVersions).toHaveBeenCalledWith(WORKFLOW_ID, query);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('rollback', () => {
    it('应当调用 service 并返回 { data }', async () => {
      setup();
      const result = await controller.rollback(
        WORKFLOW_ID,
        VERSION_ID,
        USER_ID,
      );

      expect(service.rollback).toHaveBeenCalledWith(
        WORKFLOW_ID,
        VERSION_ID,
        USER_ID,
      );
      expect(result).toEqual({ data: MOCK_VERSION_DTO });
    });
  });

  describe('publish', () => {
    it('应当调用 service 并返回 { data }', async () => {
      setup();
      const dto = { label: '发布版本' };
      const result = await controller.publish(WORKFLOW_ID, dto, USER_ID);

      expect(service.publish).toHaveBeenCalledWith(WORKFLOW_ID, dto, USER_ID);
      expect(result).toEqual({ data: MOCK_VERSION_DTO, warnings: [] });
    });
  });

  describe('archive', () => {
    it('应当调用 service（返回 void）', async () => {
      setup();
      await controller.archive(WORKFLOW_ID, USER_ID);

      expect(service.archive).toHaveBeenCalledWith(WORKFLOW_ID, USER_ID);
    });
  });

  describe('getPublishedVersion', () => {
    it('应当调用 service 并返回 { data }', async () => {
      setup();
      const result = await controller.getPublishedVersion(
        WORKFLOW_ID,
        TENANT_ID,
      );

      expect(service.getPublishedVersion).toHaveBeenCalledWith(
        WORKFLOW_ID,
        TENANT_ID,
      );
      expect(result).toEqual({ data: MOCK_VERSION_DTO });
    });

    it('应当处理 null 结果', async () => {
      setup();
      service.getPublishedVersion.mockResolvedValueOnce(null);
      const result = await controller.getPublishedVersion(
        WORKFLOW_ID,
        TENANT_ID,
      );

      expect(result).toEqual({ data: null });
    });
  });

  describe('getInputSchema', () => {
    it('应当调用 service 并返回 { data }', async () => {
      setup();

      const result = await controller.getInputSchema(WORKFLOW_ID, TENANT_ID);

      expect(service.getInputSchema).toHaveBeenCalledWith(
        WORKFLOW_ID,
        TENANT_ID,
      );
      expect(result).toEqual({ data: MOCK_INPUT_SCHEMA });
    });
  });
});
