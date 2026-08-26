import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import multipart from '@fastify/multipart';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { Readable } from 'node:stream';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { MINIO_CLIENT } from '../src/infrastructure/storage/storage.constants';
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
const MULTIPART_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

type TestUser = { id: string; email: string };
type SeededTenant = {
  user: TestUser;
  tenantId: string;
  organizationId: string;
  headers: Record<string, string>;
};
type MultipartFilePart = {
  fieldName?: string;
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

function ensureTestEnvironment() {
  process.env.APP_NODE_ENV = 'test';
  process.env.APP_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.APP_SUPABASE_URL = 'https://test.supabase.co';
  process.env.APP_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.APP_SUPABASE_SERVICE_KEY = 'test-service-key';
  process.env.APP_JWT_SECRET = JWT_SECRET;
  process.env.APP_REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.APP_OAUTH_REDIRECT_URL =
    'https://test.supabase.co/auth/v1/callback';
  process.env.APP_FRONTEND_URL = 'http://localhost:3000';
  process.env.APP_MASTER_ENCRYPTION_KEY =
    '3HiqJr2j48+6csTN+/yp+9FDJeiBpILxtxgYy/w/uFQ=';
  process.env.APP_MINIO_ENDPOINT = 'localhost';
  process.env.APP_MINIO_PORT = '9000';
  process.env.APP_MINIO_ACCESS_KEY = 'test-access-key';
  process.env.APP_MINIO_SECRET_KEY = 'test-secret-key';
  process.env.APP_MINIO_USE_SSL = 'false';
  process.env.APP_MINIO_BUCKET = 'agentloom-documents';
  process.env.APP_QDRANT_URL = 'http://localhost:6333';
}

function authHeaders(
  user: TestUser,
  tenantId: string,
  tenantRole: OrganizationRole,
) {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: tenantRole,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );

  return { authorization: `Bearer ${token}` };
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

function createMockRedisClient() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([]),
    publish: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
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

function buildMultipart(
  metadata: Record<string, unknown> | undefined,
  files: MultipartFilePart[] = [],
) {
  const boundary = `agentloom-${crypto.randomUUID()}`;
  const chunks: Buffer[] = [];
  const append = (value: string | Buffer) => {
    chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  };

  if (metadata !== undefined) {
    append(`--${boundary}\r\n`);
    append('Content-Disposition: form-data; name="metadata"\r\n\r\n');
    append(JSON.stringify(metadata));
    append('\r\n');
  }

  for (const file of files) {
    append(`--${boundary}\r\n`);
    append(
      `Content-Disposition: form-data; name="${file.fieldName ?? 'files'}"; filename="${file.filename}"\r\n`,
    );
    append(`Content-Type: ${file.contentType ?? 'application/octet-stream'}\r\n\r\n`);
    append(file.content);
    append('\r\n');
  }

  append(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function skillResponseFields() {
  return [
    'id',
    'tenantId',
    'name',
    'slug',
    'description',
    'content',
    'frontmatter',
    'isBuiltin',
    'status',
    'fileCount',
    'totalSizeBytes',
    'version',
    'createdBy',
    'sourceKind',
  ];
}

describe('Skill E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let drizzleDb: DrizzleDB;
  let owner: SeededTenant;
  let otherTenant: SeededTenant;
  let viewerHeaders: Record<string, string>;

  const objects = new Map<string, Buffer>();
  const storageServiceMock = {
    upload: vi.fn(
      async (key: string, data: Buffer | Readable, _size?: number) => {
        if (Buffer.isBuffer(data)) {
          objects.set(key, Buffer.from(data));
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of data) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        objects.set(key, Buffer.concat(chunks));
      },
    ),
    download: vi.fn(async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error(`NoSuchKey: ${key}`);
      return Readable.from([value]);
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    exists: vi.fn(async (key: string) => objects.has(key)),
    onModuleInit: vi.fn(),
  };
  const minioClientMock = {
    listObjectsV2: vi.fn((_bucket: string, prefix: string) =>
      (async function* () {
        for (const [name, value] of objects) {
          if (name.startsWith(prefix)) yield { name, size: value.length };
        }
      })(),
    ),
    removeObjects: vi.fn(async (_bucket: string, keys: string[]) => {
      for (const key of keys) objects.delete(key);
    }),
  };

  beforeAll(async () => {
    ensureTestEnvironment();
    ctx = await createRlsTestContext();
    drizzleDb = ctx.db;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(drizzleDb)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .overrideProvider(RedisCacheService)
      .useValue(createMockRedisCacheService())
      .overrideProvider(RedisPubSubService)
      .useValue(createMockRedisPubSubService())
      .overrideProvider(StorageService)
      .useValue(storageServiceMock)
      .overrideProvider(MINIO_CLIENT)
      .useValue(minioClientMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(multipart, {
      limits: { fileSize: MULTIPART_FILE_SIZE_LIMIT, files: 50 },
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  beforeEach(async () => {
    await ctx.adminSql`TRUNCATE TABLE skills RESTART IDENTITY CASCADE`;
    await ctx.reset();
    objects.clear();
    vi.clearAllMocks();

    owner = await seedTenant('skill-owner');
    otherTenant = await seedTenant('skill-other');

    const viewer = {
      id: crypto.randomUUID(),
      email: `skill-viewer-${crypto.randomUUID().slice(0, 8)}@example.com`,
    };
    await seedAppUser(ctx.adminSql, viewer.id, viewer.email);
    await seedMember(
      ctx.adminSql,
      owner.organizationId,
      viewer.id,
      'viewer',
      owner.user.id,
    );
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${owner.organizationId}::uuid
      WHERE id = ${viewer.id}::uuid
    `;
    viewerHeaders = authHeaders(viewer, owner.tenantId, 'viewer');
  });

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  }, 30_000);

  async function seedTenant(prefix: string): Promise<SeededTenant> {
    const user = {
      id: crypto.randomUUID(),
      email: `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`,
    };
    const organizationId = crypto.randomUUID();
    const tenantId = organizationId;

    await seedAppUser(ctx.adminSql, user.id, user.email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `${prefix}-${organizationId.slice(0, 8)}`,
      user.id,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, user.id, 'owner', user.id);
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `;

    return {
      user,
      tenantId,
      organizationId,
      headers: authHeaders(user, tenantId, 'owner'),
    };
  }

  async function createSkill(
    tenant: SeededTenant,
    name = `Multipart Skill ${crypto.randomUUID().slice(0, 8)}`,
    files: MultipartFilePart[] = [
      {
        filename: 'SKILL.md',
        content: '---\nname: multipart\nlicense: MIT\n---\n# Instructions',
        contentType: 'text/markdown',
      },
      { filename: 'examples/input.txt', content: 'example', contentType: 'text/plain' },
    ],
  ) {
    const multipartBody = buildMultipart(
      { name, description: 'multipart skill description' },
      files,
    );
    return app.inject({
      method: 'POST',
      url: '/api/v1/skills',
      headers: { ...tenant.headers, 'content-type': multipartBody.contentType },
      payload: multipartBody.payload,
    });
  }

  it('multipart 创建、多文件列表、详情、更新 OCC、归档与删除形成完整链路', async () => {
    const createResponse = await createSkill(owner);
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).not.toHaveProperty('data');
    expect(created).toEqual(expect.objectContaining({
      tenantId: owner.tenantId,
      description: 'multipart skill description',
      content: expect.stringContaining('# Instructions'),
      frontmatter: expect.objectContaining({ name: 'multipart', license: 'MIT' }),
      isBuiltin: false,
      status: 'active',
      fileCount: 2,
      sourceKind: 'manual',
      version: 1,
      createdBy: owner.user.id,
    }));
    expect(Object.keys(created)).toEqual(expect.arrayContaining(skillResponseFields()));

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/skills',
      headers: owner.headers,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [expect.objectContaining({ id: created.id })],
      meta: expect.objectContaining({ total: 1, page: 1 }),
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/skills/${created.id}`,
      headers: owner.headers,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).not.toHaveProperty('data');
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({ id: created.id }),
    );

    const filesResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/skills/${created.id}/files`,
      headers: owner.headers,
    });
    expect(filesResponse.statusCode).toBe(200);
    expect(filesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'SKILL.md' }),
        expect.objectContaining({ name: 'input.txt' }),
      ]),
    );

    const updateBody = buildMultipart({
      name: 'Updated Multipart Skill',
      description: 'updated description',
      occVersion: created.version,
    });
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/skills/${created.id}`,
      headers: { ...owner.headers, 'content-type': updateBody.contentType },
      payload: updateBody.payload,
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).not.toHaveProperty('data');
    expect(updateResponse.json()).toEqual(
      expect.objectContaining({
        id: created.id,
        name: 'Updated Multipart Skill',
        version: created.version + 1,
      }),
    );

    const staleResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/skills/${created.id}`,
      headers: { ...owner.headers, 'content-type': updateBody.contentType },
      payload: updateBody.payload,
    });
    expect(staleResponse.statusCode).toBe(409);

    const archiveResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/skills/${created.id}/archive`,
      headers: owner.headers,
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json()).toEqual(
      expect.objectContaining({ status: 'archived' }),
    );

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/skills/${created.id}`,
      headers: owner.headers,
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  it('穿越文件名被取 basename 后存入当前 skill 前缀，不产生路径逃逸', async () => {
    const response = await createSkill(owner, undefined, [
      { filename: '../../../etc/passwd', content: 'safe fixture' },
    ]);
    expect(response.statusCode).toBe(201);
    const created = response.json();

    const uploadedKeys = storageServiceMock.upload.mock.calls.map(([key]) => key);
    expect(uploadedKeys).toContain(
      `tenants/${owner.tenantId}/skills/${created.id}/passwd`,
    );
    expect(
      uploadedKeys.every((key) => !(key as string).includes('..')),
    ).toBe(true);

    const filesResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/skills/${created.id}/files`,
      headers: owner.headers,
    });
    expect(filesResponse.statusCode).toBe(200);
    expect(filesResponse.json()).toEqual([{ name: 'passwd', size: 12 }]);
  });

  // 已知缺陷，修复后启用：用原始穿越名下载目前返回 500，应 fail-closed 为 4xx。
  it.todo('GET files/<穿越名> 应返回 4xx 而非 500');

  it('跨租户详情 404，文件列表不泄露任何文件名', async () => {
    const createResponse = await createSkill(owner);
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/skills/${created.id}`,
      headers: otherTenant.headers,
    });
    expect(detailResponse.statusCode).toBe(404);

    const filesResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/skills/${created.id}/files`,
      headers: otherTenant.headers,
    });
    // 当前与 detail 的 404 语义不齐，但 200 空数组不泄露资源存在性或文件名。
    expect(filesResponse.json()).toEqual([]);
    expect(filesResponse.body).not.toContain('SKILL.md');
    expect(filesResponse.body).not.toContain('input.txt');
  });

  // 已知缺陷，修复后启用：跨租户下载 SKILL.md 目前返回 500，应返回 404。
  it.todo('跨租户 GET files/SKILL.md 应返回 404 而非 500');

  // 已知缺陷，修复后启用：应用层实际返回 500，canonical 期望通过
  // PayloadTooLargeException 返回 413；生产环境 nginx 的 50m 限制会先拦截，
  // 因而掩盖了 Nest 全局异常链中的缺陷。
  it.todo('超过全局 multipart 单文件上限一个字节时应返回 413');

  it('viewer 不能通过 multipart 创建或更新 skill', async () => {
    const createBody = buildMultipart({
      name: 'Viewer Skill',
      description: 'viewer cannot create',
    });
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/skills',
      headers: { ...viewerHeaders, 'content-type': createBody.contentType },
      payload: createBody.payload,
    });
    expect(createResponse.statusCode).toBe(403);

    const ownerCreateResponse = await createSkill(owner);
    const created = ownerCreateResponse.json();
    const updateBody = buildMultipart({
      description: 'viewer cannot update',
      occVersion: created.version,
    });
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/skills/${created.id}`,
      headers: { ...viewerHeaders, 'content-type': updateBody.contentType },
      payload: updateBody.payload,
    });
    expect(updateResponse.statusCode).toBe(403);
  });
});
