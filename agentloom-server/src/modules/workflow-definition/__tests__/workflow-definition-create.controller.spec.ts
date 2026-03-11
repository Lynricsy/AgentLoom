import { describe, expect, it, vi } from 'vitest';

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { WorkflowDefinitionCreateController } from '../workflow-definition-create.controller';
import type { WorkflowVersionService } from '../workflow-version.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000003';

function getRoles(
  controller: WorkflowDefinitionCreateController,
  methodName: string,
): string[] | undefined {
  const handler = Object.getPrototypeOf(controller)[methodName];
  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

function setup() {
  const service = {
    create: vi.fn(),
    findAllDefinitions: vi.fn(),
    findDefinitionById: vi.fn(),
  };
  const controller = new WorkflowDefinitionCreateController(
    service as unknown as WorkflowVersionService,
  );
  return { service, controller };
}

describe('WorkflowDefinitionCreateController', () => {
  describe('角色元数据', () => {
    it('findAll 应要求 owner/admin/creator/operator/viewer 角色', () => {
      const { controller } = setup();
      expect(getRoles(controller, 'findAll')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
    });

    it('findById 应要求 owner/admin/creator/operator/viewer 角色', () => {
      const { controller } = setup();
      expect(getRoles(controller, 'findById')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
    });

    it('create 应要求 owner/admin/creator 角色', () => {
      const { controller } = setup();
      expect(getRoles(controller, 'create')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });
  });

  describe('findAll', () => {
    it('应调用 service.findAllDefinitions 并返回分页响应', async () => {
      const { service, controller } = setup();
      const query: Parameters<typeof controller.findAll>[0] = {
        page: 2,
        pageSize: 10,
        status: 'draft',
        search: '审批',
      };
      const mockResult = {
        data: [
          {
            id: WORKFLOW_ID,
            name: '审批工作流',
            slug: 'approval-workflow',
            description: '审批流程',
            status: 'draft',
            version: 3,
            metadata: null,
            createdBy: USER_ID,
            updatedBy: USER_ID,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          page: 2,
          pageSize: 10,
          totalPages: 1,
        },
      };
      service.findAllDefinitions.mockResolvedValue(mockResult);

      const result = await controller.findAll(query, TENANT_ID);

      expect(service.findAllDefinitions).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('findById', () => {
    it('应调用 service.findDefinitionById 并返回 {data}', async () => {
      const { service, controller } = setup();
      const mockResult = {
        id: WORKFLOW_ID,
        name: '工作流详情',
        slug: 'workflow-detail',
        description: '详情描述',
        status: 'published',
        version: 5,
        metadata: { source: 'template' },
        createdBy: USER_ID,
        updatedBy: USER_ID,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-03T00:00:00.000Z',
      };
      service.findDefinitionById.mockResolvedValue(mockResult);

      const result = await controller.findById(WORKFLOW_ID, TENANT_ID);

      expect(service.findDefinitionById).toHaveBeenCalledWith(WORKFLOW_ID);
      expect(result).toEqual({ data: mockResult });
    });
  });

  describe('create', () => {
    it('应调用 service.create 并返回 {data}', async () => {
      const { service, controller } = setup();
      const dto = { name: '新工作流' };
      const mockResult = { id: 'wf-1', name: '新工作流', slug: 'xin-gong-zuo-liu' };
      service.create.mockResolvedValue(mockResult);

      const result = await controller.create(
        dto as Parameters<typeof controller.create>[0],
        TENANT_ID,
        USER_ID,
      );

      expect(service.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual({ data: mockResult });
    });

    it('应传递 template_slug 参数', async () => {
      const { service, controller } = setup();
      const dto = {
        name: '模板副本',
        description: '描述',
        template_slug: 'code-review-assistant',
      };
      const mockResult = { id: 'wf-2', name: '模板副本' };
      service.create.mockResolvedValue(mockResult);

      const result = await controller.create(
        dto as Parameters<typeof controller.create>[0],
        TENANT_ID,
        USER_ID,
      );

      expect(service.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual({ data: mockResult });
    });
  });
});
