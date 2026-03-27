# Directory Structure

> How backend code is organized in agentloom-server.

---

## Overview

agentloom-server uses **NestJS modular architecture** with 35 feature modules. Each module is self-contained with controller, service, DTOs, exceptions, and optional sub-services. There is no repository layer — services query Drizzle directly.

---

## Directory Layout

```
agentloom-server/src/
├── main.ts                  # Fastify bootstrap (global prefix, filters, pipes, Swagger, Socket.IO)
├── app.module.ts            # Root module (imports all modules, global guards/interceptors)
├── acp-stdio.ts             # Standalone ACP stdio entry point
├── common/                  # Cross-cutting concerns
│   ├── decorators/          # @CurrentUser, @CurrentTenant, @Roles, @Public
│   ├── exceptions/          # DomainException base + auth exceptions
│   ├── filters/             # AllExceptionsFilter (RFC 7807)
│   ├── guards/              # AuthGuard, TenantGuard, RolesGuard, ThrottlerGuard
│   ├── interceptors/        # TenantTransactionInterceptor
│   ├── middleware/           # TenantMiddleware
│   ├── pipes/               # ZodValidationPipe
│   ├── providers/           # tenant-aware-db.provider.ts (getTenantDb)
│   ├── redis/               # Redis client, cache, pub/sub services
│   └── types/               # Shared types (ProblemDetails, etc.)
├── config/                  # AppConfigModule (environment config)
├── database/
│   ├── database.module.ts   # DatabaseModule (DRIZZLE provider)
│   ├── schema/              # All table definitions (Drizzle pgTable)
│   │   ├── index.ts         # Barrel export of all schemas
│   │   ├── rls-policies.ts  # RLS policy helpers
│   │   └── *.schema.ts      # Individual table schemas
│   └── migrations/          # Raw SQL migration files (0000_ to 0052_+)
├── infrastructure/
│   └── storage/             # StorageModule (file storage abstraction)
├── modules/                 # All feature/domain modules (~35)
│   ├── agent/
│   ├── agent-conversation/
│   ├── agent-definition/
│   ├── agent-execution/
│   ├── agent-memory/
│   ├── api-key/
│   ├── acp-gateway/
│   ├── auth/
│   ├── evidence/
│   ├── execution/
│   ├── execution-record/
│   ├── health/
│   ├── intervention-policy/
│   ├── knowledge/
│   ├── llm/
│   ├── marketplace/
│   ├── mcp/
│   ├── monitoring/
│   ├── notification/
│   ├── optimization-suggestion/
│   ├── organization/
│   ├── platform-api-token/
│   ├── plugin/
│   ├── private-deployment/
│   ├── resource-governance/
│   ├── reusable-block/
│   ├── sandbox/
│   ├── share/
│   ├── shared-resources/
│   ├── skill/
│   ├── smart-routing/
│   ├── template/
│   ├── tenant-key/
│   ├── trigger/
│   ├── workflow-definition/
│   └── workspace/
└── openapi/                 # Swagger document creation
```

---

## Module Internal Structure

### Pattern A: Flat Module (most common)

```
modules/api-key/
├── api-key.module.ts
├── api-key.controller.ts
├── api-key.service.ts
├── api-key.exceptions.ts
├── encryption.service.ts          # Additional services (optional)
├── dto/
│   ├── create-api-key.dto.ts
│   ├── rotate-api-key.dto.ts
│   ├── api-key-response.dto.ts
│   └── index.ts                   # DTO barrel export
└── __tests__/
    └── *.spec.ts
```

### Pattern B: Nested Services (complex modules)

```
modules/agent-memory/
├── agent-memory.module.ts
├── agent-memory.controller.ts
├── memory-tools.service.ts
├── memory.gateway.ts              # Socket.IO gateway
├── memory-resource.provider.ts
├── constants/
│   └── memory-system-prompt.template.ts
├── dto/
│   ├── index.ts
│   └── *.dto.ts
├── services/
│   ├── boot-protocol.service.ts
│   ├── memory-node.service.ts
│   ├── memory-edge.service.ts
│   └── __tests__/
│       └── *.spec.ts
└── __tests__/
    └── *.spec.ts
```

---

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Module directory | kebab-case | `agent-definition/` |
| Module file | `{name}.module.ts` | `agent-definition.module.ts` |
| Controller file | `{name}.controller.ts` | `agent-definition.controller.ts` |
| Service file | `{name}.service.ts` | `agent-definition.service.ts` |
| Exception file | `{name}.exceptions.ts` | `agent-definition.exceptions.ts` |
| DTO file | `{action}-{entity}.dto.ts` | `create-agent-definition.dto.ts` |
| Schema file | `{table-name}.schema.ts` | `api-keys.schema.ts` |
| Worker file | `{name}.worker.ts` | `execution.worker.ts` |
| Scheduler file | `{name}.scheduler.ts` | `audit-log-retention.scheduler.ts` |
| Constants file | `{name}.constants.ts` | `execution.constants.ts` |
| Test file | `*.spec.ts` | `api-key.service.spec.ts` |
| E2E test file | `*.e2e-spec.ts` | `api-key.e2e-spec.ts` |

---

## Examples

- Flat module: `src/modules/api-key/`
- Complex module with sub-services: `src/modules/agent-memory/`
- Module with queues: `src/modules/evidence/`
- Cross-cutting concerns: `src/common/`
