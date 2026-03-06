import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TenantMiddleware } from '../tenant.middleware';

const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TenantMiddleware],
    }).compile();

    middleware = module.get(TenantMiddleware);
  });

  function createMockReqRes(authHeader?: string) {
    const req = {
      headers: authHeader ? { authorization: authHeader } : {},
    } as never;
    const res = {} as never;
    const next = vi.fn();
    return { req, res, next };
  }

  function createJwtToken(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.fake-signature`;
  }

  it('tenantId がある場合 request に tenantId を設定する', () => {
    const token = createJwtToken({ sub: 'user-1', tenantId: TEST_TENANT_ID });
    const { req, res, next } = createMockReqRes(`Bearer ${token}`);

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBe(TEST_TENANT_ID);
    expect(next).toHaveBeenCalled();
  });

  it('tenant_id がある場合も request に tenantId を設定する', () => {
    const token = createJwtToken({ sub: 'user-1', tenant_id: TEST_TENANT_ID });
    const { req, res, next } = createMockReqRes(`Bearer ${token}`);

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBe(TEST_TENANT_ID);
    expect(next).toHaveBeenCalled();
  });

  it('Authorization ヘッダーがない場合スキップする', () => {
    const { req, res, next } = createMockReqRes();

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('Bearer トークンでない場合スキップする', () => {
    const { req, res, next } = createMockReqRes('Basic invalid');

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('tenantId がないトークンの場合スキップする', () => {
    const token = createJwtToken({ sub: 'user-1' });
    const { req, res, next } = createMockReqRes(`Bearer ${token}`);

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('不正なトークンの場合スキップする', () => {
    const { req, res, next } = createMockReqRes('Bearer invalid.token');

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('UUID 形式でない tenantId の場合スキップする', () => {
    const token = createJwtToken({ sub: 'user-1', tenantId: 'not-a-uuid' });
    const { req, res, next } = createMockReqRes(`Bearer ${token}`);

    middleware.use(req, res, next);

    expect((req as Record<string, unknown>).tenantId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
