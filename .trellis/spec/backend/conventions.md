# Conventions

> Coding conventions and patterns in agentloom-server.

---

## Overview

Services inject Drizzle directly (no repository layer). DTOs use Zod (not class-validator). Multi-tenancy is enforced through PostgreSQL RLS via an interceptor chain. All responses use a `{ data }` envelope.

---

## Module Structure Pattern

**Controller -> Service -> Drizzle (no Repository layer)**

Services inject Drizzle via `@Inject(DRIZZLE)` and query inline:

```typescript
// src/modules/api-key/api-key.service.ts
@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly encryptionService: EncryptionService,
  ) {}
}
```

Every service that needs tenant-scoped queries defines a `private get tenantDb()` getter.

---

## DTO Pattern: Zod + nestjs-zod

DTOs are Zod schemas, **never class-validator**.

### Pattern 1: createZodDto class

```typescript
// src/modules/api-key/dto/create-api-key.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createApiKeySchema = z.object({
  provider: z.enum(LLM_PROVIDERS, { message: '无效的 LLM 提供商' }),
  label: z.string().min(1, '标签不能为空').max(255, '标签长度不能超过 255 个字符'),
  apiKey: z.string().min(1, 'API 密钥不能为空'),
  isDefault: z.boolean().optional().default(false),
});
export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
```

### Pattern 2: Explicit schema + per-parameter pipe

```typescript
// src/modules/agent-definition/dto/create-agent-definition.dto.ts
export const CreateAgentDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});
export class CreateAgentDefinitionDto extends createZodDto(CreateAgentDefinitionSchema) {}

// In controller:
@Body(new ZodValidationPipe(CreateAgentDefinitionSchema)) dto: CreateAgentDefinitionDto,
```

### DTO Barrel Exports

Organized via `dto/index.ts` that re-exports schemas, DTO classes, and types.

---

## Multi-Tenancy

### How It Works

The `TenantTransactionInterceptor` wraps every authenticated request in a Postgres transaction with:
- `SET LOCAL ROLE authenticated`
- `set_config('app.current_tenant', tenantId, true)`

This enables PostgreSQL Row-Level Security (RLS) for automatic tenant isolation.

### Accessing Tenant DB in Services

```typescript
private get tenantDb(): DrizzleDB {
  return getTenantDb(this.db);
}
```

`getTenantDb()` reads from `AsyncLocalStorage` set by the interceptor. Falls back to raw connection if no transaction is active.

### Guard Chain (in order)

1. `TenantMiddleware` — extracts tenant from JWT
2. `TenantTransactionInterceptor` (APP_INTERCEPTOR) — wraps in tenant transaction
3. `CustomThrottlerGuard` (APP_GUARD) — rate limiting
4. `AuthGuard` (APP_GUARD) — JWT/API-key authentication
5. `TenantGuard` (APP_GUARD) — ensures tenant context exists
6. `RolesGuard` (APP_GUARD) — checks `@Roles()` metadata

---

## Dependency Injection

- `DRIZZLE` is a Symbol token provided by `DatabaseModule`
- Services use `@Inject(DRIZZLE) private readonly db: DrizzleDB`
- No custom injection tokens for services — NestJS class-based DI is the default
- Module definitions are minimal: `imports`, `controllers`, `providers`, `exports`

---

## Response Envelope

All controllers return `{ data }` consistently:

```typescript
async create(...) {
  const data = await this.service.create(dto, userId, tenantId);
  return { data };
}
```

For paginated lists, services return:
```typescript
{ data: T[], meta: { total, page, pageSize, totalPages } }
```

---

## Logging

Every service and guard uses:

```typescript
private readonly logger = new Logger(ClassName.name);
```

Structured JSON for audit events:
```typescript
this.logger.log(`API Key 审计 ${JSON.stringify({ action, actorId, keyId, tenantId, timestamp })}`);
```

---

## Forbidden Patterns

1. **Repository layer** — query Drizzle directly in services
2. **class-validator** — use Zod + nestjs-zod exclusively
3. **Express APIs** — use `FastifyReply`/`FastifyRequest` (not `express.Response`)
4. **Direct `this.db` for tenant queries** — always use `this.tenantDb` via `getTenantDb()`
5. **Raw `HttpException` throws** — always use `DomainException` subclasses
6. **`@UseGuards()` per-route for standard auth** — the guard chain is global

---

## Examples

- Service with tenant DB: `src/modules/api-key/api-key.service.ts`
- DTO with Zod: `src/modules/agent-definition/dto/create-agent-definition.dto.ts`
- Multi-tenant interceptor: `src/common/interceptors/tenant-transaction.interceptor.ts`
