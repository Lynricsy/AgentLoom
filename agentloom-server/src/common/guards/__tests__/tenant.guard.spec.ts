import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { ROLES_KEY } from '../../decorators/roles.decorator';
import { TenantGuard } from '../tenant.guard';
import {
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

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: vi.fn((metadataKey: string) => {
        if (metadataKey === IS_PUBLIC_KEY) {
          return false;
        }

        if (metadataKey === ROLES_KEY) {
          return ['owner'];
        }

        return undefined;
      }),
    };

    const module = await Test.createTestingModule({
      providers: [TenantGuard, { provide: Reflector, useValue: reflector }],
    }).compile();

    guard = module.get(TenantGuard);
  });

  it('@Public ルートの場合ガードをスキップする', () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) =>
      metadataKey === IS_PUBLIC_KEY ? true : undefined,
    );
    const { context } = createMockExecutionContext();

    const result = guard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it('@Roles がない認証済みルートでは tenant がなくても許可する', () => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) =>
      metadataKey === IS_PUBLIC_KEY ? false : undefined,
    );
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      email: 'test@test.com',
    });

    const result = guard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it('@Roles 付きルートで有効な tenantId がある場合許可する', () => {
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      email: 'test@test.com',
      tenantId: TEST_TENANT_ID,
    });

    const result = guard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it('@Roles 付きルートで tenantId がない場合 TenantRequiredException を投げる', () => {
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      email: 'test@test.com',
    });

    try {
      guard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TenantRequiredException);
      const te = error as TenantRequiredException;
      expect(te.getStatus()).toBe(400);
      expect(te.type).toBe('https://agentloom.dev/errors/tenant-required');
    }
  });

  it('tenantId が UUID でない場合 InvalidTenantContextException を投げる', () => {
    const { context } = createMockExecutionContext({
      sub: 'user-1',
      email: 'test@test.com',
      tenantId: 'tenant-not-a-uuid',
    });

    try {
      guard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTenantContextException);
    }
  });
});
