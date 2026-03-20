# 部署运维

AgentLoom 支持多种部署模式，适用于从开发调试到企业级生产的不同场景。

## 部署模式

| 模式                        | 适用场景           | 复杂度        |
| --------------------------- | ------------------ | ------------- |
| [Docker Compose](./docker)  | 单机部署、小团队   | ⭐ 低         |
| [Kubernetes / Helm](./helm) | 集群部署、弹性伸缩 | ⭐⭐⭐ 高     |
| 裸机部署                    | 特殊合规要求       | ⭐⭐⭐⭐ 极高 |

::: tip 推荐
对于大多数私有化部署场景，**Docker Compose** 模式是最佳起步方案 — 快速、可预测、运维简单。
:::

## 基础设施要求

### 最低配置

| 资源     | 要求                                    |
| -------- | --------------------------------------- |
| CPU      | 4 vCPU                                  |
| 内存     | 8 GiB                                   |
| 磁盘     | 100 GiB SSD                             |
| 操作系统 | Linux (推荐 Ubuntu 22.04+ / Debian 12+) |
| Docker   | 24.0+ (含 Compose V2)                   |

### 推荐生产配置

| 资源 | 要求              |
| ---- | ----------------- |
| CPU  | 8+ vCPU           |
| 内存 | 16+ GiB           |
| 磁盘 | 200+ GiB NVMe SSD |
| 网络 | 内网带宽 ≥ 1 Gbps |

## 服务架构

AgentLoom 私有化部署包含 8 个核心服务：

```mermaid
graph TD
    Client([客户端]) --> NX[Nginx 反向代理<br/>端口 8080]

    NX -->|"/ (前端)"| ST[Studio 前端<br/>Nginx + SPA]
    NX -->|"/api/ & /socket.io/"| SV[Server API<br/>NestJS + Fastify]

    SV --> PG[(PostgreSQL 16)]
    SV --> RD[(Redis 7)]
    SV --> MN[(MinIO 对象存储)]
    SV --> QD[(Qdrant 向量库)]

    WK[Worker 后台任务] --> PG
    WK --> RD
    WK --> MN
    WK --> QD

    style NX fill:#e1f5fe
    style ST fill:#f3e5f5
    style SV fill:#e8f5e9
    style WK fill:#fff3e0
```

### 服务说明

| 服务              | 镜像                    | 说明                               |
| ----------------- | ----------------------- | ---------------------------------- |
| **reverse-proxy** | `nginx:1.27-alpine`     | 反向代理，统一入口                 |
| **studio**        | `agentloom/studio`      | React 前端，Nginx 托管 SPA         |
| **server**        | `agentloom/server`      | NestJS API 服务                    |
| **worker**        | `agentloom/server`      | 后台任务处理（与 server 共享镜像） |
| **postgres**      | `postgres:16-alpine`    | 主数据库                           |
| **redis**         | `redis:7-alpine`        | 缓存与消息队列 (BullMQ)            |
| **minio**         | `minio/minio:latest`    | S3 兼容对象存储                    |
| **qdrant**        | `qdrant/qdrant:v1.14.0` | 向量数据库（知识库 RAG）           |

::: info Server 与 Worker 的关系
Server 和 Worker 使用**完全相同的 Docker 镜像和启动命令**，仅通过拓扑分离实现职责划分。这种设计简化了构建流程并确保代码一致性。
:::

## 环境配置模板

AgentLoom 提供 `.env.template` 模板文件（75 行），分为 4 个配置区域：

### 1. 基础设置

```bash
# 对外暴露端口
EXPOSE_PORT=8080

# 镜像标签
SERVER_IMAGE=agentloom/server:latest
STUDIO_IMAGE=agentloom/studio:latest
```

### 2. 共享基础设施

```bash
# PostgreSQL
POSTGRES_USER=agentloom
POSTGRES_PASSWORD=<你的数据库密码>
POSTGRES_DB=agentloom
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}

# Redis
REDIS_PASSWORD=<你的 Redis 密码>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

# MinIO
MINIO_ROOT_USER=agentloom
MINIO_ROOT_PASSWORD=<你的 MinIO 密码>
MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=agentloom

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=<你的 Qdrant API Key>
```

### 3. Server 专用配置

```bash
# JWT 与加密
JWT_SECRET=<你的 JWT 密钥>
ENCRYPTION_KEY=<你的加密密钥>

# Supabase (可选，私有部署可全部留空)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 私有部署 License
APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY=<RSA 公钥>
```

### 4. Studio 前端配置

```bash
# 运行时注入的环境变量
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

::: warning Supabase 配置约束
私有部署模式下，Supabase 相关配置要么**全部提供**，要么**全部留空**。不支持部分配置。
:::

## 运维文档导航

| 文档                             | 内容                           |
| -------------------------------- | ------------------------------ |
| [Docker Compose 部署](./docker)  | 完整的 Docker Compose 部署指南 |
| [Kubernetes / Helm 部署](./helm) | Helm Chart 安装与配置          |
| [备份与恢复](./backup)           | 数据备份策略与灾难恢复         |
| [Nginx 文档站托管](./nginx)      | VitePress 文档站的 Nginx 配置  |

## 相关管理功能

在 AgentLoom Studio 中，以下管理页面与私有部署密切相关：

- **私有部署设置** (`/settings/private-deployment`) — SMTP、LLM 代理、证书、License 配置
- **资源配额** (`/settings/resource-quotas`) — 并发执行、API 限流、存储预算
- **运行监控** (`/settings/monitoring`) — 执行状态、治理策略、通知概览
- **审计日志** (`/settings/audit-logs`) — 操作审计与归档管理
