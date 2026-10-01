---
title: API 参考
---

# API 参考

AgentLoom 提供完整的 RESTful API，让你可以通过编程方式管理和操作平台上的所有资源。

## API 概览

### 基础信息

| 项目 | 说明 |
|------|------|
| 基础 URL | `https://agentloom.ling.plus/api/v1/` |
| 协议 | HTTPS |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |
| API 规范 | OpenAPI 3.0 |

### 主要接口分组

AgentLoom API 覆盖以下功能模块：

- **工作流管理** -- 创建、查询、更新、删除工作流定义和版本
- **工作流执行** -- 触发执行、查询执行状态和结果
- **Agent 管理** -- Agent 定义的 CRUD 和版本管理
- **Agent 对话** -- 创建对话、发送消息、获取消息历史
- **知识库** -- 知识库和文档的管理
- **触发器** -- 触发器的配置和管理
- **技能** -- 技能的查询和管理
- **组织与成员** -- 组织管理和成员角色设置
- **市场** -- 浏览、搜索和安装市场资源
- **平台 API Token** -- API Key 的创建、查看和撤销

## 认证方式

AgentLoom API 支持两种认证方式，你可以根据使用场景选择合适的方式。

### 方式一：JWT Token（适合浏览器/前端应用）

通过 Supabase Auth 认证获取 JWT Token，通过 `Authorization` 请求头传递：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

JWT Token 包含用户身份、租户信息和角色权限。Token 过期后需要通过 Supabase Auth 的 refresh 机制获取新 Token。

### 方式二：API Key（适合服务端/自动化集成）

在 AgentLoom 设置中创建 API Key，通过 `X-Api-Key` 请求头传递：

```
X-Api-Key: al_a1b2c3d4e5f6...
```

API Key 的特点：
- 以 `al_` 为前缀，便于识别
- 使用 SHA-256 hash 存储，平台不保存明文
- 创建时仅显示一次完整密钥，请妥善保存
- 可以随时撤销

::: tip 认证优先级
当请求同时包含 JWT Token 和 API Key 时，系统会优先使用 JWT Token 进行认证。如果 JWT Token 无效，会尝试使用 API Key 作为备选。
:::

## 请求格式

### 请求头

所有 API 请求应包含以下请求头：

| 请求头 | 说明 | 示例 |
|--------|------|------|
| `Content-Type` | 请求体格式 | `application/json` |
| `Authorization` 或 `X-Api-Key` | 认证信息 | 见上方认证方式 |
| `Accept` | 期望的响应格式 | `application/json` |

### 请求体

POST 和 PUT 请求使用 JSON 格式的请求体：

```json
{
  "name": "我的工作流",
  "description": "这是一个示例工作流"
}
```

### 查询参数

GET 请求的过滤、排序和分页通过查询参数传递：

```
GET /api/v1/workflow-definitions?page=1&pageSize=20&search=关键词
```

## 响应格式

### 成功响应

成功的 API 响应通常包含 `data` 字段：

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "我的工作流",
    "createdAt": "2026-03-20T08:00:00.000Z"
  }
}
```

列表接口还包含分页元数据：

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### 错误响应

错误响应包含错误信息：

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

常见错误代码的含义请参考 [错误参考](../troubleshooting/errors) 页面。

## 限流说明

为了保护平台稳定性，API 请求受到以下限流规则约束：

### 默认限流

| 限流规则 | 限制 |
|----------|------|
| 全局请求频率 | 100 次/分钟 |
| 日 API 调用量 | 可由管理员在资源配额中配置 |

### 限流响应头

当接近或触发限流时，响应中会包含以下头信息：

| 响应头 | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 当前时间窗口的请求限制 |
| `X-RateLimit-Remaining` | 剩余可用请求数 |
| `X-RateLimit-Reset` | 限流重置的时间戳 |
| `Retry-After` | 限流触发时，建议等待的秒数 |

### 限流触发

当触发限流时，API 返回 HTTP 429 状态码：

```json
{
  "statusCode": 429,
  "message": "Too Many Requests"
}
```

**处理建议**：
- 实现指数退避重试策略
- 在客户端缓存不经常变化的数据
- 批量操作代替多次单独请求

## SDK 支持

AgentLoom 支持自动生成 TypeScript 和 Python SDK，基于 OpenAPI 3.0 规范。

### TypeScript SDK

```typescript
import { AgentLoomClient } from '@agentloom/sdk';

const client = new AgentLoomClient({
  baseUrl: 'https://agentloom.ling.plus/api/v1',
  apiKey: 'al_your_api_key_here',
});

// 列出工作流
const workflows = await client.workflowDefinitions.list({
  page: 1,
  pageSize: 10,
});

// 触发执行
const execution = await client.workflowDefinitions.run('workflow-id', {
  inputs: { query: 'Hello' },
});
```

### Python SDK

```python
from agentloom import AgentLoomClient

client = AgentLoomClient(
    base_url="https://agentloom.ling.plus/api/v1",
    api_key="al_your_api_key_here",
)

# 列出工作流
workflows = client.workflow_definitions.list(page=1, page_size=10)

# 触发执行
execution = client.workflow_definitions.run(
    "workflow-id",
    inputs={"query": "Hello"},
)
```

## 实时通信

除了 REST API，AgentLoom 还通过 Socket.IO 提供实时事件推送：

| Namespace | 用途 |
|-----------|------|
| `/execution` | 工作流执行状态和节点事件推送 |
| `/agent-conversation` | Agent 对话实时消息推送 |
| `/notification` | 系统通知推送 |
| `/knowledge` | 知识库操作事件推送 |
| `/memory` | Agent 记忆操作事件推送 |

Socket.IO 连接同样需要通过 JWT Token 进行认证。

## 完整 API 规范

以下是 AgentLoom 的完整 OpenAPI 3.0 规范。你可以浏览所有可用的接口、参数和响应格式。

<OASpec />
