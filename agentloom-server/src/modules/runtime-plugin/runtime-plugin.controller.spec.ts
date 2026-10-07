import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import type { RuntimePluginRecord } from '../../database/schema';
import { PluginDeveloperKeyService } from '../plugin/plugin-developer-key.service';
import { PluginSignatureMissingException } from '../plugin/plugin.exceptions';
import { PluginSignatureService } from '../plugin/plugin-signature.service';
import { RuntimePluginController } from './runtime-plugin.controller';
import {
  RuntimePluginUnsupportedDshVersionException,
  RuntimePluginValidationException,
} from './runtime-plugin.exceptions';
import { RuntimePluginService } from './runtime-plugin.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '44444444-4444-4444-8444-444444444444';
const SIGNATURE = Buffer.from('signed-runtime-plugin').toString('base64');
const CONTENT_HASH = 'a'.repeat(64);
const KEY_FINGERPRINT = 'b'.repeat(64);
const NOW = new Date('2026-01-01T00:00:00.000Z');

const SIGNING_FIELDS = {
  signature: SIGNATURE,
  contentHash: CONTENT_HASH,
  developerKeyFingerprint: KEY_FINGERPRINT,
};

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

interface ArchiveOptions {
  manifestOverrides?: Record<string, unknown>;
  patch?: string | null;
  entry?: string;
}

async function createRuntimeArchive(options: ArchiveOptions = {}) {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      id: 'com.example.demo-rt',
      name: 'Demo RT',
      version: '0.1.0',
      author: 'AgentLoom',
      description: 'demo runtime plugin',
      license: 'MIT',
      minPlatformVersion: '0.1.0',
      permissions: [],
      kind: 'runtime',
      runtime: {
        dshVersion: '0.2.0-rc.2',
        patch: './cordis.patch.yml',
        entry: './dist/index.js',
        configSchema: { type: 'object', properties: {} },
      },
      ...SIGNING_FIELDS,
      ...options.manifestOverrides,
    }),
  );
  if (options.patch !== null) {
    zip.file(
      'cordis.patch.yml',
      options.patch ??
        '- insert:\n    - id: demo-rt\n      name: __PLUGIN_ROOT__/dist/index.js\n',
    );
  }
  zip.file(
    'dist/index.js',
    options.entry ??
      "export const name = 'demo-rt';\nexport function apply(ctx) { console.error('ok'); }\n",
  );
  zip.file('package.json', JSON.stringify({ name: 'demo-rt' }));

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function createRegisterRequest(
  options: ArchiveOptions & { status?: string } = {},
): Promise<AuthenticatedRequest> {
  const buffer = await createRuntimeArchive(options);

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
      filename: 'demo-rt.alp',
      fields: { status: { value: options.status ?? 'active' } },
      file: { truncated: false },
      toBuffer: vi.fn().mockResolvedValue(buffer),
    }),
  } as unknown as AuthenticatedRequest;
}

