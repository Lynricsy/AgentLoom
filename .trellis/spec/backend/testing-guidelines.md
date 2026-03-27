# Testing Guidelines

> Test patterns, mocking strategies, and E2E setup in agentloom-server.

---

## Overview

Testing uses **Vitest** (not Jest). Unit tests mock Drizzle query chains via `vi.hoisted()`. E2E tests use **Testcontainers PostgreSQL** with real migrations. Server has an **80% coverage threshold**.

---

## Test File Locations

| Type | Location | Naming |
|------|----------|--------|
| Unit tests | `src/modules/*/__tests__/*.spec.ts` or sibling `*.spec.ts` | `{name}.spec.ts` |
| E2E tests | `test/*.e2e-spec.ts` | `{feature}.e2e-spec.ts` |
| RLS E2E | `test/rls/*.e2e-spec.ts` | RLS-specific tests |

---

## vi.hoisted() Pattern

The canonical pattern for hoisting mock factories above `vi.mock()` calls:

```typescript
// src/modules/organization/__tests__/organization.controller.spec.ts
const mockedFactories = vi.hoisted(() => ({
  createMockOrganizationService: () => ({
    createOrganization: vi.fn(),
    getOrganization: vi.fn(),
    inviteMember: vi.fn(),
  }),
  createMockTokenBlacklistService: () => ({
    isBlacklisted: vi.fn().mockResolvedValue(false),
  }),
}));
```

Used in `beforeEach`:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  service = mockedFactories.createMockOrganizationService();
  controller = new OrganizationController(service as unknown as OrganizationService);
});
```

---

## Service Unit Testing (Drizzle Chain Mocking)

Services are tested by mocking the entire Drizzle query chain:

```typescript
// src/modules/agent-definition/agent-definition.service.spec.ts
const { mockTenantDb } = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  const mockTenantDb = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    execute: vi.fn(),
    transaction: vi.fn(),
  };
  return { mockTenantDb };
});

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
}));
```

Service instantiation:
```typescript
service = new AgentDefinitionService(mockTenantDb as never);
```

---

## Controller Unit Testing

Controller tests use `Test.createTestingModule` with mocked services + Fastify:

```typescript
const moduleRef = await Test.createTestingModule({
  controllers: [OrganizationController],
  providers: [
    { provide: OrganizationService, useValue: organizationService },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
}).compile();

const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
await app.init();
await app.getHttpAdapter().getInstance().ready();  // REQUIRED for Fastify
```

---

## E2E Testing (Testcontainers)

E2E tests spin up a real PostgreSQL container:

```typescript
// test/api-key.e2e-spec.ts
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start();

  // Run migrations...

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseService).useValue(createMockSupabaseService())
    .overrideProvider(DRIZZLE).useValue(drizzleDb)
    .overrideProvider(REDIS_CLIENT).useValue(createMockRedisClient())
    .overrideProvider(RedisCacheService).useValue(createMockRedisCacheService())
    .overrideProvider(RedisPubSubService).useValue(createMockRedisPubSubService())
    .compile();
}, 120_000);  // 120s timeout for container startup
```

### RLS E2E Utilities

`test/rls/rls-test-utils.ts` provides:
- `createRlsTestContext()` — sets up tenant context
- `withTenantContext()` — executes within tenant transaction
- `withoutTenantContext()` — executes without RLS
- Seed helpers for test data

---

## Test Naming

Test descriptions are in **Chinese**:

```typescript
describe('AgentDefinitionService', () => {
  it('应成功创建 Agent 并返回 detail', async () => { ... });
  it('Agent 不存在时应抛出 AgentNotFoundException', async () => { ... });
});
```

---

## Commands

```bash
pnpm test          # Unit tests (vitest run)
pnpm test:e2e      # E2E tests (requires Docker)
pnpm test:cov      # Coverage (80% threshold)
```

---

## Forbidden Patterns

1. **Jest APIs** — use Vitest (`vi.fn()`, `vi.mock()`, `vi.hoisted()`, `describe/it/expect` from vitest)
2. **Missing `await app.getHttpAdapter().getInstance().ready()`** — required before Fastify E2E tests
3. **120s timeout on individual tests** — put timeout on `beforeAll` where the container starts
4. **Real Redis in E2E** — always mock `REDIS_CLIENT`, `RedisCacheService`, `RedisPubSubService`
5. **Forgetting `vi.clearAllMocks()`** — call in `beforeEach` to prevent test pollution

---

## Examples

- Service unit test: `src/modules/agent-definition/agent-definition.service.spec.ts`
- Controller unit test: `src/modules/organization/__tests__/organization.controller.spec.ts`
- E2E test: `test/api-key.e2e-spec.ts`
- RLS test utilities: `test/rls/rls-test-utils.ts`
