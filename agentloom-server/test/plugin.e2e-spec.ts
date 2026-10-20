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
import { Readable } from 'node:stream';
import { sql } from 'drizzle-orm';
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
import { createMockRedisClient } from './support/redis-client.mock';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE } from '../src/database/database.module';
import { StorageService } from '../src/infrastructure/storage/storage.service';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  withTenantContext,
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
  privateKey: string;
};

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
  const signed = await buildSignedArchive(
    privateKeyPem,
    fingerprint,
    REQUIRED_MANIFEST.version,
  );

  return {
    ...signed,
    fingerprint,
    publicKey: publicKeyPem,
    privateKey: privateKeyPem,
  };
}

/** 用同一把开发者密钥签名指定版本的插件包（WASM 字节随版本变化，contentHash 也随之不同）。 */
async function buildSignedArchive(
  privateKeyPem: string,
  fingerprint: string,
  version: string,
): Promise<Pick<SignedFixture, 'archive' | 'signature' | 'contentHash'>> {
  const manifest = {
    ...REQUIRED_MANIFEST,
    version,
    wasmEntry: 'dist/plugin.wasm',
  };
  const zip = new JSZip();
  zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  zip.file(
    'dist/plugin.wasm',
    version === REQUIRED_MANIFEST.version
      ? VALID_WASM
      : Buffer.concat([VALID_WASM, Buffer.from(version)]),
  );
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
  return { archive, signature, contentHash };
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
      return Readable.from([value]);
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

  /** status 传 null 时不带该 multipart 字段（发布新版本沿用当前状态）。 */
  async function uploadPlugin(
    tenant: TestTenant,
    archive: Buffer,
    status: string | null = 'active',
  ) {
    const pending = request(app.getHttpServer())
      .post(API_BASE)
      .set(tenant.headers);

    if (status !== null) {
      pending.field('status', status);
    }

    return pending.attach('file', archive, {
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
    await ctx.adminSql`DELETE FROM plugin_usage_records`;
    await ctx.adminSql`DELETE FROM plugin_earnings`;
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

    // 签名失败是内容校验，不能用 401：客户端会把 401 当会话过期刷新 token 再重传整包
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/plugin-signature-invalid',
      title: 'Plugin Signature Invalid',
      status: 422,
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

  it('签名公钥属于同组织其他成员时拒绝上传，且不写入任何产物', async () => {
    const creatorId = crypto.randomUUID();
    const creatorEmail = `plugin-creator-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await seedAppUser(ctx.adminSql, creatorId, creatorEmail);
    await seedMember(
      ctx.adminSql,
      owner.orgId,
      creatorId,
      'creator',
      owner.userId,
    );
    await ctx.adminSql`UPDATE users SET current_organization_id = ${owner.orgId}::uuid WHERE id = ${creatorId}::uuid`;
    const creator: TestTenant = {
      ...owner,
      userId: creatorId,
      headers: {
        authorization: `Bearer ${signToken(creatorId, creatorEmail, owner.tenantId, 'creator')}`,
      },
    };

    expect((await registerDeveloperKey(owner)).status).toBe(201);

    const response = await uploadPlugin(creator, fixture.archive);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/plugin-signer-mismatch',
      status: 403,
    });
    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(storedObjects.size).toBe(0);
  });

  it('市场全链路：同 ID 上传新版本就地更新 → 安装方 upgrade-check / upgrade，计费流水与收益不随删除丢失', async () => {
    const server = app.getHttpServer();
    expect((await registerDeveloperKey(owner)).status).toBe(201);

    const v1 = await uploadPlugin(owner, fixture.archive);
    expect(v1.status).toBe(201);
    const sourcePlugin = v1.body.data as {
      id: string;
      storageKey: string;
      wasmBundleUrl: string;
    };

    const listingResponse = await request(server)
      .post(`${API_BASE}/marketplace/listings`)
      .set(owner.headers)
      .send({
        pluginDbId: sourcePlugin.id,
        title: 'Signed Plugin Upgrade Chain',
        summary:
          '用于验证同一插件 ID 发布新版本后，市场安装方可以检查并升级到新版本的端到端链路。',
        category: 'automation',
        tags: ['signed', 'upgrade'],
        pricingModel: 'per_execution',
        pricePerExecution: '0.01',
      });
    expect(listingResponse.status).toBe(201);
    const listingId = listingResponse.body.data.id as string;

    const installed = await request(server)
      .post(`/api/v1/marketplace/listings/${listingId}/install`)
      .set(outsider.headers)
      .send({});
    expect(installed.status).toBe(201);
    const clonePluginDbId = installed.body.pluginDbId as string;

    const checkBefore = await request(server)
      .get(`/api/v1/marketplace/listings/${listingId}/upgrade-check`)
      .set(outsider.headers);
    expect(checkBefore.body).toMatchObject({ reason: 'up_to_date' });

    // 同 ID 更高版本：就地更新同一记录，不带 status 时沿用 active
    const v2Archive = await buildSignedArchive(
      fixture.privateKey,
      fixture.fingerprint,
      '1.0.1',
    );
    const v2 = await uploadPlugin(owner, v2Archive.archive, null);
    expect(v2.status).toBe(201);
    expect(v2.body.data).toMatchObject({
      id: sourcePlugin.id,
      version: '1.0.1',
      status: 'active',
      contentHash: v2Archive.contentHash,
    });
    expect(storedObjects.has(sourcePlugin.storageKey)).toBe(false);
    expect(storedObjects.has(sourcePlugin.wasmBundleUrl)).toBe(false);
    expect(storedObjects.has(v2.body.data.wasmBundleUrl as string)).toBe(true);

    // 同版本重传仍是 409
    const duplicate = await uploadPlugin(owner, v2Archive.archive, null);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      type: 'https://agentloom.dev/errors/plugin-already-exists',
      currentVersion: '1.0.1',
      uploadedVersion: '1.0.1',
    });

    const checkAfter = await request(server)
      .get(`/api/v1/marketplace/listings/${listingId}/upgrade-check`)
      .set(outsider.headers);
    expect(checkAfter.body).toMatchObject({
      installed: true,
      upgradeAvailable: true,
      installedPluginDbId: clonePluginDbId,
      currentVersion: '1.0.0',
      latestVersion: '1.0.1',
      reason: 'upgrade_available',
    });

    const upgraded = await request(server)
      .post(`/api/v1/marketplace/listings/${listingId}/upgrade`)
      .set(outsider.headers);
    expect(upgraded.status).toBe(200);
    expect(upgraded.body).toMatchObject({
      pluginDbId: clonePluginDbId,
      fromVersion: '1.0.0',
      toVersion: '1.0.1',
    });
    const checkUpgraded = await request(server)
      .get(`/api/v1/marketplace/listings/${listingId}/upgrade-check`)
      .set(outsider.headers);
    expect(checkUpgraded.body).toMatchObject({ reason: 'up_to_date' });

    // 安装方 3 次计费执行（流水属于安装方租户，source_* 指向开发者）+ 一条已结算的历史收益
    for (let index = 0; index < 3; index += 1) {
      await ctx.adminSql`
        INSERT INTO plugin_usage_records (
          tenant_id, plugin_db_id, plugin_id, source_tenant_id, source_org_id,
          source_plugin_db_id, source_plugin_id, source_listing_id,
          execution_id, billing_amount, currency
        ) VALUES (
          ${outsider.tenantId}::uuid, ${clonePluginDbId}::uuid, ${REQUIRED_MANIFEST.id},
          ${owner.tenantId}::uuid, ${owner.orgId}::uuid, ${sourcePlugin.id}::uuid,
          ${REQUIRED_MANIFEST.id}, ${listingId}::uuid, ${crypto.randomUUID()}::uuid,
          '0.01000000', 'USD'
        )`;
    }
    await ctx.adminSql`
      INSERT INTO plugin_earnings (
        tenant_id, plugin_db_id, plugin_id, org_id, source_tenant_id, source_org_id,
        source_plugin_db_id, source_plugin_id, period_start, period_end,
        total_executions, total_revenue, developer_share, platform_share, listing_commission
      ) VALUES (
        ${owner.tenantId}::uuid, ${sourcePlugin.id}::uuid, ${REQUIRED_MANIFEST.id},
        ${owner.orgId}::uuid, ${owner.tenantId}::uuid, ${owner.orgId}::uuid,
        ${sourcePlugin.id}::uuid, ${REQUIRED_MANIFEST.id},
        '2020-01-01T00:00:00Z', '2020-01-31T23:59:59.999Z',
        2, '0.02000000', '0.01190000', '0.00600000', '0.00210000'
      )`;

    // 未结算收入实时可见；月结字段只含已结算记录
    const summary = await request(server)
      .get(`${API_BASE}/marketplace/earnings/summary`)
      .set(owner.headers);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      totalRevenue: '0.02000000',
      currentMonthRevenue: '0.03000000',
      accruedRevenue: '0.03000000',
      accruedDeveloperShare: '0.01785000',
      accruedExecutions: 3,
    });

    // 已上架的源插件不能直接删除
    const blockedDelete = await request(server)
      .delete(`${API_BASE}/${sourcePlugin.id}`)
      .set(owner.headers);
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body).toMatchObject({
      type: 'https://agentloom.dev/errors/plugin-listed',
      listingId,
      listingStatus: 'listed',
    });

    const unlisted = await request(server)
      .post(`${API_BASE}/marketplace/listings/${listingId}/unlist`)
      .set(owner.headers);
    expect(unlisted.status).toBe(200);

    const sourceDeleted = await request(server)
      .delete(`${API_BASE}/${sourcePlugin.id}`)
      .set(owner.headers);
    expect(sourceDeleted.status).toBe(204);

    const cloneDeleted = await request(server)
      .delete(`${API_BASE}/${clonePluginDbId}`)
      .set(outsider.headers);
    expect(cloneDeleted.status).toBe(204);

    const [ledger] = await ctx.adminSql<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM plugin_usage_records
      WHERE source_plugin_db_id = ${sourcePlugin.id}::uuid`;
    expect(ledger?.count).toBe(3);
    const [earnings] = await ctx.adminSql<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM plugin_earnings
      WHERE plugin_db_id = ${sourcePlugin.id}::uuid`;
    expect(earnings?.count).toBe(1);

    // 流水只追加：租户角色的 DELETE 不命中任何行（无 DELETE 策略），也可能直接被拒绝
    await withTenantContext(ctx.db, outsider.tenantId, (tenantDb) =>
      tenantDb.execute(sql`DELETE FROM plugin_usage_records`),
    ).catch(() => undefined);
    const [ledgerAfterTenantDelete] = await ctx.adminSql<
      Array<{ count: number }>
    >`
      SELECT count(*)::int AS count FROM plugin_usage_records
      WHERE source_plugin_db_id = ${sourcePlugin.id}::uuid`;
    expect(ledgerAfterTenantDelete?.count).toBe(3);
  });
});
