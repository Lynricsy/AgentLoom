import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Controller,
  Get,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Public } from '../src/common/decorators/public.decorator';
import { Roles } from '../src/common/decorators/roles.decorator';
import { CurrentTenant } from '../src/common/decorators/current-tenant.decorator';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { TenantMiddleware } from '../src/common/middleware/tenant.middleware';
import { RbacCacheService } from '../src/common/services/rbac-cache.service';
import { TokenBlacklistService } from '../src/common/services/token-blacklist.service';
import { TenantTransactionInterceptor } from '../src/common/interceptors/tenant-transaction.interceptor';
import { DRIZZLE } from '../src/database/database.module';

const TEST_JWT_SECRET = 'test-e2e-jwt-secret';
const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';

function createAccessToken(payload: Record<string, unknown>) {
  return jwt.sign(
    {
      aud: 'authenticated',
      email: 'user@example.com',
      sub: 'user-1',
      ...payload,
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

class GuardChainTestController {
  getPublic() {
    return { ok: true };
  }

  getAuthenticated(userId: string) {
    return { userId };
  }

  getTenantProtected(userId: string, tenantId: string) {
    return { userId, tenantId };
  }
}

Controller()(GuardChainTestController);

const publicDescriptor = Object.getOwnPropertyDescriptor(
  GuardChainTestController.prototype,
  'getPublic',
)!;
Public()(GuardChainTestController.prototype, 'getPublic', publicDescriptor);
Get('public')(
  GuardChainTestController.prototype,
  'getPublic',
  publicDescriptor,
);

const authenticatedDescriptor = Object.getOwnPropertyDescriptor(
  GuardChainTestController.prototype,
  'getAuthenticated',
)!;
Get('authenticated')(
  GuardChainTestController.prototype,
  'getAuthenticated',
  authenticatedDescriptor,
);
CurrentUser('sub')(GuardChainTestController.prototype, 'getAuthenticated', 0);

const tenantProtectedDescriptor = Object.getOwnPropertyDescriptor(
  GuardChainTestController.prototype,
  'getTenantProtected',
)!;
Roles('owner')(
  GuardChainTestController.prototype,
  'getTenantProtected',
  tenantProtectedDescriptor,
);
Get('organizations/current/access')(
  GuardChainTestController.prototype,
  'getTenantProtected',
  tenantProtectedDescriptor,
);
CurrentUser('sub')(GuardChainTestController.prototype, 'getTenantProtected', 0);
CurrentTenant()(GuardChainTestController.prototype, 'getTenantProtected', 1);

const mockTxExecute = vi.fn().mockResolvedValue(undefined);

@Module({
  controllers: [GuardChainTestController],
  providers: [
    TenantMiddleware,
    {
      provide: DRIZZLE,
      useValue: {
        execute: vi.fn().mockResolvedValue(undefined),
        transaction: vi.fn(async (cb: Function) =>
          cb({ execute: mockTxExecute }),
        ),
      },
    },
    {
      provide: ConfigService,
      useValue: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === 'APP_JWT_SECRET') {
            return TEST_JWT_SECRET;
          }

          return undefined;
        }),
      },
    },
    {
      provide: TokenBlacklistService,
      useValue: {
        isBlacklisted: vi.fn().mockResolvedValue(false),
      },
    },
    {
      provide: RbacCacheService,
      useValue: {
        getUserRole: vi.fn(),
      },
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantTransactionInterceptor,
    },
  ],
})
class GuardChainTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

describe('Guard chain E2E', () => {
  let app: NestFastifyApplication;
  let db: {
    execute: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
  let rbacCacheService: { getUserRole: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GuardChainTestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = moduleRef.get(DRIZZLE);
    rbacCacheService = moduleRef.get(RbacCacheService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue(undefined);
    mockTxExecute.mockResolvedValue(undefined);
    rbacCacheService.getUserRole.mockResolvedValue('owner');
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows public routes without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/public');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('allows authenticated routes without tenant context when no roles are required', async () => {
    const token = createAccessToken({});
    const response = await request(app.getHttpServer())
      .get('/authenticated')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: 'user-1' });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('runs middleware and guard chain successfully with snake_case tenant claims', async () => {
    rbacCacheService.getUserRole.mockResolvedValue('owner');
    const token = createAccessToken({
      tenant_id: TEST_TENANT_ID,
      tenant_role: 'owner',
    });

    const response = await request(app.getHttpServer())
      .get('/organizations/current/access')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: 'user-1',
      tenantId: TEST_TENANT_ID,
    });
    expect(db.execute).not.toHaveBeenCalled();
    expect(rbacCacheService.getUserRole).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'user-1',
    );

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(mockTxExecute).toHaveBeenCalledTimes(2);

    const firstCall = mockTxExecute.mock.calls[0][0];
    expect(firstCall.queryChunks).toBeDefined();
    const firstSql = firstCall.queryChunks
      .map((c: { value: unknown[] }) => c.value?.[0] ?? c)
      .join('');
    expect(firstSql).toContain('SET LOCAL ROLE authenticated');

    const secondCall = mockTxExecute.mock.calls[1][0];
    const secondSql = secondCall.queryChunks
      .map((c: { value: unknown[] }) => c.value?.[0] ?? c)
      .join('');
    expect(secondSql).toContain('set_config');
  });

  it('rejects role-protected routes when tenant context is missing', async () => {
    const token = createAccessToken({});

    const response = await request(app.getHttpServer())
      .get('/organizations/current/access')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.type).toBe(
      'https://agentloom.dev/errors/tenant-required',
    );
    expect(rbacCacheService.getUserRole).not.toHaveBeenCalled();
  });

  it('rejects role-protected routes when the resolved role is insufficient', async () => {
    rbacCacheService.getUserRole.mockResolvedValue('viewer');
    const token = createAccessToken({
      tenant_id: TEST_TENANT_ID,
      tenant_role: 'viewer',
    });

    const response = await request(app.getHttpServer())
      .get('/organizations/current/access')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.type).toBe(
      'https://agentloom.dev/errors/insufficient-permissions',
    );
  });
});
