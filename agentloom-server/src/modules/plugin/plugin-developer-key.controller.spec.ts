import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { PluginDeveloperKey } from '../../database/schema';
import {
  QueryDeveloperKeysDto,
  QueryDeveloperKeysSchema,
  RegisterDeveloperKeyDto,
  RegisterDeveloperKeySchema,
} from './dto/plugin-developer-key.dto';
import { PluginDeveloperKeyController } from './plugin-developer-key.controller';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';

const mocks = vi.hoisted(() => ({
  createMockPluginDeveloperKeyService: () => ({
    registerKey: vi.fn(),
    listKeys: vi.fn(),
    findById: vi.fn(),
    revokeKey: vi.fn(),
  }),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const KEY_ID = '44444444-4444-4444-8444-444444444444';
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----';

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

function createDeveloperKey(
  overrides: Partial<PluginDeveloperKey> = {},
): PluginDeveloperKey {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: KEY_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    userId: USER_ID,
    publicKey: PUBLIC_KEY,
    keyFingerprint: 'a'.repeat(64),
    label: '主开发密钥',
    status: 'active',
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PluginDeveloperKeyController', () => {
  let controller: PluginDeveloperKeyController;
  let service: ReturnType<typeof mocks.createMockPluginDeveloperKeyService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = mocks.createMockPluginDeveloperKeyService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PluginDeveloperKeyController],
      providers: [
        {
          provide: PluginDeveloperKeyService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(PluginDeveloperKeyController);
  });

  describe('registerKey', () => {
    it('应声明 creator/admin/owner 角色与 201 状态码，并调用 service 注册密钥', async () => {
      const dto = Object.assign(new RegisterDeveloperKeyDto(), {
        publicKey: PUBLIC_KEY,
        label: '主开发密钥',
      });
      const record = createDeveloperKey();
      service.registerKey.mockResolvedValue(record);

      const result = await controller.registerKey(
        TENANT_ID,
        ORG_ID,
        USER_ID,
        dto,
      );

      expect(getRoles(controller, 'registerKey')).toEqual([
        'creator',
        'admin',
        'owner',
      ]);
      expect(getHttpCode(controller, 'registerKey')).toBe(HttpStatus.CREATED);
      expect(service.registerKey).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
        USER_ID,
        PUBLIC_KEY,
        '主开发密钥',
      );
      expect(result).toEqual(record);
    });
  });

  describe('listKeys', () => {
    it('应调用 service 返回分页密钥列表', async () => {
      const query = Object.assign(
        new QueryDeveloperKeysDto(),
        QueryDeveloperKeysSchema.parse({
          status: 'active',
          page: '2',
          pageSize: '10',
        }),
      );
      const payload = {
        data: [createDeveloperKey()],
        meta: { total: 1, page: 2, pageSize: 10, totalPages: 1 },
      };
      service.listKeys.mockResolvedValue(payload);

      const result = await controller.listKeys(ORG_ID, query);

      expect(getRoles(controller, 'listKeys')).toEqual([
        'creator',
        'admin',
        'owner',
      ]);
      expect(service.listKeys).toHaveBeenCalledWith(ORG_ID, query);
      expect(result).toEqual(payload);
    });
  });

  describe('findById', () => {
    it('应调用 service 返回密钥详情', async () => {
      const record = createDeveloperKey();
      service.findById.mockResolvedValue(record);

      const result = await controller.findById(ORG_ID, KEY_ID);

      expect(getRoles(controller, 'findById')).toEqual([
        'creator',
        'admin',
        'owner',
      ]);
      expect(service.findById).toHaveBeenCalledWith(ORG_ID, KEY_ID);
      expect(result).toEqual(record);
    });
  });

  describe('revokeKey', () => {
    it('应声明 creator/admin/owner 角色与 200 状态码，并调用 service 撤销密钥', async () => {
      const revokedKey = createDeveloperKey({
        status: 'revoked',
        revokedAt: new Date('2025-01-02T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      });
      service.revokeKey.mockResolvedValue(revokedKey);

      const result = await controller.revokeKey(ORG_ID, KEY_ID);

      expect(getRoles(controller, 'revokeKey')).toEqual([
        'creator',
        'admin',
        'owner',
      ]);
      expect(getHttpCode(controller, 'revokeKey')).toBe(HttpStatus.OK);
      expect(service.revokeKey).toHaveBeenCalledWith(ORG_ID, KEY_ID);
      expect(result).toEqual(revokedKey);
    });
  });

  describe('DTO 校验', () => {
    it('应校验注册 DTO 的必填公钥字段', () => {
      expect(() =>
        RegisterDeveloperKeySchema.parse({ publicKey: '' }),
      ).toThrow();
      expect(
        RegisterDeveloperKeySchema.parse({ publicKey: PUBLIC_KEY }),
      ).toEqual({
        publicKey: PUBLIC_KEY,
      });
    });

    it('应对查询 DTO 进行类型转换并补齐默认值', () => {
      expect(
        QueryDeveloperKeysSchema.parse({ page: '2', pageSize: '5' }),
      ).toEqual({
        page: 2,
        pageSize: 5,
      });
      expect(QueryDeveloperKeysSchema.parse({})).toEqual({
        page: 1,
        pageSize: 20,
      });
    });
  });
});
