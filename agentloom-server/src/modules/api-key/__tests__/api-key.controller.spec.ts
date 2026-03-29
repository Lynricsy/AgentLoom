import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { ApiKeyController } from '../api-key.controller';
import type { ApiKeyService } from '../api-key.service';

function getRoles(controller: object, method: string): string[] | undefined {
  const handler = (controller as Record<string, unknown>)[method] as
    | ((...args: never[]) => unknown)
    | undefined;
  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const KEY_ID = '00000000-0000-0000-0000-000000000100';

const MOCK_RESPONSE = {
  id: KEY_ID,
  provider: 'openai' as const,
  label: 'My Key',
  keyPreview: 'sk-...5678',
  isDefault: false,
  status: 'active' as const,
  lastUsedAt: null,
  rotatedAt: null,
  expiresAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('ApiKeyController', () => {
  let controller: ApiKeyController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    service = {
      create: vi.fn().mockResolvedValue(MOCK_RESPONSE),
      findAllByTenant: vi.fn().mockResolvedValue([MOCK_RESPONSE]),
      rotate: vi.fn().mockResolvedValue(MOCK_RESPONSE),
      revoke: vi
        .fn()
        .mockResolvedValue({ ...MOCK_RESPONSE, status: 'revoked' }),
    };

    controller = new ApiKeyController(service as unknown as ApiKeyService);
  });

  describe('角色元数据', () => {
    it('create 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'create')).toEqual(['owner', 'admin']);
    });

    it('findAll 应当允许 owner、admin 和 operator 角色', () => {
      expect(getRoles(controller, 'findAll')).toEqual([
        'owner',
        'admin',
        'operator',
      ]);
    });

    it('rotate 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'rotate')).toEqual(['owner', 'admin']);
    });

    it('revoke 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'revoke')).toEqual(['owner', 'admin']);
    });
  });

  describe('create', () => {
    it('应当调用 service.create 并包装返回值', async () => {
      const dto = {
        provider: 'openai' as const,
        label: 'Key',
        apiKey: 'sk-test5678',
        isDefault: false,
      };
      const result = await controller.create(dto, USER_ID, TENANT_ID);

      expect(result).toEqual({ data: MOCK_RESPONSE });
      expect(service.create).toHaveBeenCalledWith(dto, USER_ID, TENANT_ID);
    });
  });

  describe('findAll', () => {
    it('应当调用 service.findAllByTenant 并包装返回值', async () => {
      const result = await controller.findAll(TENANT_ID);

      expect(result).toEqual({ data: [MOCK_RESPONSE] });
      expect(service.findAllByTenant).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('rotate', () => {
    it('应当调用 service.rotate 并包装返回值', async () => {
      const dto = { apiKey: 'sk-new-key-9999' };
      const result = await controller.rotate(KEY_ID, dto, USER_ID, TENANT_ID);

      expect(result).toEqual({ data: MOCK_RESPONSE });
      expect(service.rotate).toHaveBeenCalledWith(
        KEY_ID,
        dto,
        TENANT_ID,
        USER_ID,
      );
    });
  });

  describe('revoke', () => {
    it('应当调用 service.revoke 并包装返回值', async () => {
      const result = await controller.revoke(KEY_ID, USER_ID, TENANT_ID);

      expect(result).toEqual({ data: { ...MOCK_RESPONSE, status: 'revoked' } });
      expect(service.revoke).toHaveBeenCalledWith(KEY_ID, TENANT_ID, USER_ID);
    });
  });
});
