import 'reflect-metadata';

import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

const mocks = vi.hoisted(() => ({
  shareService: {
    createShare: vi.fn(),
    findSharesByWorkflow: vi.fn(),
    revokeShare: vi.fn(),
    incrementCopyCount: vi.fn(),
  },
}));

type MockRequest = {
  tenantId?: string;
  user: {
    sub: string;
    tenantId?: string;
  };
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SHARE_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_ID = '44444444-4444-4444-8444-444444444444';
const SHARE_TOKEN = 'ab'.repeat(32);

describe('ShareController', () => {
  let module: TestingModule;
  let controller: ShareController;

  beforeEach(async () => {
    vi.clearAllMocks();

    module = await Test.createTestingModule({
      controllers: [ShareController],
      providers: [
        {
          provide: ShareService,
          useValue: mocks.shareService,
        },
      ],
    }).compile();

    controller = module.get(ShareController);
  });

  describe('metadata', () => {
    it('类级别应声明 owner/admin/creator 角色', () => {
      expect(Reflect.getMetadata(ROLES_KEY, ShareController)).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });

    it('list 与 incrementCopyCount 方法应放宽为 viewer/operator 可读角色', () => {
      const listHandler = Object.getOwnPropertyDescriptor(
        ShareController.prototype,
        'list',
      )?.value;
      const incrementCopyCountHandler = Object.getOwnPropertyDescriptor(
        ShareController.prototype,
        'incrementCopyCount',
      )?.value;

      expect(Reflect.getMetadata(ROLES_KEY, listHandler)).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, incrementCopyCountHandler)).toEqual(
        ['owner', 'admin', 'creator', 'operator', 'viewer'],
      );
    });
  });

  describe('create', () => {
    it('应优先使用 req.tenantId 调用 createShare 并返回 { data }', async () => {
      const dto = {
        workflow_definition_id: WORKFLOW_ID,
        share_type: 'copyable' as const,
      };
      const req: MockRequest = {
        tenantId: TENANT_ID,
        user: {
          sub: USER_ID,
          tenantId: '00000000-0000-0000-0000-000000000099',
        },
      };
      const serviceResult = {
        id: SHARE_ID,
        workflowDefinitionId: WORKFLOW_ID,
      };

      mocks.shareService.createShare.mockResolvedValue(serviceResult);

      await expect(controller.create(dto, req as never)).resolves.toEqual({
        data: serviceResult,
      });
      expect(mocks.shareService.createShare).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
    });

    it('req.tenantId 缺失时应回退到 req.user.tenantId', async () => {
      const dto = {
        workflow_definition_id: WORKFLOW_ID,
        share_type: 'read_only' as const,
      };
      const req: MockRequest = {
        user: {
          sub: USER_ID,
          tenantId: TENANT_ID,
        },
      };

      mocks.shareService.createShare.mockResolvedValue({ id: SHARE_ID });

      await controller.create(dto, req as never);

      expect(mocks.shareService.createShare).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
    });

    it('缺少 tenant 信息时应抛出 TenantRequiredException', async () => {
      const req: MockRequest = {
        user: {
          sub: USER_ID,
        },
      };

      await expect(
        controller.create(
          {
            workflow_definition_id: WORKFLOW_ID,
            share_type: 'read_only',
          },
          req as never,
        ),
      ).rejects.toBeInstanceOf(TenantRequiredException);

      expect(mocks.shareService.createShare).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('应直接返回服务层分页结果', async () => {
      const query = {
        page: 2,
        page_size: 10,
        workflow_definition_id: WORKFLOW_ID,
      };
      const req: MockRequest = {
        tenantId: TENANT_ID,
        user: {
          sub: USER_ID,
        },
      };
      const serviceResult = {
        data: [{ id: SHARE_ID }],
        meta: { page: 2, pageSize: 10, total: 1 },
      };

      mocks.shareService.findSharesByWorkflow.mockResolvedValue(serviceResult);

      await expect(controller.list(query, req as never)).resolves.toEqual(
        serviceResult,
      );
      expect(mocks.shareService.findSharesByWorkflow).toHaveBeenCalledWith(
        TENANT_ID,
        query,
      );
    });

    it('缺少 tenant 信息时应抛出 TenantRequiredException', async () => {
      const req: MockRequest = {
        user: {
          sub: USER_ID,
        },
      };

      await expect(
        controller.list(
          {
            page: 1,
            page_size: 20,
          },
          req as never,
        ),
      ).rejects.toBeInstanceOf(TenantRequiredException);

      expect(mocks.shareService.findSharesByWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('应按 tenant 和 shareId 调用 revokeShare', async () => {
      const req: MockRequest = {
        tenantId: TENANT_ID,
        user: {
          sub: USER_ID,
        },
      };

      mocks.shareService.revokeShare.mockResolvedValue(undefined);

      await expect(
        controller.revoke(SHARE_ID, req as never),
      ).resolves.toBeUndefined();
      expect(mocks.shareService.revokeShare).toHaveBeenCalledWith(
        TENANT_ID,
        SHARE_ID,
      );
    });

    it('缺少 tenant 信息时应抛出 TenantRequiredException', async () => {
      const req: MockRequest = {
        user: {
          sub: USER_ID,
        },
      };

      await expect(
        controller.revoke(SHARE_ID, req as never),
      ).rejects.toBeInstanceOf(TenantRequiredException);

      expect(mocks.shareService.revokeShare).not.toHaveBeenCalled();
    });
  });

  describe('incrementCopyCount', () => {
    it('应调用 incrementCopyCount 并包装为 { data }', async () => {
      const serviceResult = {
        id: SHARE_ID,
        shareToken: SHARE_TOKEN,
      };

      mocks.shareService.incrementCopyCount.mockResolvedValue(serviceResult);

      await expect(controller.incrementCopyCount(SHARE_TOKEN)).resolves.toEqual(
        {
          data: serviceResult,
        },
      );
      expect(mocks.shareService.incrementCopyCount).toHaveBeenCalledWith(
        SHARE_TOKEN,
      );
    });
  });
});
