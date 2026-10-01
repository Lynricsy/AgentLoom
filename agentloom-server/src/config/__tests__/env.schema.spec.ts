import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { envSchema } from '../env.schema';

const SERVER_SRC = resolve(__dirname, '../..');

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'testing'
        ? []
        : listSourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function createBaseEnv(overrides: Record<string, unknown> = {}) {
  return {
    APP_PORT: 3000,
    APP_NODE_ENV: 'test',
    APP_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agentloom',
    APP_SUPABASE_URL: 'https://example.supabase.co',
    APP_SUPABASE_ANON_KEY: 'anon-key',
    APP_SUPABASE_SERVICE_KEY: 'service-key',
    APP_JWT_SECRET: 'jwt-secret',
    APP_REDIS_URL: 'redis://localhost:6379',
    APP_MASTER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    APP_OAUTH_REDIRECT_URL: 'http://localhost:3000/api/v1/auth/oauth/callback',
    APP_FRONTEND_URL: 'http://localhost:5173',
    APP_MINIO_ENDPOINT: 'localhost',
    APP_MINIO_PORT: 9000,
    APP_MINIO_ACCESS_KEY: 'minioadmin',
    APP_MINIO_SECRET_KEY: 'minioadmin',
    APP_MINIO_USE_SSL: 'false',
    APP_MINIO_BUCKET: 'agentloom-documents',
    APP_QDRANT_URL: 'http://localhost:6333',
    ...overrides,
  };
}

describe('envSchema', () => {
  it('默认 saas 模式下要求完整 APP_SUPABASE_* 配置', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_SUPABASE_URL: undefined,
        APP_SUPABASE_ANON_KEY: undefined,
        APP_SUPABASE_SERVICE_KEY: undefined,
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      expect.unreachable('expected schema validation to fail');
    }

    expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining([
        'APP_SUPABASE_URL',
        'APP_SUPABASE_ANON_KEY',
        'APP_SUPABASE_SERVICE_KEY',
      ]),
    );
  });

  it('private 模式下允许完全省略 APP_SUPABASE_* 配置', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_DEPLOYMENT_MODE: 'private',
        APP_SUPABASE_URL: undefined,
        APP_SUPABASE_ANON_KEY: undefined,
        APP_SUPABASE_SERVICE_KEY: undefined,
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      expect.unreachable('expected schema validation to succeed');
    }

    expect(result.data.APP_DEPLOYMENT_MODE).toBe('private');
  });

  it('private 模式下允许 APP_SUPABASE_* 与 license 公钥使用空字符串占位', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_DEPLOYMENT_MODE: 'private',
        APP_SUPABASE_URL: '',
        APP_SUPABASE_ANON_KEY: '',
        APP_SUPABASE_SERVICE_KEY: '',
        APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY: '',
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      expect.unreachable('expected schema validation to succeed');
    }

    expect(result.data.APP_SUPABASE_URL).toBeUndefined();
    expect(result.data.APP_SUPABASE_ANON_KEY).toBeUndefined();
    expect(result.data.APP_SUPABASE_SERVICE_KEY).toBeUndefined();
    expect(
      result.data.APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY,
    ).toBeUndefined();
  });

  it('private 模式下禁止部分 APP_SUPABASE_* 半配置', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_DEPLOYMENT_MODE: 'private',
        APP_SUPABASE_SERVICE_KEY: undefined,
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      expect.unreachable('expected schema validation to fail');
    }

    expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
      'APP_SUPABASE_SERVICE_KEY',
    );
  });

  it('private 模式下允许提供完整 APP_SUPABASE_* 配置', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_DEPLOYMENT_MODE: 'private',
      }),
    );

    expect(result.success).toBe(true);
  });

  it('saas 模式下仍然拒绝空字符串 APP_SUPABASE_* 配置', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_SUPABASE_URL: '',
        APP_SUPABASE_ANON_KEY: '',
        APP_SUPABASE_SERVICE_KEY: '',
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      expect.unreachable('expected schema validation to fail');
    }

    expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining([
        'APP_SUPABASE_URL',
        'APP_SUPABASE_ANON_KEY',
        'APP_SUPABASE_SERVICE_KEY',
      ]),
    );
  });
  it('默认关闭 sandbox maintenance mode', () => {
    const result = envSchema.parse(createBaseEnv());

    expect(result.APP_SANDBOX_MAINTENANCE_MODE).toBe(false);
  });

  it('显式启用 sandbox maintenance mode', () => {
    const result = envSchema.parse(
      createBaseEnv({ APP_SANDBOX_MAINTENANCE_MODE: 'true' }),
    );

    expect(result.APP_SANDBOX_MAINTENANCE_MODE).toBe(true);
  });

  it('补齐的变量有默认值，省略时 ConfigService 也能读到', () => {
    const result = envSchema.parse(createBaseEnv());

    expect(result.APP_AGENT_API_CONVERSATION_IDLE_HOURS).toBe(24);
    expect(result.GENERATED_APP_GATE3_COMMAND_TIMEOUT_MS).toBe(30_000);
    expect(result.APP_FIRECRACKER_RUNTIME_SERVER_NAME).toBe(
      'firecracker-runtime',
    );
    expect(result.APP_SANDBOX_CALLBACK_BASE_URL).toBeUndefined();
  });

  it('启动时拒绝非法的空闲时长、回调 URL 与 Gate 3 超时', () => {
    const result = envSchema.safeParse(
      createBaseEnv({
        APP_AGENT_API_CONVERSATION_IDLE_HOURS: 'abc',
        APP_SANDBOX_CALLBACK_BASE_URL: 'not a url',
        GENERATED_APP_GATE3_COMMAND_TIMEOUT_MS: '0',
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining([
        'APP_AGENT_API_CONVERSATION_IDLE_HOURS',
        'APP_SANDBOX_CALLBACK_BASE_URL',
        'GENERATED_APP_GATE3_COMMAND_TIMEOUT_MS',
      ]),
    );
  });

  /**
   * schema 外的变量不会被启动校验、拿不到默认值，也不会进 `pnpm docs:gen`
   * 生成的 env 参考表。凡是以字面量读取的 key 都必须在 schema 中声明。
   * 用例逐个读取整个 src 树，共享主机高负载时会超过默认 5s，因此单独给 30s。
   */
  it(
    'server 代码读取的环境变量都在 envSchema 中声明',
    { timeout: 30_000 },
    () => {
      const declared = new Set(Object.keys(envSchema.shape));
      const undeclared: string[] = [];

      for (const file of listSourceFiles(SERVER_SRC)) {
        const source = readFileSync(file, 'utf8');
        const reads = [
          ...source.matchAll(/\.get(?:<[^>]*>)?\(\s*'([A-Z][A-Z0-9_]+)'/g),
          ...source.matchAll(/process\.env\.(APP_[A-Z0-9_]+)/g),
        ];
        for (const [, key] of reads) {
          if (!declared.has(key!)) {
            undeclared.push(`${relative(SERVER_SRC, file)}: ${key}`);
          }
        }
      }

      expect(undeclared).toEqual([]);
    },
  );
});
