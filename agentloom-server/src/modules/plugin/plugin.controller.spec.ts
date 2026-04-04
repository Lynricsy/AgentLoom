import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { QueryPluginsDto, UpdatePluginStatusDto } from './dto/plugin.dto';
import { PluginController } from './plugin.controller';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';
import {
  PluginSignatureInvalidException,
  PluginSignatureMissingException,
} from './plugin.exceptions';
import { PluginSignatureService } from './plugin-signature.service';
import { PluginService } from './plugin.service';

const mocks = vi.hoisted(() => ({
  createMockPluginService: () => ({
    register: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    remove: vi.fn(),
    resolveOrganizationId: vi.fn().mockResolvedValue(ORG_ID),
  }),
  createMockStorageService: () => ({
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    getPresignedUrl: vi.fn(),
    buildStorageKey: vi.fn(),
  }),
  createMockSignatureService: () => ({
    verifyArchiveSignature: vi
      .fn()
      .mockResolvedValue({ valid: true, contentHash: 'abc123' }),
    computeContentHash: vi.fn().mockReturnValue('abc123'),
    validatePublicKey: vi.fn(),
    computeKeyFingerprint: vi.fn().mockReturnValue('fingerprint123'),
  }),
  createMockDeveloperKeyService: () => ({
    registerKey: vi.fn(),
    listKeys: vi.fn(),
    findById: vi.fn(),
    revokeKey: vi.fn(),
    findActiveKeyByFingerprint: vi.fn().mockResolvedValue(null),
  }),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PLUGIN_RECORD_ID = '44444444-4444-4444-8444-444444444444';
const SIGNATURE = Buffer.from('signed-plugin').toString('base64');
const CONTENT_HASH = 'a'.repeat(64);
const KEY_FINGERPRINT = 'b'.repeat(64);

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
  file: () => Promise<unknown>;
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

function createPluginResponse(overrides: Record<string, unknown> = {}) {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: PLUGIN_RECORD_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    pluginId: 'com.example.review',
    name: 'Review Analyzer',
    version: '1.0.0',
    author: '狐娘',
    description: '分析评论的插件',
    license: 'MIT',
    status: 'registered',
    manifest: {
      id: 'com.example.review',
      name: 'Review Analyzer',
      version: '1.0.0',
      author: '狐娘',
      description: '分析评论的插件',
      license: 'MIT',
      minPlatformVersion: '1.0.0',
      permissions: ['network:outbound'],
    },
    nodeDefinitions: [{ type: 'review-analyzer' }],
    storageKey: null,
    signature: null,
    contentHash: null,
    wasmBundleUrl: null,
    permissions: ['network:outbound'],
    installedBy: USER_ID,
    metadata: { category: 'analysis' },
    occVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function createPluginArchiveBuffer(
  manifestOverrides: Record<string, unknown> = {},
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    'manifest.json',
    JSON.stringify({
      pluginId: 'com.example.review',
      name: 'Review Analyzer',
      version: '1.0.0',
      author: '狐娘',
      description: '分析评论的插件',
      license: 'MIT',
      minPlatformVersion: '1.0.0',
      permissions: ['network:outbound'],
      ...manifestOverrides,
    }),
  );
  zip.file(
    'node-definitions.json',
    JSON.stringify([{ type: 'review-analyzer' }]),
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function createRegisterRequest(options?: {
  status?: string;
  manifestOverrides?: Record<string, unknown>;
  userOverrides?: Partial<JwtPayload>;
}): Promise<AuthenticatedRequest> {
  const buffer = await createPluginArchiveBuffer(options?.manifestOverrides);

  return {
    tenantId: TENANT_ID,
    user: {
      email: 'fox@ling.plus',
      aud: 'authenticated',
      exp: 1_735_689_600,
      iat: 1_735_603_200,
      sub: USER_ID,
      tenantId: TENANT_ID,
      orgId: ORG_ID,
      ...options?.userOverrides,
    },
    file: vi.fn().mockResolvedValue({
      filename: 'review-plugin.alp',
      fields: {
        status: { value: options?.status ?? 'active' },
      },
      file: { truncated: false },
      toBuffer: vi.fn().mockResolvedValue(buffer),
    }),
  } as unknown as AuthenticatedRequest;
}

function createRequest(): AuthenticatedRequest {
  return {
    tenantId: TENANT_ID,
    user: {
      email: 'fox@ling.plus',
      aud: 'authenticated',
      exp: 1_735_689_600,
      iat: 1_735_603_200,
      sub: USER_ID,
      tenantId: TENANT_ID,
      orgId: ORG_ID,
    },
    file: vi.fn(),
  } as unknown as AuthenticatedRequest;
}

describe('PluginController', () => {
  let controller: PluginController;
  let service: ReturnType<typeof mocks.createMockPluginService>;
  let storageService: ReturnType<typeof mocks.createMockStorageService>;
  let signatureService: ReturnType<typeof mocks.createMockSignatureService>;
  let developerKeyService: ReturnType<
    typeof mocks.createMockDeveloperKeyService
  >;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = mocks.createMockPluginService();
    storageService = mocks.createMockStorageService();
    signatureService = mocks.createMockSignatureService();
    developerKeyService = mocks.createMockDeveloperKeyService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PluginController],
      providers: [
        {
          provide: PluginService,
          useValue: service,
        },
        {
          provide: StorageService,
          useValue: storageService,
        },
        {
          provide: PluginSignatureService,
          useValue: signatureService,
        },
        {
          provide: PluginDeveloperKeyService,
          useValue: developerKeyService,
        },
      ],
    }).compile();

    controller = module.get(PluginController);
  });

  describe('register', () => {
    it('应上传 .alp 包、注册插件并按需切换状态', async () => {
      const createdPlugin = createPluginResponse();
      const activePlugin = createPluginResponse({
        status: 'active',
        occVersion: 2,
      });
      developerKeyService.findActiveKeyByFingerprint.mockResolvedValue({
        id: 'key-1',
        publicKey: 'public-key-pem',
      });
      signatureService.verifyArchiveSignature.mockResolvedValue({
        valid: true,
        contentHash: CONTENT_HASH,
      });
      service.register.mockResolvedValue(createdPlugin);
      service.updateStatus.mockResolvedValue(activePlugin);

      const result = await controller.register(
        await createRegisterRequest({
          manifestOverrides: {
            signature: SIGNATURE,
            contentHash: CONTENT_HASH,
            developerKeyFingerprint: KEY_FINGERPRINT,
          },
        }),
      );

      expect(getRoles(controller, 'register')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
      expect(getHttpCode(controller, 'register')).toBe(HttpStatus.CREATED);
      expect(service.register).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
        USER_ID,
        expect.objectContaining({
          pluginId: 'com.example.review',
          name: 'Review Analyzer',
        }),
        expect.arrayContaining([
          expect.objectContaining({ type: 'review-analyzer' }),
        ]),
        expect.stringContaining('tenants/'),
        expect.objectContaining({
          signature: SIGNATURE,
          contentHash: CONTENT_HASH,
        }),
      );
      expect(
        developerKeyService.findActiveKeyByFingerprint,
      ).toHaveBeenCalledWith(ORG_ID, KEY_FINGERPRINT);
      expect(signatureService.verifyArchiveSignature).toHaveBeenCalledWith(
        expect.any(Buffer),
        SIGNATURE,
        'public-key-pem',
        'com.example.review',
      );
      expect(storageService.upload).toHaveBeenCalled();
      expect(service.updateStatus).toHaveBeenCalledWith(
        PLUGIN_RECORD_ID,
        TENANT_ID,
        'active',
        1,
      );
      expect(result).toEqual({ data: activePlugin });
      expect(service.resolveOrganizationId).not.toHaveBeenCalled();
    });

    it('JWT 缺少 org claim 时应按 tenant 回查 organization 后继续验签', async () => {
      const createdPlugin = createPluginResponse();
      developerKeyService.findActiveKeyByFingerprint.mockResolvedValue({
        id: 'key-1',
        publicKey: 'public-key-pem',
      });
      signatureService.verifyArchiveSignature.mockResolvedValue({
        valid: true,
        contentHash: CONTENT_HASH,
      });
      service.register.mockResolvedValue(createdPlugin);

      const result = await controller.register(
        await createRegisterRequest({
          status: 'registered',
          manifestOverrides: {
            signature: SIGNATURE,
            contentHash: CONTENT_HASH,
            developerKeyFingerprint: KEY_FINGERPRINT,
          },
          userOverrides: {
            orgId: undefined,
            org_id: undefined,
          },
        }),
      );

      expect(service.resolveOrganizationId).toHaveBeenCalledWith(TENANT_ID);
      expect(
        developerKeyService.findActiveKeyByFingerprint,
      ).toHaveBeenCalledWith(ORG_ID, KEY_FINGERPRINT);
      expect(result).toEqual({ data: createdPlugin });
    });

    it('未签名插件应抛出 PluginSignatureMissingException 并拒绝注册', async () => {
      await expect(
        controller.register(await createRegisterRequest()),
      ).rejects.toThrow(PluginSignatureMissingException);

      expect(storageService.upload).not.toHaveBeenCalled();
      expect(service.register).not.toHaveBeenCalled();
    });

    it('签名元数据不完整时应抛出 PluginSignatureMissingException', async () => {
      await expect(
        controller.register(
          await createRegisterRequest({
            manifestOverrides: {
              signature: SIGNATURE,
              developerKeyFingerprint: KEY_FINGERPRINT,
            },
          }),
        ),
      ).rejects.toThrow(PluginSignatureMissingException);

      expect(storageService.upload).not.toHaveBeenCalled();
      expect(service.register).not.toHaveBeenCalled();
    });

    it('找不到活跃开发者密钥时应抛出 PluginSignatureInvalidException', async () => {
      await expect(
        controller.register(
          await createRegisterRequest({
            manifestOverrides: {
              signature: SIGNATURE,
              contentHash: CONTENT_HASH,
              developerKeyFingerprint: KEY_FINGERPRINT,
            },
          }),
        ),
      ).rejects.toThrow(PluginSignatureInvalidException);

      expect(storageService.upload).not.toHaveBeenCalled();
      expect(service.register).not.toHaveBeenCalled();
    });

    it('contentHash 与验签结果不一致时应抛出 PluginSignatureInvalidException', async () => {
      developerKeyService.findActiveKeyByFingerprint.mockResolvedValue({
        id: 'key-1',
        publicKey: 'public-key-pem',
      });
      signatureService.verifyArchiveSignature.mockResolvedValue({
        valid: true,
        contentHash: 'c'.repeat(64),
      });

      await expect(
        controller.register(
          await createRegisterRequest({
            manifestOverrides: {
              signature: SIGNATURE,
              contentHash: CONTENT_HASH,
              developerKeyFingerprint: KEY_FINGERPRINT,
            },
          }),
        ),
      ).rejects.toThrow(PluginSignatureInvalidException);

      expect(storageService.upload).not.toHaveBeenCalled();
      expect(service.register).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('应返回分页插件列表', async () => {
      const query = Object.assign(new QueryPluginsDto(), {
        page: 1,
        pageSize: 20,
        search: 'review',
      });
      const payload = {
        data: [createPluginResponse()],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
      service.findAll.mockResolvedValue(payload);

      const result = await controller.findAll(query, createRequest());

      expect(getRoles(controller, 'findAll')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual(payload);
    });
  });

  describe('findById', () => {
    it('应返回插件详情包装结果', async () => {
      const plugin = createPluginResponse();
      service.findById.mockResolvedValue(plugin);

      const result = await controller.findById(
        PLUGIN_RECORD_ID,
        createRequest(),
      );

      expect(getRoles(controller, 'findById')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
      expect(service.findById).toHaveBeenCalledWith(
        PLUGIN_RECORD_ID,
        TENANT_ID,
      );
      expect(result).toEqual({ data: plugin });
    });
  });

  describe('updateStatus', () => {
    it('应更新插件状态并返回包装结果', async () => {
      const dto = Object.assign(new UpdatePluginStatusDto(), {
        status: 'disabled',
        occVersion: 2,
      });
      const updatedPlugin = createPluginResponse({
        status: 'disabled',
        occVersion: 3,
      });
      service.updateStatus.mockResolvedValue(updatedPlugin);

      const result = await controller.updateStatus(
        PLUGIN_RECORD_ID,
        dto,
        createRequest(),
      );

      expect(getRoles(controller, 'updateStatus')).toEqual(['owner', 'admin']);
      expect(service.updateStatus).toHaveBeenCalledWith(
        PLUGIN_RECORD_ID,
        TENANT_ID,
        'disabled',
        2,
      );
      expect(result).toEqual({ data: updatedPlugin });
    });
  });

  describe('remove', () => {
    it('应删除插件并声明 204 状态码', async () => {
      service.remove.mockResolvedValue(undefined);

      await expect(
        controller.remove(PLUGIN_RECORD_ID, createRequest()),
      ).resolves.toBeUndefined();

      expect(getRoles(controller, 'remove')).toEqual(['owner', 'admin']);
      expect(getHttpCode(controller, 'remove')).toBe(HttpStatus.NO_CONTENT);
      expect(service.remove).toHaveBeenCalledWith(PLUGIN_RECORD_ID, TENANT_ID);
    });
  });
});
