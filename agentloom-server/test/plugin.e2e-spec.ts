vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

declare const vi: typeof import('vitest').vi;

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import JSZip from 'jszip';
import request from 'supertest';
import {
  computeContentHash,
  computeKeyFingerprint,
  signArchive,
  updateArchiveManifest,
} from '@agentloom/plugin-sdk';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE } from '../src/database/database.module';
import { StorageService } from '../src/infrastructure/storage/storage.service';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';
const API_BASE = '/api/v1/plugins';
const VALID_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0]);

const REQUIRED_MANIFEST = {
  id: 'dev.agentloom.e2e-signed-plugin',
  name: 'E2E Signed Plugin',
  version: '1.0.0',
  author: 'AgentLoom E2E',
  description: '用于验证插件包签名信任链的测试插件。',
  license: 'MIT',
  minPlatformVersion: '1.0.0',
  permissions: [] as string[],
};

type TestTenant = {
  userId: string;
  tenantId: string;
  orgId: string;
  headers: { authorization: string };
};

type SignedFixture = {
  archive: Buffer;
  signature: string;
  contentHash: string;
  fingerprint: string;
  publicKey: string;
};

function createMockRedisClient() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
  };
}

function createMockRedisCacheService() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    delByPattern: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn(),
  };
}

function createMockRedisPubSubService() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };
}

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
  };
}

