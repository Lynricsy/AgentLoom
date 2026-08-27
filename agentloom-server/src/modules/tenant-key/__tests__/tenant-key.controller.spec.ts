import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../../common/guards/auth.guard';
import type { TenantEncryptionKey } from '../../../database/schema';
import { TenantOrganizationResolver } from '../../../common/providers/tenant-organization.resolver';
import { UploadPublicKeyDto } from '../dto/tenant-key.dto';
import { TenantKeyController } from '../tenant-key.controller';
import { TenantKeyService } from '../tenant-key.service';
import { TenantOrganizationNotFoundException } from '../exceptions/tenant-key.exceptions';

const mocks = vi.hoisted(() => ({
  createMockTenantKeyService: () => ({
    uploadPublicKey: vi.fn(),
    findByOrg: vi.fn(),
    findById: vi.fn(),
    rotateKey: vi.fn(),
    revokeKey: vi.fn(),
  }),
  createMockOrganizationResolver: () => ({
    findOrganizationId: vi.fn().mockResolvedValue(ORG_ID),
  }),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '33333333-3333-4333-8333-333333333333';
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----';
const USER: JwtPayload = {
  sub: '44444444-4444-4444-8444-444444444444',
  email: 'owner@example.com',
  aud: 'authenticated',
  exp: 2_000_000_000,
  iat: 1_900_000_000,
  orgId: ORG_ID,
};

function getRoles(
  controller: object,
  methodName: string,
): string[] | undefined {
  const handler = Reflect.get(controller, methodName);

  return typeof handler === 'function'
    ? (Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined)
    : undefined;
}

function getHttpCode(
  controller: object,
  methodName: string,
): number | undefined {
  const handler = Reflect.get(controller, methodName);

  return typeof handler === 'function'
    ? (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined)
    : undefined;
}

function createTenantKey(
  overrides: Partial<TenantEncryptionKey> = {},
): TenantEncryptionKey {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: KEY_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    publicKey: PUBLIC_KEY,
    keyFingerprint: 'a'.repeat(64),
    status: 'active',
    activatedAt: now,
    rotatedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TenantKeyController', () => {
  let controller: TenantKeyController;
  let service: ReturnType<typeof mocks.createMockTenantKeyService>;
  let organizationResolver: ReturnType<
    typeof mocks.createMockOrganizationResolver
  >;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = mocks.createMockTenantKeyService();
    organizationResolver = mocks.createMockOrganizationResolver();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantKeyController],
      providers: [
        {
          provide: TenantKeyService,
          useValue: service,
        },
        {
          provide: TenantOrganizationResolver,
          useValue: organizationResolver,
        },
      ],
    }).compile();

    controller = module.get(TenantKeyController);
  });

  describe('uploadPublicKey', () => {
    it('应声明 owner/admin 角色与 201 状态码，并返回详情映射', async () => {
      const dto: UploadPublicKeyDto = { publicKey: PUBLIC_KEY };
      const createdKey = createTenantKey();
      service.uploadPublicKey.mockResolvedValue(createdKey);

      const result = await controller.uploadPublicKey(dto, TENANT_ID, USER);

      expect(getRoles(controller, 'uploadPublicKey')).toEqual([
        'owner',
        'admin',
      ]);
      expect(getHttpCode(controller, 'uploadPublicKey')).toBe(
        HttpStatus.CREATED,
      );
      expect(service.uploadPublicKey).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
        dto,
      );
      expect(result).toEqual({
        id: KEY_ID,
        orgId: ORG_ID,
        publicKey: PUBLIC_KEY,
        keyFingerprint: 'a'.repeat(64),
        status: 'active',
        activatedAt: '2025-01-01T00:00:00.000Z',
        rotatedAt: null,
        revokedAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
    });

    it('JWT 无 org claim 时应经共享租户组织解析器回查后上传', async () => {
      const dto: UploadPublicKeyDto = { publicKey: PUBLIC_KEY };
      const createdKey = createTenantKey();
      service.uploadPublicKey.mockResolvedValue(createdKey);

      await controller.uploadPublicKey(dto, TENANT_ID, {
        ...USER,
        orgId: undefined,
        org_id: undefined,
      });

      expect(organizationResolver.findOrganizationId).toHaveBeenCalledWith(
        TENANT_ID,
      );
      expect(service.uploadPublicKey).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
        dto,
      );
    });

    it('tenant 未关联组织时应抛出显式领域异常且不查询密钥', async () => {
      // 解析器约定「查不到返回 null」，由 controller 翻译成 404 领域异常。
      organizationResolver.findOrganizationId.mockResolvedValue(null);

      await expect(
        controller.uploadPublicKey(
          { publicKey: PUBLIC_KEY },
          TENANT_ID,
          {
            ...USER,
            orgId: undefined,
            org_id: undefined,
          },
        ),
      ).rejects.toBeInstanceOf(TenantOrganizationNotFoundException);
      expect(service.uploadPublicKey).not.toHaveBeenCalled();
    });
  });

  describe('findByOrg', () => {
    it('应调用 service.findByOrg 并返回不含 publicKey 的列表映射', async () => {
      service.findByOrg.mockResolvedValue([
        createTenantKey(),
        createTenantKey({
          id: '44444444-4444-4444-8444-444444444444',
          keyFingerprint: 'b'.repeat(64),
        }),
      ]);

      const result = await controller.findByOrg(TENANT_ID, USER);

      expect(getRoles(controller, 'findByOrg')).toEqual([
        'operator',
        'creator',
        'admin',
        'owner',
      ]);
      expect(service.findByOrg).toHaveBeenCalledWith(TENANT_ID, ORG_ID);
      expect(result).toEqual([
        {
          id: KEY_ID,
          orgId: ORG_ID,
          keyFingerprint: 'a'.repeat(64),
          status: 'active',
          activatedAt: '2025-01-01T00:00:00.000Z',
          rotatedAt: null,
          revokedAt: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          orgId: ORG_ID,
          keyFingerprint: 'b'.repeat(64),
          status: 'active',
          activatedAt: '2025-01-01T00:00:00.000Z',
          rotatedAt: null,
          revokedAt: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]);
      expect(result[0]).not.toHaveProperty('publicKey');
    });
  });

  describe('findById', () => {
    it('应调用 service.findById 并返回详情映射', async () => {
      service.findById.mockResolvedValue(createTenantKey());

      const result = await controller.findById(KEY_ID, TENANT_ID);

      expect(getRoles(controller, 'findById')).toEqual([
        'operator',
        'creator',
        'admin',
        'owner',
      ]);
      expect(service.findById).toHaveBeenCalledWith(TENANT_ID, KEY_ID);
      expect(result).toMatchObject({
        id: KEY_ID,
        orgId: ORG_ID,
        publicKey: PUBLIC_KEY,
      });
    });
  });

  describe('rotateKey', () => {
    it('应声明 owner/admin 角色与 200 状态码，并返回轮换后的详情', async () => {
      const dto: UploadPublicKeyDto = { publicKey: PUBLIC_KEY };
      const rotatedKey = createTenantKey({
        rotatedAt: new Date('2025-01-02T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      });
      service.rotateKey.mockResolvedValue(rotatedKey);

      const result = await controller.rotateKey(KEY_ID, dto, TENANT_ID);

      expect(getRoles(controller, 'rotateKey')).toEqual(['owner', 'admin']);
      expect(getHttpCode(controller, 'rotateKey')).toBe(HttpStatus.OK);
      expect(service.rotateKey).toHaveBeenCalledWith(TENANT_ID, KEY_ID, dto);
      expect(result).toEqual({
        id: KEY_ID,
        orgId: ORG_ID,
        publicKey: PUBLIC_KEY,
        keyFingerprint: 'a'.repeat(64),
        status: 'active',
        activatedAt: '2025-01-01T00:00:00.000Z',
        rotatedAt: '2025-01-02T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      });
    });
  });

  describe('revokeKey', () => {
    it('应声明 owner/admin 角色与 200 状态码，并返回撤销后的详情', async () => {
      const revokedKey = createTenantKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-03T00:00:00.000Z'),
        updatedAt: new Date('2025-01-03T00:00:00.000Z'),
      });
      service.revokeKey.mockResolvedValue(revokedKey);

      const result = await controller.revokeKey(KEY_ID, TENANT_ID);

      expect(getRoles(controller, 'revokeKey')).toEqual(['owner', 'admin']);
      expect(getHttpCode(controller, 'revokeKey')).toBe(HttpStatus.OK);
      expect(service.revokeKey).toHaveBeenCalledWith(TENANT_ID, KEY_ID);
      expect(result).toEqual({
        id: KEY_ID,
        orgId: ORG_ID,
        publicKey: PUBLIC_KEY,
        keyFingerprint: 'a'.repeat(64),
        status: 'revoked',
        activatedAt: '2025-01-01T00:00:00.000Z',
        rotatedAt: null,
        revokedAt: '2025-01-03T00:00:00.000Z',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-03T00:00:00.000Z',
      });
    });
  });
});
