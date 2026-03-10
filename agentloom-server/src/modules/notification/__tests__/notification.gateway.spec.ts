import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import type { ConfigService } from '@nestjs/config';
import type { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { NotificationGateway } from '../notification.gateway';

const JWT_SECRET = 'notification-test-secret';

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

function createSocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    data: {},
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let configService: { get: ReturnType<typeof vi.fn> };
  let tokenBlacklistService: { isBlacklisted: ReturnType<typeof vi.fn> };
  let server: { use: ReturnType<typeof vi.fn>; to: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn().mockReturnValue(JWT_SECRET),
    };
    tokenBlacklistService = {
      isBlacklisted: vi.fn().mockResolvedValue(false),
    };
    server = {
      use: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };

    gateway = new NotificationGateway(
      configService as unknown as ConfigService,
      tokenBlacklistService as unknown as TokenBlacklistService,
    );
    gateway.server = server as never;
  });

  it('afterInit 应安装鉴权中间件', () => {
    gateway.afterInit(server as never);
    expect(server.use).toHaveBeenCalledOnce();
  });

  it('鉴权中间件应拒绝缺失 token 的连接', async () => {
    gateway.afterInit(server as never);
    const middleware = server.use.mock.calls[0]?.[0] as (
      socket: ReturnType<typeof createSocket>,
      next: (error?: Error & { data?: { code: number } }) => void,
    ) => Promise<void>;
    const next = vi.fn();

    await middleware(createSocket(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 4001, reason: 'Authentication required' } }),
    );
  });

  it('鉴权中间件应拒绝黑名单 token', async () => {
    tokenBlacklistService.isBlacklisted.mockResolvedValue(true);
    gateway.afterInit(server as never);
    const middleware = server.use.mock.calls[0]?.[0] as (
      socket: ReturnType<typeof createSocket>,
      next: (error?: Error & { data?: { code: number } }) => void,
    ) => Promise<void>;
    const next = vi.fn();

    await middleware(
      createSocket({ handshake: { auth: { token: createToken({ sub: 'user-1' }) }, headers: {} } }),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 4001, reason: 'Token has been revoked' } }),
    );
  });

  it('鉴权中间件应拒绝 MFA pending token', async () => {
    gateway.afterInit(server as never);
    const middleware = server.use.mock.calls[0]?.[0] as (
      socket: ReturnType<typeof createSocket>,
      next: (error?: Error & { data?: { code: number } }) => void,
    ) => Promise<void>;
    const next = vi.fn();

    await middleware(
      createSocket({
        handshake: {
          auth: {
            token: createToken({ sub: 'user-1', type: 'mfa_pending' }),
          },
          headers: {},
        },
      }),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 4001, reason: 'MFA verification required' } }),
    );
  });

  it('鉴权中间件应接受有效 token 并归一化 snake_case claims', async () => {
    gateway.afterInit(server as never);
    const middleware = server.use.mock.calls[0]?.[0] as (
      socket: ReturnType<typeof createSocket>,
      next: (error?: Error) => void,
    ) => Promise<void>;
    const next = vi.fn();
    const socket = createSocket({
      handshake: {
        auth: {},
        headers: {
          authorization: `Bearer ${createToken({
            sub: 'user-1',
            email: 'user@example.com',
            tenant_id: 'tenant-1',
            tenant_role: 'owner',
          })}`,
        },
      },
    });

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toMatchObject({
      sub: 'user-1',
      email: 'user@example.com',
      tenantId: 'tenant-1',
      tenantRole: 'owner',
    });
  });

  it('鉴权中间件应拒绝无效 token', async () => {
    gateway.afterInit(server as never);
    const middleware = server.use.mock.calls[0]?.[0] as (
      socket: ReturnType<typeof createSocket>,
      next: (error?: Error & { data?: { code: number } }) => void,
    ) => Promise<void>;
    const next = vi.fn();

    await middleware(
      createSocket({
        handshake: {
          auth: { token: 'not-a-jwt' },
          headers: {},
        },
      }),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 4001, reason: 'Invalid or expired token' } }),
    );
  });

  it('handleConnection 应自动加入用户房间', () => {
    const socket = createSocket({
      data: { user: { sub: 'user-1', tenantId: 'tenant-1', email: 'u@example.com' } },
    });

    gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('tenant:tenant-1:user:user-1');
  });

  it('订阅和退订应基于当前用户房间操作', async () => {
    const socket = createSocket({
      data: { user: { sub: 'user-1', tenantId: 'tenant-1', email: 'u@example.com' } },
    });

    await expect(gateway.handleSubscribe(socket as never)).resolves.toEqual({
      status: 'subscribed',
    });
    await expect(gateway.handleUnsubscribe(socket as never)).resolves.toEqual({
      status: 'unsubscribed',
    });

    expect(socket.join).toHaveBeenCalledWith('tenant:tenant-1:user:user-1');
    expect(socket.leave).toHaveBeenCalledWith('tenant:tenant-1:user:user-1');
  });

  it('缺失租户上下文时订阅和退订应返回 error', async () => {
    const socket = createSocket({ data: {} });

    await expect(gateway.handleSubscribe(socket as never)).resolves.toEqual({
      status: 'error',
    });
    await expect(gateway.handleUnsubscribe(socket as never)).resolves.toEqual({
      status: 'error',
    });
  });

  it('应向用户房间发送通知和未读数量事件', () => {
    const emit = vi.fn();
    server.to.mockReturnValue({ emit });

    gateway.sendToUser('tenant-1', 'user-1', {
      id: 'notification-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      type: 'execution_completed',
      title: '执行已完成',
      body: null,
      isRead: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    gateway.sendUnreadCount('tenant-1', 'user-1', 5);

    expect(server.to).toHaveBeenNthCalledWith(1, 'tenant:tenant-1:user:user-1');
    expect(server.to).toHaveBeenNthCalledWith(2, 'tenant:tenant-1:user:user-1');
    expect(emit).toHaveBeenNthCalledWith(
      1,
      'notification.new',
      expect.objectContaining({ id: 'notification-1' }),
    );
    expect(emit).toHaveBeenNthCalledWith(2, 'notification.unread-count', {
      count: 5,
    });
  });
});
