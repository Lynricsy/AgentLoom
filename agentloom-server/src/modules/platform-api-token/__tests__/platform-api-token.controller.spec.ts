import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantRequiredException } from '../../../common/exceptions/auth.exceptions';
import type { JwtPayload } from '../../../common/guards/auth.guard';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { PlatformApiTokenNotFoundException } from '../platform-api-token.exceptions';
import { QueryPlatformApiTokenSchema } from '../dto/query-platform-api-token.dto';
import { PlatformApiTokenController } from '../platform-api-token.controller';
import { PlatformApiTokenService } from '../platform-api-token.service';

const mocks = vi.hoisted(() => ({
  createMockPlatformApiTokenService: () => ({
    generateToken: vi.fn(),
    findAll: vi.fn(),
    revoke: vi.fn(),
  }),
}));

const NOW = new Date('2025-01-01T00:00:00.000Z');
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_ID = '33333333-3333-4333-8333-333333333333';

type MockRequestShape = {
  tenantId?: string;
  user: JwtPayload;
};

type MockRequestOverrides = {
  tenantId?: string;
  omitTenantId?: boolean;
  user?: Partial<JwtPayload>;
};

function createMockRequest(
  overrides: MockRequestOverrides = {},
): MockRequestShape {
  const baseUser: JwtPayload = {
    sub: USER_ID,
    email: 'test@example.com',
    aud: 'authenticated',
    exp: 1_736_000_000,
    iat: 1_735_996_400,
    tenantId: TENANT_ID,
    tenantRole: 'owner',
  };

  const request: MockRequestShape = {
    user: {
      ...baseUser,
      ...(overrides.user ?? {}),
    },
  };

  if (!overrides.omitTenantId) {
    request.tenantId = overrides.tenantId ?? TENANT_ID;
  }

  return request;
}

function getRoles(controller: object, methodName: string): string[] | undefined {
  const handler = Reflect.get(controller, methodName);
  return typeof handler === 'function'
    ? (Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined)
    : undefined;
}

function getHttpCode(controller: object, methodName: string): number | undefined {
  const handler = Reflect.get(controller, methodName);
  return typeof handler === 'function'
    ? (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined)
    : undefined;
}

function getPrivateMethod<TArgs extends unknown[], TResult>(
  target: object,
  methodName: string,
): (...args: TArgs) => TResult {
  const method = Reflect.get(target, methodName);
  expect(typeof method).toBe('function');

  if (typeof method !== 'function') {
    expect.unreachable(`预期 ${methodName} 是可调用方法`);
  }

  return method.bind(target) as (...args: TArgs) => TResult;
}

describe('PlatformApiTokenController', () => {
  let controller: PlatformApiTokenController;
  let service: ReturnType<typeof mocks.createMockPlatformApiTokenService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = mocks.createMockPlatformApiTokenService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformApiTokenController],
      providers: [
        {
          provide: PlatformApiTokenService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(PlatformApiTokenController);
  });

  describe('create', () => {
    it('应声明 201 状态码', () => {
      expect(getHttpCode(controller, 'create')).toBe(HttpStatus.CREATED);
    });

    it('应调用 service.generateToken 并返回 data 包装', async () => {
      const dto = {
        name: '部署令牌',
        scopes: 'workflow:run',
        expires_at: '2025-12-31T00:00:00.000Z',
      };
      const req = createMockRequest();
      const createdToken = {
        id: TOKEN_ID,
        name: '部署令牌',
        tokenPrefix: 'al_12345678',
        scopes: 'workflow:run',
        lastUsedAt: null,
        expiresAt: new Date('2025-12-31T00:00:00.000Z'),
        isRevoked: false,
        createdAt: NOW,
        token: 'al_1234567890abcdef',
      };
      service.generateToken.mockResolvedValue(createdToken);

      const result = await controller.create(
        dto,
        req as Parameters<PlatformApiTokenController['create']>[1],
      );

      expect(result).toEqual({ data: createdToken });
      expect(service.generateToken).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });
  });

  describe('list', () => {
    it('应使用默认查询参数调用 service.findAll', async () => {
      const req = createMockRequest();
      const query = QueryPlatformApiTokenSchema.parse({});
      const serviceResult = {
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
        },
      };
      service.findAll.mockResolvedValue(serviceResult);

      const result = await controller.list(
        query,
        req as Parameters<PlatformApiTokenController['list']>[1],
      );

      expect(result).toEqual(serviceResult);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
    });

    it('应透传自定义查询参数', async () => {
      const req = createMockRequest();
      const query = {
        page: 2,
        page_size: 5,
        status: 'revoked' as const,
      };
      const serviceResult = {
        data: [
          {
            id: TOKEN_ID,
            name: '已撤销令牌',
            tokenPrefix: 'al_12345678',
            scopes: null,
            lastUsedAt: null,
            expiresAt: null,
            isRevoked: true,
            createdAt: NOW,
          },
        ],
        meta: {
          page: 2,
          pageSize: 5,
          total: 1,
        },
      };
      service.findAll.mockResolvedValue(serviceResult);

      const result = await controller.list(
        query,
        req as Parameters<PlatformApiTokenController['list']>[1],
      );

      expect(result).toEqual(serviceResult);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
    });

    it('应允许 viewer 角色访问 list', () => {
      expect(getRoles(controller, 'list')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
    });
  });

  describe('revoke', () => {
    it('应声明 204 状态码并调用 service.revoke', async () => {
      const req = createMockRequest();
      service.revoke.mockResolvedValue(undefined);

      await expect(
        controller.revoke(
          TOKEN_ID,
          req as Parameters<PlatformApiTokenController['revoke']>[1],
        ),
      ).resolves.toBeUndefined();

      expect(getHttpCode(controller, 'revoke')).toBe(HttpStatus.NO_CONTENT);
      expect(service.revoke).toHaveBeenCalledWith(TENANT_ID, USER_ID, TOKEN_ID);
    });

    it('应透传 service.revoke 抛出的 404 异常', async () => {
      const req = createMockRequest();
      service.revoke.mockRejectedValue(
        new PlatformApiTokenNotFoundException(TOKEN_ID),
      );

      await expect(
        controller.revoke(
          TOKEN_ID,
          req as Parameters<PlatformApiTokenController['revoke']>[1],
        ),
      ).rejects.toBeInstanceOf(PlatformApiTokenNotFoundException);
    });
  });

  describe('getTenantId', () => {
    it('应优先从 req.tenantId 提取租户 ID', () => {
      const req = createMockRequest({
        tenantId: '44444444-4444-4444-8444-444444444444',
        user: { tenantId: TENANT_ID },
      });
      const method = getPrivateMethod<[MockRequestShape], string>(
        controller,
        'getTenantId',
      );

      expect(method(req)).toBe('44444444-4444-4444-8444-444444444444');
    });

    it('应在 req.tenantId 缺失时回退到 req.user.tenantId', () => {
      const req = createMockRequest({
        omitTenantId: true,
        user: { tenantId: TENANT_ID },
      });
      const method = getPrivateMethod<[MockRequestShape], string>(
        controller,
        'getTenantId',
      );

      expect(method(req)).toBe(TENANT_ID);
    });

    it('应在两个来源都缺失时抛出租户缺失异常', () => {
      const req = createMockRequest({
        omitTenantId: true,
        user: { tenantId: undefined },
      });
      const method = getPrivateMethod<[MockRequestShape], string>(
        controller,
        'getTenantId',
      );

      expect(() => method(req)).toThrow(TenantRequiredException);
    });
  });
});
