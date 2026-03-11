import { describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { WorkflowDefinitionCreateController } from '../workflow-definition-create.controller';
import type { WorkflowVersionService } from '../workflow-version.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';

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
  };
  const controller = new WorkflowDefinitionCreateController(
    service as unknown as WorkflowVersionService,
  );
  return { service, controller };
}

describe('WorkflowDefinitionCreateController', () => {
  describe('角色元数据', () => {
    it('create 应要求 owner/admin/creator 角色', () => {
      const { controller } = setup();
      expect(getRoles(controller, 'create')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
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
