import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from '../ws-jwt.guard';
import { TokenBlacklistService } from '../../services/token-blacklist.service';

// vi.hoisted mock factory — required because ESM namespace exports are read-only
const { mockVerify } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
}));

vi.mock('jsonwebtoken', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const actual = (mod.default ?? mod) as Record<string, unknown>;
  mockVerify.mockImplementation((...args: unknown[]) =>
    (actual.verify as Function)(...args),
  );
  return { ...actual, default: actual, verify: mockVerify };
});

const JWT_SECRET = 'ws-jwt-test-secret';

function createToken(payload: Record<string, unknown>): string {
  return jwt.sign(
    {
      aud: 'authenticated',
      ...payload,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    handshake: { auth: {}, headers: {} },
    data: {} as Record<string, unknown>,
    ...overrides,
  };
}

function createExecutionContext(client: Record<string, unknown>) {
  return {
    switchToWs: vi.fn().mockReturnValue({
      getClient: vi.fn().mockReturnValue(client),
    }),
  };
}

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let tokenBlacklist: { isBlacklisted: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    tokenBlacklist = {
      isBlacklisted: vi.fn().mockResolvedValue(false),
    };

    guard = new WsJwtGuard(
      { get: vi.fn().mockReturnValue(JWT_SECRET) } as unknown as ConfigService,
      tokenBlacklist as unknown as TokenBlacklistService,
    );
  });

  it('已有 client.data.user 时应直接放行', async () => {
    const client = createClient({
      data: { user: { sub: 'user-1' } },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).resolves.toBe(true);
    expect(tokenBlacklist.isBlacklisted).not.toHaveBeenCalled();
  });

  it('缺失 token 时应抛出 WsException', async () => {
    await expect(
      guard.canActivate(createExecutionContext(createClient()) as never),
    ).rejects.toThrowError(new WsException('Authentication token is missing'));
  });

  it('黑名单 token 时应拒绝访问', async () => {
    tokenBlacklist.isBlacklisted.mockResolvedValue(true);
    const client = createClient({
      handshake: {
        auth: { token: createToken({ sub: 'user-1', email: 'u@example.com' }) },
        headers: {},
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).rejects.toThrowError(new WsException('Token has been revoked'));
  });

  it('jwt.verify 返回 string 时应判定为 payload 异常', async () => {
    mockVerify.mockReturnValueOnce('bad-payload');

    await expect(
      guard.canActivate(
        createExecutionContext(
          createClient({
            handshake: { auth: { token: 'token' }, headers: {} },
          }),
        ) as never,
      ),
    ).rejects.toThrowError(new WsException('Token payload is malformed'));
  });

  it('mfa_pending token 时应抛出 MFA 异常', async () => {
    const client = createClient({
      handshake: {
        auth: {
          token: createToken({
            sub: 'user-1',
            email: 'u@example.com',
            type: 'mfa_pending',
          }),
        },
        headers: {},
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).rejects.toThrowError(new WsException('MFA verification required'));
  });

  it('缺失必要 claim 时应抛出 payload 缺失异常', async () => {
    const client = createClient({
      handshake: {
        auth: { token: createToken({ sub: 'user-1' }) },
        headers: {},
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).rejects.toThrowError(
      new WsException('Token payload is missing required claims'),
    );
  });

  it('过期 token 时应返回过期错误', async () => {
    const expiredToken = jwt.sign(
      {
        sub: 'user-1',
        email: 'u@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) - 10,
        iat: Math.floor(Date.now() / 1000) - 20,
      },
      JWT_SECRET,
      { algorithm: 'HS256' },
    );

    const client = createClient({
      handshake: { auth: { token: expiredToken }, headers: {} },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).rejects.toThrowError(new WsException('Token has expired'));
  });

  it('无效签名 token 时应返回 invalid 错误', async () => {
    const client = createClient({
      handshake: {
        auth: {
          token: jwt.sign(
            { sub: 'user-1', email: 'u@example.com', aud: 'authenticated' },
            'wrong-secret',
            { algorithm: 'HS256', expiresIn: '1h' },
          ),
        },
        headers: {},
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).rejects.toThrowError(new WsException('Token is invalid'));
  });

  it('应接受有效 token 并归一化 snake_case claims', async () => {
    const client = createClient({
      handshake: {
        auth: {
          token: createToken({
            sub: 'user-1',
            email: 'u@example.com',
            tenant_id: 'tenant-1',
            tenant_role: 'owner',
          }),
        },
        headers: {},
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(client) as never),
    ).resolves.toBe(true);
    expect(client.data.user).toMatchObject({
      sub: 'user-1',
      email: 'u@example.com',
      tenantId: 'tenant-1',
      tenantRole: 'owner',
    });
  });
});
