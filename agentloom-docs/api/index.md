---
docType: reference
---

# API 约定

AgentLoom 的 HTTP API 共用的地址、凭证、字段命名、响应信封、错误格式与限流规则。每个端点的参数与响应结构见 [REST 参考](/api/rest)。

本页的请求与输出来自本地 `agentloom-server`（`APP_DEPLOYMENT_MODE=private`）的实际运行；示例中的 ID 与 Token 是那次运行的值，换成你自己的即可。

## 基础地址

| 项 | 值 |
| --- | --- |
| 生产环境 | `https://agentloom.ling.plus/api/v1` |
| 自托管 | `https://<你的域名>/api/v1`（反向代理把 `/api/` 转发到 server，见 [反向代理](/deploy/reverse-proxy)） |
| 本地开发 | `http://localhost:3000/api/v1` |
| 健康检查 | `GET /api/v1/health`，无需凭证，不计入限流 |

```bash
curl -s http://localhost:3000/api/v1/health
```

```json
{"status":"ok","timestamp":"2026-10-01T09:36:45.657Z"}
```

## 凭证

| 凭证 | 请求头 | 可调用范围 | 获取方式 |
| --- | --- | --- | --- |
| 用户会话 JWT | `Authorization: Bearer <access_token>` | 除 `/agent-api/*` 外的全部受保护接口 | Studio 登录后的会话；或 `POST /api/v1/auth/login`，取响应 `data.tokens.access_token` |
| 平台 API Token | `X-Api-Key: al_<64 位十六进制>` | 同 JWT | Studio「设置 → API Token」（`/settings/api-tokens`），或 `POST /api/v1/platform-api-tokens` |
| Agent API Key | `Authorization: Bearer alak_<64 位十六进制>` | 仅 `/api/v1/agent-api/*`，且只能访问创建它的那个 Agent | Agent 版本工具栏「API 访问」，见 [Agent 对外 API](/api/agent-api) |

### 用户会话 JWT

由 Supabase Auth 签发，HS256 签名，`aud` 为 `authenticated`。server 用 `APP_JWT_SECRET` 验签，所以它必须等于 Supabase 的 JWT secret。令牌中的 `tenant_id` 与 `tenant_role` 声明由 Supabase 的 access token hook 写入，决定请求落在哪个组织、以什么角色执行；缺少 `tenant_id` 的令牌访问需要角色的接口时返回 400 `tenant-required`。

### 平台 API Token

- 以创建者身份调用，权限等于创建者在该组织中的当前角色（每次请求时解析，不在 Token 中固化），再由 `scopes` 收窄。
- 明文只在创建响应的 `data.token` 中返回一次，服务端只保存 SHA-256 哈希。
- 每个用户在每个组织最多保留 20 个 Token。
- 创建请求体字段：`name`（必填）、`scopes`（可选字符串）、`expires_at`（可选，ISO 8601）。
- `scopes` 的取值是权限名（`agentloom-contracts/src/rbac.ts` 中 `RBAC_PERMISSION_MATRIX` 的键，如 `workflow:read`、`workflow:run`），以空格或逗号分隔；含未知取值时返回 422，保存时按词表顺序规范化为空格分隔。留空（`null`）表示继承创建者角色的全部权限。
- 限定了 `scopes` 的 Token 只能调用所需权限在 `scopes` 内的接口；所需权限不在其中、或接口尚未声明所需权限时，返回 403 `insufficient-scope`。例如只有 `workflow:read` 的 Token 启动工作流：

  ```json
  {"type":"https://agentloom.dev/errors/insufficient-scope","title":"API Token 作用域不足","status":403,"detail":"缺少作用域：workflow:run","instance":"/api/v1/workflow-definitions/353d0225-d3a0-4502-bf91-fbf2ad817fa5/run","requiredScope":"workflow:run","grantedScopes":["workflow:read"]}
  ```

```bash
curl -s http://localhost:3000/api/v1/platform-api-tokens \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"name":"CI 脚本","scopes":"workflow:read"}'
```

```json
{"data":{"id":"01a0f6e0-a59e-7d71-95d9-9a58748317fc","name":"CI 脚本","tokenPrefix":"al_6488f319","scopes":"workflow:read","lastUsedAt":null,"expiresAt":null,"isRevoked":false,"createdAt":"2026-10-01T09:51:52.734Z","token":"al_6488f319<其余 56 位已省略>"}}
```

### 同时携带两种头

只要请求带有 `Authorization: Bearer …`，server 就按 JWT 校验，忽略 `X-Api-Key`；JWT 无效时直接返回 401，不会改用 API Token。

