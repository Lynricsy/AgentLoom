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

## Aggregation / Browse Endpoints

For endpoints that return enriched or aggregated data (not raw DB rows), use a private helper method in the controller:

```typescript
// agent-memory.controller.ts — Node enrichment for browse UI
@Get(':id/browse')
async browse(@Param('id') id: string, @Query() query: BrowseQueryDto) {
  const node = await this.pathResolverService.resolveUri(id, query.uri);
  const enriched = await this.enrichNodeForBrowse(node, domain, pathString);
  return { data: { node: enriched, children, breadcrumbs } };
}

private async enrichNodeForBrowse(node, domain, pathString) {
  // Parallel fetch: paths, versions, child count, glossary keywords
  const [paths, versions, [childCountRow], glossaryKeywords] = await Promise.all([...]);
  return { ...enrichedFields };
}
```

Key conventions:
- Use `Promise.all` to parallelize DB lookups for enrichment
- Response still follows `{ data }` envelope
- For domain-level aggregation, use SQL `GROUP BY` rather than in-application aggregation
- Controller glossary endpoints delegate directly to `GlossaryService` — the service handles validation and cache invalidation

## Scenario: Public Share / Import / Discover Contracts

### 1. Scope / Trigger

- Trigger:
  - 修改 `src/modules/share/` 中的 workflow / agent 分享链路
  - 修改 `src/modules/resource-source/` 中的来源分类与转正 API
  - 修改 workflow / agent / knowledge / memory / mcp / skill 列表 API 的 `sourceKind` 过滤
  - 修改 `/marketplace/browse` 与 `/s/:token` 之间的公开浏览边界

### 2. Signatures

- `POST /api/v1/workflow-shares`
- `GET /api/v1/workflow-shares?workflow_definition_id=<id>&page=<n>&page_size=<n>`
- `DELETE /api/v1/workflow-shares/:shareId`
- `POST /api/v1/agent-shares`
- `GET /api/v1/agent-shares?agent_definition_id=<id>&page=<n>&page_size=<n>`
- `DELETE /api/v1/agent-shares/:shareId`
- `GET /api/v1/s/:token`
- `POST /api/v1/agent-shares/:token/import`
- `POST /api/v1/workflow-definitions`
  - clone source: `template_slug | share_token | marketplace_listing_id`（互斥）
- `POST /api/v1/resource-sources/:resourceType/:resourceId/convert-to-manual`
- `GET /api/v1/workflow-definitions?sourceKind=manual|share_imported`
- `GET /api/v1/agent-definitions?sourceKind=manual|share_imported`
- `GET /api/v1/knowledge-bases?sourceKind=manual|share_imported`
- `GET /api/v1/memory-instances?sourceKind=manual|share_imported`
- `GET /api/v1/mcp/configs?sourceKind=manual|share_imported`
- `GET /api/v1/skills?sourceKind=manual|share_imported`
- `GET /api/v1/marketplace/browse`

### 3. Contracts

- `GET /api/v1/s/:token` 必须保持公开只读、tenantless 访问；`TenantMiddleware` 继续对 `s` 与 `s/{*splat}` 排除。
- public share response 必须是按 `resourceType` 区分的判别联合：
  - workflow:
    - `resourceType='workflow'`
    - `workflowDefinitionId`
    - `workflowName`
    - `workflowDescription`
  - agent:
    - `resourceType='agent'`
    - `agentDefinitionId`
    - `agentName`
    - `agentDescription`
    - `runtimeMode`
    - `inputSchema`
    - `sandboxLifecycle`
- 两类 public share response 都必须包含：
  - `token`
  - `title`
  - `description`
  - `shareType`
  - `author { displayName, email, avatarUrl }`
  - `definition { nodes, edges, viewport }`
  - `nodeCount`
  - `edgeCount`
  - `createdAt`
  - `expiresAt`
- workflow 分享导入必须继续复用 `POST /api/v1/workflow-definitions` 的 `share_token` 克隆源，而不是新增第二套 workflow import API。
- agent 分享导入必须走 `POST /api/v1/agent-shares/:token/import`，响应为：
  - `agentDefinitionId`
  - `name`
  - `publishedVersionId`
  - `summary { cloned, cleared, needsRebind, skippedEphemeral }`
  - `report[]`
- agent import `report[]` 必须保留逐资源结果，`outcome` 只能是：
  - `cloned`
  - `cleared`
  - `needs_rebind`
  - `skipped_ephemeral`
