import { describe, expect, it } from 'vitest';
import { envSchema } from '../env.schema';

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
});