```bash
curl -s "http://localhost:3000/api/v1/workflow-definitions?pageSize=1" \
  -H "Authorization: Bearer bad.token" \
  -H "X-Api-Key: $AGENTLOOM_API_TOKEN"
```

```json
{"type":"https://agentloom.dev/errors/token-invalid","title":"Unauthorized","status":401,"detail":"Token signature is invalid or token is malformed","instance":"/api/v1/workflow-definitions?pageSize=1"}
```

### 认证错误

| `type` 后缀 | 状态码 | 条件 |
| --- | --- | --- |
| `token-missing` | 401 | 两种请求头都没有 |
| `token-invalid` | 401 | JWT 签名错误、格式错误或缺少必需声明 |
| `token-expired` | 401 | JWT 已过期 |
| `token-revoked` | 401 | JWT 已注销 |
| `platform-api-token-invalid` | 401 | API Token 不存在或已吊销 |
| `platform-api-token-expired` | 401 | API Token 超过 `expires_at` |
| `agent-api-key-invalid` | 401 | Agent API Key 无效、已吊销或已过期 |
| `tenant-required` | 400 | 令牌没有组织上下文 |
| `insufficient-permissions` | 403 | 角色不满足接口要求 |
| `insufficient-scope` | 403 | 平台 API Token 的 `scopes` 不含接口所需权限，或接口未声明所需权限 |

## 字段命名

server 不做大小写转换：请求体与查询参数的字段名就是各接口 DTO 里声明的名字，以 [REST 参考](/api/rest) 为准。

- **响应体**：由数据库行直接序列化，字段为 camelCase（`tenantId`、`createdAt`、`publishedVersionId`）。少数接口自行组装响应，例如 `POST /api/v1/auth/login` 返回 `access_token`、`refresh_token`。
- **请求体**：两种写法并存。较新的接口与对外接口用 camelCase（如 `PATCH /workflow-definitions/:id` 的 `inputSchema`、`/agent-api/*` 全部字段）；部分管理接口用 snake_case（如 `POST /workflow-definitions` 的 `template_slug`、`POST /agent-definitions/:agentId/api-keys` 的 `max_concurrent_runs`、`POST /platform-api-tokens` 的 `expires_at`）。
- 声明了 `.strict()` 的 DTO 对未知字段返回 422；未声明的 DTO 会**静默丢弃**未知字段。写错大小写不一定报错。

同一个工作流上的两组请求：

```bash
# 创建：DTO 声明的是 template_slug，camelCase 的 templateSlug 被静默丢弃
curl -s -w '\n%{http_code}\n' http://localhost:3000/api/v1/workflow-definitions \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"name":"大小写验证 A","templateSlug":"no-such-template"}'
curl -s -w '\n%{http_code}\n' http://localhost:3000/api/v1/workflow-definitions \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"name":"大小写验证 B","template_slug":"no-such-template"}'
```

```text
{"data":{"id":"01a0f6d4-d723-7e4a-b46c-79832d812d83","tenantId":"01a0f6d2-bbf5-7c10-a65a-5b5c196594ce","name":"大小写验证 A","slug":"大小写验证-a","description":null,"icon":null,"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1},"metadata":{},"inputSchema":null,"version":1,"status":"draft","publishedVersionId":null,"createdBy":"11111111-1111-4111-8111-111111111111","updatedBy":"11111111-1111-4111-8111-111111111111","createdAt":"2026-10-01T09:38:58.975Z","updatedAt":"2026-10-01T09:38:58.975Z"}}
201
{"type":"https://agentloom.dev/errors/template-not-found","title":"Template Not Found","status":404,"detail":"Template with slug 'no-such-template' was not found.","instance":"/api/v1/workflow-definitions"}
404
```

```bash
# 更新：DTO 为 strict camelCase，snake_case 字段返回 422
WF_ID=01a0f6d4-d723-7e4a-b46c-79832d812d83
curl -s -w '\n%{http_code}\n' -X PATCH http://localhost:3000/api/v1/workflow-definitions/$WF_ID \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"version":2,"input_schema":{"fields":[]}}'
```

```text
{"type":"https://agentloom.dev/errors/validation-error","title":"Validation Error","status":422,"detail":"Request validation failed","instance":"/api/v1/workflow-definitions/01a0f6d4-d723-7e4a-b46c-79832d812d83","errors":[{"field":"","message":"Unrecognized key: \"input_schema\""}]}
422
```

