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
import { PluginSignatureService } from './plugin-signature.service';
import { PluginService } from './plugin.service';

const mocks = vi.hoisted(() => ({
  createMockPluginService: () => ({
    register: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    remove: vi.fn(),
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

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
  file: () => Promise<unknown>;
};

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

async function createPluginArchiveBuffer(): Promise<Buffer> {
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
    }),
  );
  zip.file('node-definitions.json', JSON.stringify([{ type: 'review-analyzer' }]));

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function createRegisterRequest(status = 'active'): Promise<AuthenticatedRequest> {
  const buffer = await createPluginArchiveBuffer();

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
    file: vi.fn().mockResolvedValue({
      filename: 'review-plugin.alp',
      fields: {
        status: { value: status },
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
      const activePlugin = createPluginResponse({ status: 'active', occVersion: 2 });
      service.register.mockResolvedValue(createdPlugin);
      service.updateStatus.mockResolvedValue(activePlugin);

      const result = await controller.register(await createRegisterRequest());

      expect(getRoles(controller, 'register')).toEqual(['owner', 'admin', 'creator']);
      expect(getHttpCode(controller, 'register')).toBe(HttpStatus.CREATED);
      expect(service.register).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
        USER_ID,
        expect.objectContaining({
          pluginId: 'com.example.review',
          name: 'Review Analyzer',
        }),
        expect.arrayContaining([expect.objectContaining({ type: 'review-analyzer' })]),
        expect.stringContaining('tenants/'),
        expect.objectContaining({}),
      );
      expect(storageService.upload).toHaveBeenCalled();
      expect(service.updateStatus).toHaveBeenCalledWith(
        PLUGIN_RECORD_ID,
        TENANT_ID,
        'active',
        1,
      );
      expect(result).toEqual({ data: activePlugin });
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

      const result = await controller.findById(PLUGIN_RECORD_ID, createRequest());

      expect(getRoles(controller, 'findById')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
      expect(service.findById).toHaveBeenCalledWith(PLUGIN_RECORD_ID, TENANT_ID);
      expect(result).toEqual({ data: plugin });
    });
  });

  describe('updateStatus', () => {
    it('应更新插件状态并返回包装结果', async () => {
      const dto = Object.assign(new UpdatePluginStatusDto(), {
        status: 'disabled',
        occVersion: 2,
      });
      const updatedPlugin = createPluginResponse({ status: 'disabled', occVersion: 3 });
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
