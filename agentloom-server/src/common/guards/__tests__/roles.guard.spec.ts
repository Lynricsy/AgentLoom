import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { ROLES_KEY } from '../../decorators/roles.decorator';
import { RolesGuard } from '../roles.guard';
import { RbacCacheService } from '../../services/rbac-cache.service';
import {
  InsufficientPermissionsException,
  InvalidTenantContextException,
  TenantRequiredException,
} from '../../exceptions/auth.exceptions';

const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';

function createMockExecutionContext(user?: Record<string, unknown>) {
  const request = { user };
  const context = {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
    }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  };
  return { context, request };
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let rbacCacheService: { getUserRole: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: vi.fn((metadataKey: string) => {
        if (metadataKey === IS_PUBLIC_KEY) {
          return false;
        }

        if (metadataKey === ROLES_KEY) {
          return undefined;
        }

        return undefined;
      }),
    };
    rbacCacheService = { getUserRole: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: reflector },
        { provide: RbacCacheService, useValue: rbacCacheService },
      ],
    }).compile();

    guard = module.get(RolesGuard);
  });

  it('@Public ルートの場合ガードをスキップする', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) =>
      metadataKey === IS_PUBLIC_KEY ? true : undefined,
    );
    const { context } = createMockExecutionContext();

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
    expect(rbacCacheService.getUserRole).not.toHaveBeenCalled();
  });

  it('@Roles 未設定の場合ガードをスキップする', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) =>
      metadataKey === IS_PUBLIC_KEY ? false : undefined,
    );
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      tenantId: TEST_TENANT_ID,
    });

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
    expect(rbacCacheService.getUserRole).not.toHaveBeenCalled();
  });

  it('空の @Roles() の場合ガードをスキップする', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_KEY) {
        return false;
      }

      if (metadataKey === ROLES_KEY) {
        return [];
      }

      return undefined;
    });
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      tenantId: TEST_TENANT_ID,
    });

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it('ユーザーの役割が必要な役割に含まれる場合許可する', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_KEY) {
        return false;
      }

      if (metadataKey === ROLES_KEY) {
        return ['owner', 'admin'];
      }

      return undefined;
    });
    rbacCacheService.getUserRole.mockResolvedValue('admin');
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      tenantId: TEST_TENANT_ID,
    });

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
    expect(rbacCacheService.getUserRole).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'user-1',
    );
  });

  it('ユーザーの役割が不足している場合 InsufficientPermissionsException を投げる', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_KEY) {
        return false;
      }

      if (metadataKey === ROLES_KEY) {
        return ['owner', 'admin'];
      }

      return undefined;
    });
    rbacCacheService.getUserRole.mockResolvedValue('viewer');
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      tenantId: TEST_TENANT_ID,
    });

    try {
      await guard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientPermissionsException);
      const ie = error as InsufficientPermissionsException;
      expect(ie.getStatus()).toBe(403);
      expect(ie.type).toBe(
        'https://agentloom.dev/errors/insufficient-permissions',
      );
    }
  });

  it('ユーザーの役割が見つからない場合 InsufficientPermissionsException を投げる', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_KEY) {
        return false;
      }

      if (metadataKey === ROLES_KEY) {
        return ['owner'];
      }

      return undefined;
    });
    rbacCacheService.getUserRole.mockResolvedValue(null);
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      tenantId: TEST_TENANT_ID,
    });

    try {
      await guard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientPermissionsException);
    }
  });

  it('tenantId がない場合 TenantRequiredException を投げる', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_KEY) {
        return false;
      }

      if (metadataKey === ROLES_KEY) {
        return ['owner'];
      }

      return undefined;
    });
    const { context } = createMockExecutionContext({
      sub: 'user-1',
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      TenantRequiredException,
    );
    expect(rbacCacheService.getUserRole).not.toHaveBeenCalled();
  });

  it('tenantId が UUID でない場合 InvalidTenantContextException を投げる', async () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_KEY) {
        return false;
      }

      if (metadataKey === ROLES_KEY) {
        return ['owner'];
      }

      return undefined;
    });
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      tenantId: 'tenant-not-a-uuid',
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      InvalidTenantContextException,
    );
    expect(rbacCacheService.getUserRole).not.toHaveBeenCalled();
  });
});