Studio 的 API 客户端（`agentloom-studio/src/shared/api/client.ts`）在 `afterResponse` 钩子里把响应键转成 camelCase，请求体不自动转换：需要 snake_case 的接口由调用处显式调用 `toSnakeBody()`。

## 响应信封

| 形状 | 使用场景 |
| --- | --- |
| `{"data": {…}}` | 单个资源 |
| `{"data": […], "meta": {…}}` | 分页列表；`meta` 含 `page`、`pageSize`、`total`，多数列表还有 `totalPages` |
| 裸对象 | 少数接口直接返回结果对象，例如 `POST /api/v1/webhooks/:token`、`POST /api/v1/api-events`、`/plugins/developer-keys`、`/plugins/marketplace/earnings/*`、`/health` |
| `204` 无响应体 | 删除、吊销类操作 |

列表请求：

```bash
curl -s "http://localhost:3000/api/v1/workflow-definitions" -H "Authorization: Bearer $JWT"
```

```json
{"data":[],"meta":{"total":0,"page":1,"pageSize":20,"totalPages":0}}
```

## 错误格式

所有错误响应为 RFC 9457 Problem Details，`Content-Type: application/problem+json`：

| 字段 | 说明 |
| --- | --- |
| `type` | 错误类型 URI，前缀固定为 `https://agentloom.dev/errors/`；按它分支处理，不要按 `title` 或 `detail` |
| `title` | 简短标题 |
| `status` | HTTP 状态码 |
| `detail` | 本次错误的具体说明 |
| `instance` | 请求路径 |
| `errors` | 可选，`[{ "field", "message" }]`，校验错误时出现 |
| 其他扩展字段 | 个别错误附带上下文，例如 `conversation-busy` 的 `activeRunId` |

- 请求体或查询参数校验失败：422，`type` 为 `…/validation-error`。
- 未被领域异常覆盖的框架错误：`…/http-error`；未处理异常：500 `…/internal-server-error`。
- 全部错误类型见 [错误参考](/guide/troubleshooting/errors)。

## 限流

每分钟窗口计数，默认 100 次。成功响应带 `X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`（秒）；被拦截时状态码 429，另带 `Retry-After`（秒）。

| 调用方 | 计数桶 | 上限来源 | 超限时的 `type` |
| --- | --- | --- | --- |
| 带组织上下文的 JWT 或平台 API Token | 整个组织共用 | 组织资源配额 `apiRateLimitPerMinute`，未设置时 100 | `resource-governance-decision-blocked` |
| Agent API Key | 每个 Key 独立 | Key 的 `rate_limit_per_minute`，未设置时同所属组织 | `rate-limit-exceeded` |
| 无凭证的公开接口（如 Webhook） | 按来源 IP | 100 | `rate-limit-exceeded` |

组织还可以配置每日调用总量 `dailyApiCallLimit`，超出后同样返回 `resource-governance-decision-blocked`，次日 UTC 0 点重置。

组织请求超限（输出截断了 `block` 扩展字段）：

```text
HTTP/1.1 429 Too Many Requests
retry-after: 60
x-ratelimit-limit: 100
x-ratelimit-remaining: 0
x-ratelimit-reset: 60
content-type: application/problem+json; charset=utf-8

{"type":"https://agentloom.dev/errors/resource-governance-decision-blocked","title":"资源治理决策被阻止","status":429,"detail":"组织 01a0f6d2-bbf5-79f0-9744-fb059f425613 的配额指标 apiRateLimitPerMinute 已阻止 api_request：当前值 104，限制值 100","instance":"/api/v1/workflow-definitions?pageSize=1","errors":[{"field":"apiRateLimitPerMinute","message":"当前资源治理限制阻止了该决策"}],"block":{"decision":"blocked","action":"api_request","category":"api_rate_limit"}}
```

无凭证请求超限：

```text
HTTP/1.1 429 Too Many Requests
retry-after: 60
x-ratelimit-limit: 100
x-ratelimit-remaining: 0
x-ratelimit-reset: 60
content-type: application/problem+json; charset=utf-8

{"type":"https://agentloom.dev/errors/rate-limit-exceeded","title":"Too Many Requests","status":429,"detail":"Rate limit exceeded, retry later","instance":"/api/v1/webhooks/nope"}
```

## 实时事件

Studio 使用的 Socket.IO 事件不属于对外 HTTP API，命名空间与事件清单见 [实时通道](/dev/server/realtime)。对外场景请用 [Agent 对外 API](/api/agent-api) 的 SSE 流或轮询。
