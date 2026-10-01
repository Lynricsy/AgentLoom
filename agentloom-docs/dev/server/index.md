# 服务端架构概述

AgentLoom 服务端基于 **NestJS v11 + Fastify v5** 构建，采用模块化多租户架构，为前端 Studio、移动端和第三方 API 调用者提供统一的 REST + WebSocket 服务。

## 技术栈

| 层         | 技术选型                  | 说明                                                 |
| ---------- | ------------------------- | ---------------------------------------------------- |
| HTTP 框架  | Fastify v5                | 高性能 HTTP 服务（非 Express）                       |
| 应用框架   | NestJS v11                | 模块化依赖注入                                       |
| ORM        | Drizzle ORM               | 类型安全 SQL 构建器（非 TypeORM）                    |
| 数据库     | PostgreSQL (Supabase)     | 多租户 RLS + 行级安全                                |
| 缓存/队列  | Redis + BullMQ            | 限流、缓存、异步任务队列                             |
| 实时通信   | Socket.IO (Redis Adapter) | `/execution`、`/knowledge`、`/notification`、`/agent-conversation`、`/memory` 命名空间 |
| 向量数据库 | Qdrant                    | 知识库 RAG 语义检索                                  |
| 对象存储   | MinIO                     | 文件、WASM bundle 存储                               |
| 校验       | Zod                       | DTO 校验（非 class-validator）                       |
| 测试       | Vitest + Testcontainers   | 80% 覆盖率阈值                                       |

## 目录结构

```text
agentloom-server/src/
├── common/                    # 全局横切关注点
│   ├── guards/                # AuthGuard, TenantGuard, RolesGuard 等
│   ├── interceptors/          # TenantTransactionInterceptor
│   ├── middleware/             # TenantMiddleware
│   ├── filters/               # AllExceptionsFilter
│   ├── pipes/                 # ZodValidationPipe
│   ├── decorators/            # @CurrentUser, @Roles, @Public 等
│   ├── redis/                 # RedisModule
│   ├── providers/             # tenant-aware-db
│   └── adapters/              # RedisIoAdapter (Socket.IO)
├── database/
│   └── schema/                # Drizzle 表定义
├── modules/                   # 37 个业务模块
│   ├── workflow-definition/   # 工作流定义
│   ├── execution/             # 执行引擎
│   ├── agent/                 # Agent 配置
│   ├── llm/                   # LLM 集成
│   └── ...                    # 见「模块架构」
└── acp-stdio.ts               # ACP stdio 独立入口
```

## 模块分类一览

服务端的 37 个 NestJS 模块按职责划分为 7 个领域：

| 领域                                        | 模块数 | 说明                                     |
| ------------------------------------------- | ------ | ---------------------------------------- |
| [核心工作流](/zh/server/modules#核心工作流) | 4      | 工作流定义、执行引擎、执行记录、可复用块 |
| [AI 服务](/zh/server/modules#ai-服务)       | 5      | Agent、LLM、MCP 工具、智能路由、知识库   |
| [平台服务](/zh/server/modules#平台服务)     | 9      | 认证、组织、通知、模板、分享、市场等     |
| [企业运维](/zh/server/modules#企业运维)     | 6      | 资源治理、监控、审计、优化建议、私有部署 |
| [插件生态](/zh/server/modules#插件生态)     | 1      | WASM 沙箱插件注册与执行                  |
| [ACP 网关](/zh/server/modules#acp-网关)     | 1      | ACP 协议适配与 stdio 网关                |
| [基础设施](/zh/server/modules#基础设施)     | 4      | 沙箱、健康检查、触发器、API Key          |

> 详见 [模块架构](/zh/server/modules) 获取每个模块的完整说明。

## 请求处理链路

每个 HTTP 请求经过 **6 层中间件/守卫链** 处理后到达 Controller：

```text
请求 → TenantMiddleware → TenantTransactionInterceptor → CustomThrottlerGuard
     → AuthGuard → TenantGuard → RolesGuard → Controller
```

全局还有 `AllExceptionsFilter`（统一错误格式）和 `ZodValidationPipe`（DTO 校验）作为横切层。

> 详见 [中间件与守卫链](/zh/server/middleware) 获取完整流程图与实现细节。

## 安全架构

- **端到端加密 (E2EE)**：RSA-4096 公钥管理 + 混合 RSA-OAEP / AES-256-GCM 加密
- **多租户隔离**：PostgreSQL RLS + Drizzle 租户事务 + 请求级租户校验
- **双重认证**：JWT (Supabase) 优先 → API Key (`al_` 前缀) 回退
- **RBAC 角色体系**：`owner > admin > creator > operator > viewer`
- **租户级限流**：100 req/min 默认 + 每日 API 配额 + 资源治理准入

> 详见 [安全与加密](/zh/server/security) 获取 E2EE 流程和 API Token 管理细节。

## 异步任务队列

服务端使用 BullMQ 管理 12 个任务队列：

| 队列                        | 用途                             |
| --------------------------- | -------------------------------- |
| `execution-queue`           | 工作流执行调度                   |
| `agent-task-queue`          | Agent 任务处理                   |
| `plugin-execution`          | 插件 WASM 执行                   |
| `optimization-analysis`     | 周期性 Agent 配置优化分析        |
| `audit-log-retention`       | 审计日志归档                     |
| `trigger-scheduler`         | 定时触发器调度                   |
| `notification`              | 通知分发 (in_app / email / push) |
| `earnings-settlement`       | 插件收益结算                     |
| `sandbox-lifecycle-queue`   | 沙箱生命周期管理                 |
| `document-processing-queue` | 文档处理                         |
| `document-indexing-queue`   | 文档向量化索引                   |
| `agent-conversation-queue`  | Agent 对话任务处理               |

## 实时通信

Socket.IO 使用 Redis Adapter 提供五个命名空间：

- **`/execution`**：工作流执行事件流，typed `ExecutionEvent<T>` 信封 + monotonic `eventId`，支持断线 `lastEventId` 增量回放
- **`/knowledge`**：知识库实时更新
- **`/notification`**：通知推送
- **`/agent-conversation`**：Agent 对话实时事件推送，与 `/execution` 对称，复用 EventBridge 模式
- **`/memory`**：Agent 记忆图谱实时更新

## 开发命令

```bash
pnpm install && pnpm start:dev    # 开发模式 (watch)
pnpm test                          # 单元测试
pnpm test:e2e                     # E2E 测试 (需 Docker)
pnpm test:cov                     # 覆盖率 (80% 阈值)
pnpm db:generate                  # 生成 Drizzle 迁移
pnpm db:migrate                   # 执行迁移
pnpm db:seed                      # 种子数据 (5 个预置模板 + 5 个内置 Skill)
pnpm openapi:export               # 导出 OpenAPI 3.0 spec
```
