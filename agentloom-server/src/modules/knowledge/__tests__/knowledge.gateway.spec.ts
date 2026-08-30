import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import { KnowledgeGateway } from '../knowledge.gateway';
import type { TokenBlacklistService } from '../../../common/services/token-blacklist.service';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const KB_ID = '33333333-3333-4333-8333-333333333333';

function createGateway() {
  const configService = {
    get: vi.fn().mockReturnValue('test-jwt-secret'),
  } as unknown as ConfigService;
  const tokenBlacklistService = {
    isBlacklisted: vi.fn().mockResolvedValue(false),
  } as unknown as TokenBlacklistService;

  return new KnowledgeGateway(configService, tokenBlacklistService);
}

function createClient(tenantId?: string) {
  const joined: string[] = [];
  const left: string[] = [];
  const client = {
    id: 'socket-1',
    data: tenantId
      ? { user: { sub: 'user-1', email: '', tenantId, tenantRole: 'owner' } }
      : {},
    join: vi.fn((room: string) => joined.push(room)),
    leave: vi.fn((room: string) => left.push(room)),
  } as unknown as Socket;

  return { client, joined, left };
}

describe('KnowledgeGateway 房间授权', () => {
  it('未认证连接（socket.data 无 user）不得加入任何房间', () => {
    const gateway = createGateway();
    const { client, joined } = createClient(undefined);

    const ack = gateway.handleJoin(client, {
      tenantId: TENANT_A,
      knowledgeBaseId: KB_ID,
    });

    expect(ack).toEqual({ status: 'error', error: 'FORBIDDEN' });
    expect(joined).toEqual([]);
  });

  it('自报其他租户 tenantId 被拒绝，不落入该租户房间', () => {
    const gateway = createGateway();
    const { client, joined } = createClient(TENANT_B);

    const ack = gateway.handleJoin(client, {
      tenantId: TENANT_A,
      knowledgeBaseId: KB_ID,
    });

    expect(ack).toEqual({ status: 'error', error: 'FORBIDDEN' });
    expect(joined).toEqual([]);
  });

  it('房间由 JWT 租户推导，客户端不传 tenantId 也能正确加入', () => {
    const gateway = createGateway();
    const { client, joined } = createClient(TENANT_A);

    const ack = gateway.handleJoin(client, { knowledgeBaseId: KB_ID });

    expect(ack).toEqual({ status: 'joined', knowledgeBaseId: KB_ID });
    expect(joined).toEqual([`knowledge:${TENANT_A}:${KB_ID}`]);
  });

  it('缺少 knowledgeBaseId 返回 INVALID_PAYLOAD', () => {
    const gateway = createGateway();
    const { client, joined } = createClient(TENANT_A);

    const ack = gateway.handleJoin(client, {
      knowledgeBaseId: '',
    });

    expect(ack).toEqual({ status: 'error', error: 'INVALID_PAYLOAD' });
    expect(joined).toEqual([]);
  });

  it('leave 同样按 JWT 租户解析，跨租户 leave 被拒绝', () => {
    const gateway = createGateway();
    const { client, left } = createClient(TENANT_A);

    expect(
      gateway.handleLeave(client, {
        tenantId: TENANT_B,
        knowledgeBaseId: KB_ID,
      }),
    ).toEqual({ status: 'error', error: 'FORBIDDEN' });
    expect(left).toEqual([]);

    expect(gateway.handleLeave(client, { knowledgeBaseId: KB_ID })).toEqual({
      status: 'left',
      knowledgeBaseId: KB_ID,
    });
    expect(left).toEqual([`knowledge:${TENANT_A}:${KB_ID}`]);
  });

  it('握手中间件在无 token 时拒绝连接', async () => {
    const gateway = createGateway();
    const middlewares: Array<
      (socket: unknown, next: (err?: Error) => void) => void
    > = [];
    const server = {
      use: vi.fn((fn: (socket: unknown, next: (err?: Error) => void) => void) =>
        middlewares.push(fn),
      ),
    };

    gateway.afterInit(server as never);
    expect(middlewares).toHaveLength(1);

    const next = vi.fn();
    await middlewares[0](
      { handshake: { auth: {}, headers: {} }, data: {} },
      next,
    );

    const err = next.mock.calls[0][0] as Error & {
      data?: { code: number };
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.data?.code).toBe(4001);
  });
});
