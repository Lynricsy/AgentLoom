import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Test } from '@nestjs/testing';
import {
  type NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AppModule } from '../src/app.module';
import { DRIZZLE } from '../src/database/database.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { workflowTemplates } from '../src/database/schema';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

describe('Template E2E', () => {
  let container: StartedPostgreSqlContainer;
  let sql: ReturnType<typeof postgres>;
  let drizzleClient: PostgresJsDatabase;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    sql = postgres(container.getConnectionUri());

    // 创建所需角色
    await sql`DO $$ BEGIN CREATE ROLE supabase_auth_admin; EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await sql`DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await sql`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN null; END $$`;

    // auth スキーマ作成（FK 制約用）
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`;

    // 运行迁移
    const migrationsDir = path.resolve(__dirname, '../src/database/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const migrationSql = fs.readFileSync(
        path.join(migrationsDir, file),
        'utf-8',
      );
      try {
        await sql.unsafe(migrationSql);
      } catch {
        // ignore if object already exists (idempotent migrations)
      }
    }

    drizzleClient = drizzle(sql);

    // 种子数据
    await drizzleClient.insert(workflowTemplates).values([
      {
        slug: 'e2e-chatbot',
        name: 'E2E Chatbot',
        description: 'Test chatbot template',
        category: 'analysis',
        tags: ['test', 'chatbot'],
        definition: {
          nodes: [
            {
              id: 'n1',
              type: 'llm-agent',
              position: { x: 0, y: 0 },
              data: {},
            },
          ],
          edges: [],
          viewport: DEFAULT_VIEWPORT,
        },
        metadata: {
          author: 'AgentLoom',
          version: '1.0.0',
          estimated_runtime_seconds: 30,
          complexity: 'beginner',
          node_count: 1,
          required_capabilities: ['llm'],
        },
        isPublished: true,
        displayOrder: 0,
      },
      {
        slug: 'e2e-research',
        name: 'E2E Research',
        description: 'Test research template',
        category: 'content',
        tags: ['test', 'research'],
        definition: { nodes: [], edges: [], viewport: DEFAULT_VIEWPORT },
        metadata: {
          author: 'AgentLoom',
          version: '1.0.0',
          estimated_runtime_seconds: 60,
          complexity: 'intermediate',
          node_count: 0,
          required_capabilities: [],
        },
        isPublished: true,
        displayOrder: 1,
      },
      {
        slug: 'e2e-unpublished',
        name: 'E2E Unpublished',
        description: 'Should not appear in results',
        category: 'analysis',
        tags: ['test'],
        definition: { nodes: [], edges: [], viewport: DEFAULT_VIEWPORT },
        metadata: {},
        isPublished: false,
        displayOrder: 99,
      },
    ]);

    // 构建 NestJS 应用
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(drizzleClient)
      .overrideProvider(REDIS_CLIENT)
      .useValue({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(0),
        keys: vi.fn().mockResolvedValue([]),
        quit: vi.fn().mockResolvedValue('OK'),
        publish: vi.fn().mockResolvedValue(1),
      })
      .overrideProvider(RedisCacheService)
      .useValue({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        del: vi.fn().mockResolvedValue(undefined),
        delByPattern: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn(),
      })
      .overrideProvider(RedisPubSubService)
      .useValue({
        publish: vi.fn().mockResolvedValue(undefined),
        onModuleInit: vi.fn(),
        onModuleDestroy: vi.fn(),
      })
      .overrideProvider(SupabaseService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await sql?.end();
    await container?.stop();
  });

  describe('GET /api/v1/templates', () => {
    it('should return published templates with pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
      expect(body.meta.page).toBe(1);

      const slugs = body.data.map((t: { slug: string }) => t.slug);
      expect(slugs).not.toContain('e2e-unpublished');
      expect(body.data[0]).not.toHaveProperty('definition');
      expect(body.data[0]).toEqual(
        expect.objectContaining({
          slug: 'e2e-chatbot',
          category: 'analysis',
          displayOrder: 0,
        }),
      );
    });

    it('should filter by category', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates?category=analysis',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].slug).toBe('e2e-chatbot');
    });

    it('should paginate correctly', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates?page=1&pageSize=1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.meta.totalPages).toBe(2);
    });

    it('should not require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates',
      });

      expect(res.statusCode).toBe(200);
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    });
  });

  describe('GET /api/v1/templates/:slug', () => {
    it('should return template detail with definition', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates/e2e-chatbot',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.slug).toBe('e2e-chatbot');
      expect(body.definition).toBeDefined();
      expect(body.definition.nodes).toHaveLength(1);
      expect(body.definition.viewport).toEqual(DEFAULT_VIEWPORT);
      expect(body.metadata).toEqual(
        expect.objectContaining({
          node_count: 1,
          complexity: 'beginner',
          estimated_runtime_seconds: 30,
        }),
      );
    });

    it('should return 404 for unknown slug', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body).toEqual(
        expect.objectContaining({
          status: 404,
          title: 'Template Not Found',
          type: 'https://agentloom.dev/errors/template-not-found',
          detail: "Template with slug 'nonexistent' was not found.",
        }),
      );
    });

    it('should return 404 for unpublished template', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates/e2e-unpublished',
      });

      expect(res.statusCode).toBe(404);
    });

    it('should not require authentication for template detail', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates/e2e-chatbot',
      });

      expect(res.statusCode).toBe(200);
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    });
  });
});
