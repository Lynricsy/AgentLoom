import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { LlmController } from '../llm.controller';
import { LlmProviderController } from '../llm-provider.controller';
import { LLM_PROVIDER_CATALOG } from '../llm-provider-catalog';
import type { LlmService } from '../llm.service';

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONFIG_ID = '00000000-0000-0000-0000-000000000100';

const MOCK_CONFIG = {
  id: CONFIG_ID,
  orgId: 'org-id',
  tenantId: TENANT_ID,
  name: 'Test Config',
  provider: 'openai' as const,
  modelName: 'gpt-4o',
  parameters: {},
  apiKeyId: null,
  isDefault: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

function getRoles(target: object, methodName: string): string[] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(target),
    methodName,
  );
  if (!descriptor?.value) return undefined;
  return Reflect.getMetadata(ROLES_KEY, descriptor.value) as
    | string[]
    | undefined;
}

// ---------------------------------------------------------------------------
// LlmController 测试
// ---------------------------------------------------------------------------

describe('LlmController', () => {
  let controller: LlmController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    service = {
      create: vi.fn().mockResolvedValue(MOCK_CONFIG),
      findAll: vi.fn().mockResolvedValue([MOCK_CONFIG]),
      findById: vi.fn().mockResolvedValue(MOCK_CONFIG),
      update: vi.fn().mockResolvedValue(MOCK_CONFIG),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    controller = new LlmController(service as unknown as LlmService);
  });

  // ========== 角色元数据验证 ==========

  describe('角色权限', () => {
    it('create 应需要 owner 或 admin', () => {
      const roles = getRoles(controller, 'create');
      expect(roles).toEqual(expect.arrayContaining(['owner', 'admin']));
      expect(roles).not.toContain('viewer');
    });

    it('findAll 应需要 owner、admin 或 viewer', () => {
      const roles = getRoles(controller, 'findAll');
      expect(roles).toEqual(
        expect.arrayContaining(['owner', 'admin', 'viewer']),
      );
    });

    it('findById 应需要 owner、admin 或 viewer', () => {
      const roles = getRoles(controller, 'findById');
      expect(roles).toEqual(
        expect.arrayContaining(['owner', 'admin', 'viewer']),
      );
    });

    it('update 应需要 owner 或 admin', () => {
      const roles = getRoles(controller, 'update');
      expect(roles).toEqual(expect.arrayContaining(['owner', 'admin']));
      expect(roles).not.toContain('viewer');
    });

    it('delete 应需要 owner 或 admin', () => {
      const roles = getRoles(controller, 'delete');
      expect(roles).toEqual(expect.arrayContaining(['owner', 'admin']));
      expect(roles).not.toContain('viewer');
    });
  });

  // ========== 方法调用验证 ==========

  describe('create', () => {
    it('应当调用 service.create 并返回 { data }', async () => {
      const dto = {
        name: 'Config',
        provider: 'openai' as const,
        modelName: 'gpt-4o',
      };
      const result = await controller.create(dto as never, USER_ID, TENANT_ID);

      expect(service.create).toHaveBeenCalledWith(dto, TENANT_ID, USER_ID);
      expect(result).toEqual({ data: MOCK_CONFIG });
    });
  });

  describe('findAll', () => {
    it('应当调用 service.findAll 并返回 { data }', async () => {
      const result = await controller.findAll(TENANT_ID);

      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual({ data: [MOCK_CONFIG] });
    });
  });

  describe('findById', () => {
    it('应当调用 service.findById 并返回 { data }', async () => {
      const result = await controller.findById(CONFIG_ID, TENANT_ID);

      expect(service.findById).toHaveBeenCalledWith(CONFIG_ID, TENANT_ID);
      expect(result).toEqual({ data: MOCK_CONFIG });
    });
  });

  describe('update', () => {
    it('应当调用 service.update 并返回 { data }', async () => {
      const dto = { modelName: 'gpt-4o-mini' };
      const result = await controller.update(
        CONFIG_ID,
        dto as never,
        TENANT_ID,
      );

      expect(service.update).toHaveBeenCalledWith(CONFIG_ID, dto, TENANT_ID);
      expect(result).toEqual({ data: MOCK_CONFIG });
    });
  });

  describe('delete', () => {
    it('应当调用 service.delete', async () => {
      await controller.delete(CONFIG_ID, TENANT_ID);

      expect(service.delete).toHaveBeenCalledWith(CONFIG_ID, TENANT_ID);
    });
  });
});

// ---------------------------------------------------------------------------
// LlmProviderController 测试
// ---------------------------------------------------------------------------

describe('LlmProviderController', () => {
  let controller: LlmProviderController;

  beforeEach(() => {
    controller = new LlmProviderController();
  });

  it('应当返回 { data: LLM_PROVIDER_CATALOG }', () => {
    const result = controller.getProviders();
    expect(result).toEqual({ data: LLM_PROVIDER_CATALOG });
  });

  it('getProviders 不应设置 Roles 元数据', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(controller),
      'getProviders',
    );
    const roles = Reflect.getMetadata(ROLES_KEY, descriptor!.value);
    expect(roles).toBeUndefined();
  });
});