- `resource-sources/:resourceType/:resourceId/convert-to-manual` 只允许把来源分类收口为 `manual`，不能篡改业务资源本体；当来源记录不存在时也必须返回 `{ resourceType, resourceId, currentKind: 'manual' }`，保持幂等。
- workflow / agent 列表与详情响应必须暴露 `resourceSourceKind`；knowledge / memory / mcp / skill 列表与详情继续暴露 `sourceKind`。所有上述列表入口的 query filter 统一使用 `sourceKind=manual|share_imported`。
- discover 页面不能引入独立 discover backend；`/discover` 继续复用 `GET /api/v1/marketplace/browse` 的上架 listing 数据，而直链分享内容不能进入 browse/discover 池。

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| 创建 workflow share 时 definition 未发布 | 返回 409 share-not-published，而不是创建空 token | `share.service.spec.ts` |
| 创建 agent share 时 definition 未发布 | 返回 409 share-agent-not-published | `share.service.spec.ts` |
| 访问 workflow share token | `GET /s/:token` 返回 workflow 判别分支与 snapshot graph | `share.service.spec.ts` |
| 访问 agent share token | `GET /s/:token` 返回 agent 判别分支、`runtimeMode`、`inputSchema`、`sandboxLifecycle` | `share.service.spec.ts` |
| share token 已撤销 | public access 失败，不返回过期前快照 | `share.service.spec.ts` |
| share token 已过期 | public access 失败，不返回过期前快照 | `share.service.spec.ts` |
| agent import 成功 | 返回 summary 计数与逐资源 report，且 `copyCount` 原子递增 | `share.service.spec.ts`, `agent-share-import.service.ts` tests |
| workflow create 请求同时带 `share_token` 与 `marketplace_listing_id` | clone source 校验失败 | `workflow-version.service.spec.ts` |
| `convert-to-manual` 命中分享导入资源 | 返回 `currentKind='manual'` 且资源本体不变 | `resource-source.service.spec.ts` or controller/manual QA |
| `convert-to-manual` 命中不存在来源记录的资源 | 仍返回 `currentKind='manual'`，接口保持幂等 | `resource-source.service.spec.ts` or controller/manual QA |
| `sourceKind=share_imported` 列表过滤 workflow / agent / knowledge / memory / mcp / skill | SQL / service 层只返回带 share-import record 的资源 | 对应 service/controller specs |
| `/discover` 浏览 | 只来自 `/marketplace/browse`，不混入 `/s/:token` 直链分享对象 | browser/manual QA |

### 5. Good / Base / Bad Cases

- Good: 已发布 workflow 通过 `/workflow-shares` 生成 `copyable` token，访客打开 `/s/:token` 预览 graph，点击复制后走 `POST /workflow-definitions { share_token }` 得到自己的 workflow 副本；该副本在列表中带 `resourceSourceKind='share_imported'`，转正后改为 `manual`。
- Base: 已发布 agent 通过 `/agent-shares` 生成 token，访客打开 `/s/:token` 可以预览作者、标题、简介、`runtimeMode` 与 graph；导入成功后收到 `summary + report[]`，其中 workspace 被 `cleared`、模型绑定可为 `needs_rebind`。
- Bad: 新增 discover 专用 backend，把分享直链内容混入 marketplace browse；或把 workflow import 与 agent import 都塞进一个匿名 `POST /s/:token/import`，导致前端无法按资源类型处理回执。

### 6. Tests Required

- `src/modules/share/share.service.spec.ts`
  - Assert workflow / agent share create/list/revoke / public fetch contracts.
  - Assert `GET /s/:token` workflow vs agent 判别联合字段。
- `src/modules/share/agent-share-import.service.ts` tests
  - Assert import summary/report 与 `copyCount` update。
- `src/modules/workflow-definition/__tests__/workflow-version.service.spec.ts`
  - Assert `share_token` clone source 仍与 `template_slug/marketplace_listing_id` 互斥。
- `src/modules/workflow-definition/__tests__/workflow-version.service.spec.ts`
  - Assert workflow list/detail `resourceSourceKind` round-trip。
- `src/modules/agent-definition/agent-definition.service.spec.ts`
  - Assert agent list/detail `resourceSourceKind` round-trip。
- `src/modules/knowledge/__tests__/knowledge-base.service.spec.ts`
  - Assert `sourceKind` filter and response field。
- `src/modules/mcp/__tests__/mcp.service.spec.ts`
  - Assert `sourceKind` filter and response field。
- `src/modules/skill/skill.service.spec.ts`
  - Assert `sourceKind` filter and response field。
- Browser/manual QA:
  - `/discover` 预览 -> 导入 -> 发布运行
  - `/s/:token` workflow 预览 / 导入
  - `/s/:token` agent 预览 / 导入 / 导入报告
  - 导入资源转为自己创建

### 7. Wrong vs Correct

#### Wrong

```ts
// 把 workflow 与 agent 统一成匿名 import，前端只能靠猜
@Post('s/:token/import')
async import(@Param('token') token: string) {
  return this.shareService.importAny(token);
}
```

#### Correct

```ts
@Post('agent-shares/:token/import')
async importAgent(@Param('token') token: string) {
  return { data: await this.agentShareImportService.importFromShare(token, ...) };
}

// workflow 继续通过创建定义时的 clone source 导入
await workflowVersionService.create(tenantId, userId, {
  share_token: token,
});
```

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
- Browse/enrichment endpoint: `src/modules/agent-memory/agent-memory.controller.ts` (browse, domains, glossary)
