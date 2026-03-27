# API Guidelines

> Controller patterns, guard chain, DTOs, and response format in agentloom-server.

---

## Overview

Controllers use a standardized decorator stack with global guards (no per-route `@UseGuards` for standard auth). Validation uses Zod via `ZodValidationPipe`. All responses follow a `{ data }` envelope, and errors use RFC 7807 Problem Details.

---

## Controller Pattern

```typescript
// src/modules/agent-definition/agent-definition.controller.ts
@ApiTags('Agent Definitions')
@Controller('agent-definitions')
export class AgentDefinitionController {
  constructor(private readonly service: AgentDefinitionService) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create agent definition' })
  @ApiResponse({ status: 201, description: 'Agent created' })
  async create(
    @Body(new ZodValidationPipe(CreateAgentDefinitionSchema)) dto: CreateAgentDefinitionDto,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.service.create(dto, userId);
    return { data };
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get agent definition by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.service.findOne(id, tenantId);
    return { data };
  }
}
```

---

## Decorator Stack

| Decorator | Purpose | Notes |
|-----------|---------|-------|
| `@ApiTags('...')` | Swagger grouping | Required on every controller |
| `@Controller('...')` | Route prefix | kebab-case |
| `@Roles('owner', 'admin', ...)` | RBAC | Available roles: `owner`, `admin`, `creator`, `operator`, `viewer` |
| `@HttpCode(HttpStatus.CREATED)` | POST response code | Required for POST (Fastify defaults to 200, not 201) |
| `@ApiOperation({ summary })` | Swagger docs | Required on every endpoint |
| `@Public()` | Skip auth | Uses `IS_PUBLIC_KEY` Reflector metadata |

---

## Parameter Decorators

| Decorator | Extracts |
|-----------|----------|
| `@CurrentUser('sub')` | User ID from JWT |
| `@CurrentTenant()` | Tenant ID from request context |
| `@Param('id', ParseUUIDPipe)` | UUID path parameter |
| `@Body(new ZodValidationPipe(Schema))` | Validated request body |
| `@Query()` | Query parameters |

---

## Guard Chain (Global)

Defined in `app.module.ts`, executed in order:

1. **TenantMiddleware** — extracts tenant from JWT
2. **TenantTransactionInterceptor** — wraps request in tenant transaction with RLS
3. **CustomThrottlerGuard** — rate limiting (100 req/min)
4. **AuthGuard** — JWT authentication, API-key fallback (`X-Api-Key` header)
5. **TenantGuard** — ensures tenant context exists
6. **RolesGuard** — checks `@Roles()` metadata

**Do NOT add `@UseGuards()` per-route for standard auth** — the chain is global.

---

## Public Routes

Use `@Public()` decorator to skip `AuthGuard`. The `TenantMiddleware` is excluded for specific patterns in `app.module.ts`:

- `/templates` (browsing)
- `/marketplace/browse`
- `/s/:token` (share links)
- `/webhooks`

---

## Response Format

### Success Response

```json
{ "data": { ... } }
```

### Paginated Response

```json
{
  "data": [ ... ],
  "meta": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

### Error Response (RFC 7807 Problem Details)

```json
{
  "type": "https://agentloom.dev/errors/api-key-not-found",
  "title": "API 密钥未找到",
  "status": 404,
  "detail": "ID 为 xxx 的 API 密钥不存在",
  "instance": "/api/v1/api-keys/xxx"
}
```

Content-Type: `application/problem+json`

---

## DTO Validation

Two mechanisms coexist:

1. **Global pipe** (`main.ts`): `app.useGlobalPipes(new ZodValidationPipe())` — catches `createZodDto` classes automatically
2. **Per-parameter pipe**: `@Body(new ZodValidationPipe(Schema))` — when schema is exported separately

See [Conventions](./conventions.md) for detailed DTO patterns.

---

## Forbidden Patterns

1. **Express APIs** — use `FastifyReply`/`FastifyRequest`
2. **Missing `@HttpCode`** on POST endpoints — Fastify defaults to 200
3. **Raw data returns** — always wrap in `{ data }`
4. **Per-route `@UseGuards()`** for standard auth — the chain is global
5. **`NotFoundException` from NestJS** — use module-specific `XxxNotFoundException extends DomainException`
6. **Missing `@ApiTags` / `@ApiOperation`** — all endpoints need Swagger documentation

---

## Examples

- CRUD controller: `src/modules/api-key/api-key.controller.ts`
- Complex controller: `src/modules/agent-definition/agent-definition.controller.ts`
- Custom decorators: `src/common/decorators/`
- Global filter: `src/common/filters/all-exceptions.filter.ts`