function createRecord(
  overrides: Partial<RuntimePluginRecord> = {},
): RuntimePluginRecord {
  return {
    id: RECORD_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    pluginId: 'com.example.demo-rt',
    name: 'Demo RT',
    version: '0.1.0',
    author: 'AgentLoom',
    description: 'demo runtime plugin',
    license: 'MIT',
    status: 'active',
    manifest: {},
    bundlePatch: '- insert: []\n',
    configSchema: { type: 'object', properties: {} },
    storageKey:
      'tenants/x/runtime-plugins/com.example.demo-rt/0.1.0/archive.alp',
    contentHash: CONTENT_HASH,
    signature: SIGNATURE,
    sizeBytes: 100,
    installedBy: USER_ID,
    occVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function getMetadata(
  controller: object,
  methodName: string,
  key: string,
): unknown {
  const handler = Reflect.get(controller, methodName);
  return typeof handler === 'function'
    ? Reflect.getMetadata(key, handler)
    : undefined;
}

describe('RuntimePluginController', () => {
  let controller: RuntimePluginController;
  let service: {
    register: Mock;
    resolveOrganizationId: Mock;
    findAll: Mock;
    findById: Mock;
    updateStatus: Mock;
    remove: Mock;
  };
  let developerKeyService: { findActiveKeyByFingerprint: Mock };
  let signatureService: { verifyArchiveSignature: Mock };

  beforeEach(async () => {
    service = {
      register: vi.fn().mockResolvedValue(createRecord()),
      resolveOrganizationId: vi.fn().mockResolvedValue(ORG_ID),
      findAll: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      remove: vi.fn(),
    };
    developerKeyService = {
      findActiveKeyByFingerprint: vi.fn().mockResolvedValue({
        id: 'key-1',
        publicKey: 'public-key-pem',
        userId: USER_ID,
      }),
    };
    signatureService = {
      verifyArchiveSignature: vi
        .fn()
        .mockResolvedValue({ valid: true, contentHash: CONTENT_HASH }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RuntimePluginController],
      providers: [
        { provide: RuntimePluginService, useValue: service },
        { provide: PluginSignatureService, useValue: signatureService },
        { provide: PluginDeveloperKeyService, useValue: developerKeyService },
      ],
    }).compile();

    controller = module.get(RuntimePluginController);
  });

  describe('register', () => {
    it('验签通过后注册 runtime 插件，响应不含 storageKey/signature/bundlePatch', async () => {
      const result = await controller.register(await createRegisterRequest());

      expect(getMetadata(controller, 'register', ROLES_KEY)).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
      expect(getMetadata(controller, 'register', HTTP_CODE_METADATA)).toBe(
        HttpStatus.CREATED,
      );
      expect(
        developerKeyService.findActiveKeyByFingerprint,
      ).toHaveBeenCalledWith(ORG_ID, KEY_FINGERPRINT);
      expect(signatureService.verifyArchiveSignature).toHaveBeenCalledWith(
        expect.any(Buffer),
        SIGNATURE,
        'public-key-pem',
        'com.example.demo-rt',
      );
      expect(service.register).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          orgId: ORG_ID,
          userId: USER_ID,
          status: 'active',
          signature: SIGNATURE,
          contentHash: CONTENT_HASH,
          bundlePatch: expect.stringContaining('__PLUGIN_ROOT__'),
          manifest: expect.objectContaining({
            id: 'com.example.demo-rt',
            kind: 'runtime',
          }),
        }),
      );
      expect(result.data).toMatchObject({
        id: RECORD_ID,
        pluginId: 'com.example.demo-rt',
        createdAt: NOW.toISOString(),
      });
      expect(result.data).not.toHaveProperty('storageKey');
      expect(result.data).not.toHaveProperty('signature');
      expect(result.data).not.toHaveProperty('bundlePatch');
    });

    it('节点插件包（kind=node）返回 422 并提示到 /plugins 上传', async () => {
      const request = await createRegisterRequest({
        manifestOverrides: { kind: 'node', runtime: undefined },
      });

      const error = await controller.register(request).catch((e) => e);

      expect(error).toBeInstanceOf(RuntimePluginValidationException);
      expect(error.getStatus()).toBe(422);
      expect(error.detail).toContain('manifest.kind 必须为 runtime');
      expect(service.register).not.toHaveBeenCalled();
    });

    it('dshVersion 与平台支持版本不符返回 422', async () => {
      const request = await createRegisterRequest({
        manifestOverrides: {
          runtime: {
            dshVersion: '0.1.0',
            patch: './cordis.patch.yml',
            entry: './dist/index.js',
          },
        },
      });

      await expect(controller.register(request)).rejects.toBeInstanceOf(
        RuntimePluginUnsupportedDshVersionException,
      );
      expect(service.register).not.toHaveBeenCalled();
    });

    it('包内缺少 patch 文件返回 422', async () => {
      const request = await createRegisterRequest({ patch: null });

      const error = await controller.register(request).catch((e) => e);

      expect(error).toBeInstanceOf(RuntimePluginValidationException);
      expect(error.detail).toBe('插件包缺少 cordis.patch.yml');
    });

    it('patch 顶层不是列表或条目缺少 insert/id 时返回 422', async () => {
      await expect(
        controller.register(
          await createRegisterRequest({ patch: 'insert: []\n' }),
        ),
      ).rejects.toBeInstanceOf(RuntimePluginValidationException);
      await expect(
        controller.register(
          await createRegisterRequest({ patch: '- config: {}\n' }),
        ),
      ).rejects.toBeInstanceOf(RuntimePluginValidationException);
      expect(service.register).not.toHaveBeenCalled();
    });

    it('未签名包沿用节点插件的签名校验（400 签名缺失）', async () => {
      const request = await createRegisterRequest({
        manifestOverrides: { signature: undefined },
      });

      await expect(controller.register(request)).rejects.toBeInstanceOf(
        PluginSignatureMissingException,
      );
      expect(service.register).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus / remove', () => {
    it('updateStatus 只允许 owner/admin 并返回脱敏记录', async () => {
      service.updateStatus.mockResolvedValue(
        createRecord({ status: 'disabled', occVersion: 2 }),
      );

      const result = await controller.updateStatus(
        RECORD_ID,
        { status: 'disabled', occVersion: 1 },
        await createRegisterRequest(),
      );

      expect(getMetadata(controller, 'updateStatus', ROLES_KEY)).toEqual([
        'owner',
        'admin',
      ]);
      expect(service.updateStatus).toHaveBeenCalledWith(
        RECORD_ID,
        TENANT_ID,
        'disabled',
        1,
      );
      expect(result.data).toMatchObject({ status: 'disabled', occVersion: 2 });
      expect(result.data).not.toHaveProperty('storageKey');
    });

    it('remove 返回 204', async () => {
      await controller.remove(RECORD_ID, await createRegisterRequest());

      expect(getMetadata(controller, 'remove', HTTP_CODE_METADATA)).toBe(
        HttpStatus.NO_CONTENT,
      );
      expect(service.remove).toHaveBeenCalledWith(RECORD_ID, TENANT_ID);
    });
  });
});