function signToken(
  userId: string,
  email: string,
  tenantId: string,
  role: OrganizationRole,
) {
  return jwt.sign(
    {
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: role,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function createSignedFixture(): Promise<SignedFixture> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicKeyPem = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  const privateKeyPem = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const fingerprint = computeKeyFingerprint(publicKeyPem);
  const manifest = {
    ...REQUIRED_MANIFEST,
    wasmEntry: 'dist/plugin.wasm',
  };
  const zip = new JSZip();
  zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  zip.file('dist/plugin.wasm', VALID_WASM);
  zip.file(
    'node-definitions.json',
    JSON.stringify([
      {
        type: 'e2e-signed-transform',
        label: 'Signed Transform',
        category: 'transform',
        description: '验证签名插件节点定义。',
        inputPorts: [],
        outputPorts: [],
      },
    ]),
  );

  const unsignedArchive = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  const signature = await signArchive(unsignedArchive, privateKeyPem);
  const contentHash = await computeContentHash(unsignedArchive);
  const archive = await updateArchiveManifest(unsignedArchive, {
    ...manifest,
    signature,
    contentHash,
    developerKeyFingerprint: fingerprint,
  });

  expect(await computeContentHash(archive)).toBe(contentHash);
  return {
    archive,
    signature,
    contentHash,
    fingerprint,
    publicKey: publicKeyPem,
  };
}

async function tamperSignedArchive(archive: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(archive);
  zip.file(
    'dist/plugin.wasm',
    Buffer.concat([VALID_WASM, Buffer.from([0x01])]),
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('Plugin trust chain (E2E)', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let owner: TestTenant;
  let viewer: TestTenant;
  let outsider: TestTenant;
  let fixture: SignedFixture;
  const storedObjects = new Map<string, Buffer>();

  const storageMock = {
    upload: vi.fn(async (key: string, data: Buffer): Promise<void> => {
      storedObjects.set(key, Buffer.from(data));
    }),
    download: vi.fn(async (key: string) => {
      const value = storedObjects.get(key);
      if (!value) throw new Error(`missing object: ${key}`);
      return value;
    }),
    delete: vi.fn(async (key: string) => {
      storedObjects.delete(key);
    }),
    exists: vi.fn(async (key: string) => storedObjects.has(key)),
    getPresignedUrl: vi.fn(),
    buildStorageKey: vi.fn(),
  };

  async function seedTenant(
    prefix: string,
    role: OrganizationRole,
  ): Promise<TestTenant> {
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await seedAppUser(ctx.adminSql, userId, email);
    await seedOrg(
      ctx.adminSql,
      orgId,
      `${prefix} org`,
      `${prefix}-${orgId.slice(0, 8)}`,
      userId,
      tenantId,
    );
    await seedMember(ctx.adminSql, orgId, userId, role, userId);
    await ctx.adminSql`UPDATE users SET current_organization_id = ${orgId}::uuid WHERE id = ${userId}::uuid`;
    return {
      userId,
      tenantId,
      orgId,
      headers: {
        authorization: `Bearer ${signToken(userId, email, tenantId, role)}`,
      },
    };
  }

  async function seedViewer(tenant: TestTenant): Promise<TestTenant> {
    const userId = crypto.randomUUID();
    const email = `plugin-viewer-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await seedAppUser(ctx.adminSql, userId, email);
    await seedMember(
      ctx.adminSql,
      tenant.orgId,
      userId,
      'viewer',
      tenant.userId,
    );
    await ctx.adminSql`UPDATE users SET current_organization_id = ${tenant.orgId}::uuid WHERE id = ${userId}::uuid`;
    return {
      ...tenant,
      userId,
      headers: {
        authorization: `Bearer ${signToken(userId, email, tenant.tenantId, 'viewer')}`,
      },
    };
  }

  async function registerDeveloperKey(tenant: TestTenant) {
    return request(app.getHttpServer())
      .post(`${API_BASE}/developer-keys`)
      .set(tenant.headers)
      .send({ publicKey: fixture.publicKey, label: 'E2E signing key' });
  }

  async function uploadPlugin(
    tenant: TestTenant,
    archive: Buffer,
    status = 'active',
  ) {
    return request(app.getHttpServer())
      .post(API_BASE)
      .set(tenant.headers)
      .field('status', status)
      .attach('file', archive, {
        filename: 'signed-fixture.alp',
        contentType: 'application/zip',
      });
  }

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;
    ctx = await createRlsTestContext();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(ctx.db)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .overrideProvider(RedisCacheService)
      .useValue(createMockRedisCacheService())
      .overrideProvider(RedisPubSubService)
      .useValue(createMockRedisPubSubService())
      .overrideProvider(StorageService)
      .useValue(storageMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(multipart, {
      limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  beforeEach(async () => {
    await ctx.adminSql`DELETE FROM marketplace_listings`;
    await ctx.adminSql`DELETE FROM plugin_developer_keys`;
    await ctx.adminSql`DELETE FROM plugins`;
    await ctx.reset();
    storedObjects.clear();
    vi.clearAllMocks();

    fixture = await createSignedFixture();
    owner = await seedTenant('plugin-owner', 'owner');
    viewer = await seedViewer(owner);
    outsider = await seedTenant('plugin-outsider', 'owner');
  });

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  it('注册开发者密钥后接受真实 RSA-PSS 签名包，并把产物写入内存存储', async () => {
    const keyResponse = await registerDeveloperKey(owner);
    expect(keyResponse.status).toBe(201);
    expect(keyResponse.body).toMatchObject({
      keyFingerprint: fixture.fingerprint,
      status: 'active',
    });

    const uploadResponse = await uploadPlugin(owner, fixture.archive);
    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.data).toMatchObject({
      pluginId: REQUIRED_MANIFEST.id,
      status: 'active',
      signature: fixture.signature,
      contentHash: fixture.contentHash,
      occVersion: 2,
    });

    const pluginId = uploadResponse.body.data.id as string;
    expect(pluginId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(storedObjects.get(uploadResponse.body.data.storageKey)).toEqual(
      fixture.archive,
    );
    expect(storedObjects.get(uploadResponse.body.data.wasmBundleUrl)).toEqual(
      VALID_WASM,
    );
  });

  it('拒绝签名后被篡改的归档字节，且不把任何产物写入存储', async () => {
    await registerDeveloperKey(owner);
    const tampered = await tamperSignedArchive(fixture.archive);

    const response = await uploadPlugin(owner, tampered);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/plugin-signature-invalid',
      title: 'Plugin Signature Invalid',
      status: 401,
    });
    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(storedObjects.size).toBe(0);
  });

  it('用 occVersion 原子切换插件状态，并对陈旧版本返回 409', async () => {
    await registerDeveloperKey(owner);
    const uploaded = await uploadPlugin(owner, fixture.archive, 'registered');
    const plugin = uploaded.body.data as { id: string; occVersion: number };

    const activated = await request(app.getHttpServer())
      .patch(`${API_BASE}/${plugin.id}/status`)
      .set(owner.headers)
      .send({ status: 'active', occVersion: plugin.occVersion });
    expect(activated.status).toBe(200);
    expect(activated.body.data).toMatchObject({
      status: 'active',
      occVersion: 2,
    });

    const staleUpdate = await request(app.getHttpServer())
      .patch(`${API_BASE}/${plugin.id}/status`)
      .set(owner.headers)
      .send({ status: 'disabled', occVersion: plugin.occVersion });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body).toMatchObject({
      type: 'https://agentloom.dev/errors/plugin-version-conflict',
      status: 409,
      currentVersion: 2,
    });
  });

  it('真实 UUIDv7 pluginDbId 可经路由提交并完成最小自动审查上架链', async () => {
    await registerDeveloperKey(owner);
    const uploaded = await uploadPlugin(owner, fixture.archive);
    const pluginDbId = uploaded.body.data.id as string;
    expect(pluginDbId[14]).toBe('7');

    const response = await request(app.getHttpServer())
      .post(`${API_BASE}/marketplace/listings`)
      .set(owner.headers)
      .send({
        pluginDbId,
        title: 'Signed Plugin Marketplace',
        summary:
          '这是一个由真实签名插件包生成的市场条目，用于验证 UUIDv7 路由校验与最小自动审查链路。',
        category: 'automation',
        tags: ['signed', 'e2e'],
        pricingModel: 'free',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      pluginDbId,
      listingType: 'plugin',
      status: 'listed',
    });
    expect(response.body.reviewResult).toMatchObject({ outcome: 'passed' });
  });

  it('租户外读取插件返回 404，viewer 无权注册密钥、上传或修改状态', async () => {
    await registerDeveloperKey(owner);
    const uploaded = await uploadPlugin(owner, fixture.archive);
    const pluginId = uploaded.body.data.id as string;

    const foreignRead = await request(app.getHttpServer())
      .get(`${API_BASE}/${pluginId}`)
      .set(outsider.headers);
    expect(foreignRead.status).toBe(404);
    expect(foreignRead.body.type).toBe(
      'https://agentloom.dev/errors/plugin-not-found',
    );

    const viewerKey = await registerDeveloperKey(viewer);
    expect(viewerKey.status).toBe(403);

    const viewerUpload = await uploadPlugin(viewer, fixture.archive);
    expect(viewerUpload.status).toBe(403);

    const viewerStatus = await request(app.getHttpServer())
      .patch(`${API_BASE}/${pluginId}/status`)
      .set(viewer.headers)
      .send({ status: 'disabled', occVersion: 2 });
    expect(viewerStatus.status).toBe(403);
  });
});
