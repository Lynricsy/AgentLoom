import * as crypto from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import type { Namespace } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { JwtPayload } from '../src/common/guards/auth.guard';
import { WsJwtGuard } from '../src/common/guards/ws-jwt.guard';
import { RbacCacheService } from '../src/common/services/rbac-cache.service';
import { TokenBlacklistService } from '../src/common/services/token-blacklist.service';
import { UserIdentityResolverService } from '../src/common/services/user-identity-resolver.service';
import { WsAuthService } from '../src/common/services/ws-auth.service';
import { AgentConversationGateway } from '../src/modules/agent-execution/agent-conversation.gateway';
import { AgentExecutionService } from '../src/modules/agent-execution/agent-execution.service';
import { MemoryGateway } from '../src/modules/agent-memory/memory.gateway';
import { ExecutionGateway } from '../src/modules/execution/execution.gateway';
import { EventBridgeService } from '../src/modules/execution/services/event-bridge.service';
import { StateReplayService } from '../src/modules/execution/services/state-replay.service';
import { ThrottleService } from '../src/modules/execution/services/throttle.service';
import { KnowledgeGateway } from '../src/modules/knowledge/knowledge.gateway';
import { NotificationGateway } from '../src/modules/notification/notification.gateway';

const JWT_SECRET = 'fixlab-ws-identity-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
// JWT sub 是 Supabase auth.users.id；HTTP req.user.sub 是 public.users.id。
const SUPABASE_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const NAMESPACES = [
  ['/execution', ExecutionGateway],
  ['/agent-conversation', AgentConversationGateway],
  ['/memory', MemoryGateway],
  ['/knowledge', KnowledgeGateway],
  ['/notification', NotificationGateway],
] as const;

describe('所有 Socket.IO 命名空间与 HTTP 使用同一用户身份 (E2E)', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        ...NAMESPACES.map(([, gateway]) => gateway),
        EventBridgeService,
        ThrottleService,
        WsJwtGuard,
        WsAuthService,
        {
          provide: RbacCacheService,
          useValue: { getUserRole: vi.fn().mockResolvedValue('owner') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'APP_JWT_SECRET' ? JWT_SECRET : undefined,
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: { isBlacklisted: vi.fn().mockResolvedValue(false) },
        },
        {
          provide: UserIdentityResolverService,
          useValue: {
            resolveAppUserId: vi.fn(async (sub: string) =>
              sub === SUPABASE_USER_ID ? APP_USER_ID : null,
            ),
          },
        },
        {
          provide: StateReplayService,
          useValue: {
            getExecutionSnapshot: vi.fn(),
            checkExecutionExists: vi.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AgentExecutionService,
          useValue: {
            injectMessage: vi.fn(),
            cancelExecution: vi.fn(),
            getConversationSnapshotMessages: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 120_000);

  afterEach(() => {
    for (const socket of sockets) socket.disconnect();
    sockets.clear();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(NAMESPACES)(
    '%s 握手后 socket.data.user.sub 为应用用户 ID，supabaseUserId 为原始 sub',
    async (namespace, gatewayClass) => {
      const token = jwt.sign(
        {
          sub: SUPABASE_USER_ID,
          email: 'fox@example.com',
          aud: 'authenticated',
          jti: crypto.randomUUID(),
          tenant_id: TENANT_ID,
          tenant_role: 'owner',
        },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' },
      );
      const socket = io(`${baseUrl}${namespace}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.add(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });

      const gateway = app.get<{ server: Namespace }>(gatewayClass);
      const serverSockets = await gateway.server.fetchSockets();
      const user: JwtPayload | undefined = serverSockets.find(
        (candidate) => candidate.id === socket.id,
      )?.data.user;

      expect(user).toMatchObject({
        sub: APP_USER_ID,
        supabaseUserId: SUPABASE_USER_ID,
        tenantId: TENANT_ID,
      });
    },
  );
});
