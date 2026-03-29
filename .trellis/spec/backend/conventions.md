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

## Scenario: Sandbox Runtime Unified Knowledge Tool Injection

### 1. Scope / Trigger

- Trigger: touching `src/modules/agent/sandbox-agent.adapter.ts`, `AgentRuntimeConfig.knowledgeBindings`, or any constructor dependency used while building runtime tools for sandbox sessions.

### 2. Signatures

- `SandboxAgentAdapter.createRuntimeConfigToolProvider(session, runtimeConfig): SessionToolProvider | null`
- `SandboxAgentAdapter.buildRuntimeConfigToolSet(session, runtimeConfig): Promise<ToolSet>`
- `SandboxAgentAdapter.buildKnowledgeToolEntry(session, bindings): { name: string; tool: Tool } | null`
- `AgentRuntimeConfig.knowledgeBindings?: Array<{ knowledgeBaseId: string; topK?: number; similarityThreshold?: number; enabled: boolean }>`
- Sandbox session bootstrap request: `POST /v1/session` with `remoteToolExecution.tools[]`

### 3. Contracts

- When `runtimeConfig.knowledgeBindings` contains at least one `enabled: true` binding and `session.tenantId` exists, sandbox session bootstrap must include exactly one remote tool named `search_knowledge`.
- The tool description must list the currently available knowledge base IDs, because the sandbox runtime exposes that description verbatim to the model.
- Tool execution must require explicit `knowledgeBaseIds`, reject IDs outside the connected knowledge-base bindings, and call `RagService.search(query, tenantId, { knowledgeBaseIds, limit, scoreThreshold })`.
- `RagService` and `CodeExecutionService` constructor parameters in `SandboxAgentAdapter` must be imported as runtime values, not `import type`, because NestJS resolves class-based dependencies from runtime `design:paramtypes` metadata.
- Returning `null` from `buildKnowledgeToolEntry()` is only valid for true runtime preconditions such as missing `session.tenantId`; it must not be used to hide broken DI wiring.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| `knowledgeBindings` empty or absent | Do not send `remoteToolExecution` block for knowledge tools | Inspect `/v1/session` request payload |
| Mixed enabled / disabled bindings | Only enabled bindings participate in the single `search_knowledge` tool whitelist | Unit test on `buildRuntimeConfigToolSet()` |
| `session.tenantId` missing | `buildKnowledgeToolEntry()` returns `null` and no tool is exposed | Unit test with session precondition |
| Tool called without `knowledgeBaseIds` | Reject with explicit runtime error | Adapter unit test on tool execution |
| Tool called with IDs outside connected knowledge nodes | Reject with explicit runtime error | Adapter unit test on whitelist validation |
| `RagService` or `CodeExecutionService` imported with `import type` | Broken wiring: tools silently disappear even though compile output contains bindings | Regression test on `Reflect.getMetadata('design:paramtypes', SandboxAgentAdapter)` |
| Tool is executed by sandbox runtime | Server receives `POST /api/v1/agent-runtime/sessions/:sessionId/tool-executions` and returns RAG results | Manual/browser E2E plus server log |

### 5. Good / Base / Bad Cases

- Good: `knowledgeBindings=[{ knowledgeBaseId: 'kb-1', topK: 5, enabled: true }, { knowledgeBaseId: 'kb-2', enabled: true }]` produces a single `search_knowledge` tool in `/v1/session`; the model passes `knowledgeBaseIds: ['kb-1']`, and the final assistant response includes retrieved content.
- Base: no knowledge bindings means the sandbox still starts normally, but no `search_knowledge` tool is advertised.
- Bad: compile output contains `knowledgeBindings`, but `/v1/session` lacks `search_knowledge` because constructor dependencies were erased by type-only imports.

### 6. Tests Required

- `src/modules/agent/__tests__/sandbox-agent.adapter.spec.ts`
  - Assert enabled `runtimeConfig.knowledgeBindings` become a single `remoteToolExecution.tools[]` entry named `search_knowledge`.
  - Assert the tool schema requires `knowledgeBaseIds` and rejects IDs outside the connected whitelist.
  - Assert `Reflect.getMetadata('design:paramtypes', SandboxAgentAdapter)` still contains `RagService` and `CodeExecutionService` at the constructor positions used by NestJS.
- `src/modules/agent/__tests__/pi-agent-core.adapter.spec.ts`
  - Assert in-process runtime exposes the same single `search_knowledge` tool contract as sandbox runtime.
- Manual/browser E2E:
  - Bind one or more knowledge-base nodes to an agent.
  - Ask for a unique marker only present in the knowledge base.
  - Confirm the UI shows `search_knowledge` tool usage with explicit `knowledgeBaseIds`, and the assistant final answer contains the marker.

### 7. Wrong vs Correct

#### Wrong

```typescript
import type { RagService } from '../knowledge/services/rag.service';
import type { CodeExecutionService } from './code-execution.service';
```

#### Correct

```typescript
import { RagService } from '../knowledge/services/rag.service';
import { CodeExecutionService } from './code-execution.service';
```

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
