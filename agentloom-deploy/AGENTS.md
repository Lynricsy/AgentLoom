# AgentLoom 私有化部署

## 概览

`agentloom-deploy/` 是私有化部署 bundle，提供单机 Docker Compose、Kubernetes Helm Chart、Nginx 反向代理、备份恢复脚本与 systemd 定时任务。目标：让企业在自有基础设施上一键拉起完整 AgentLoom 实例。

## 目录结构

```
agentloom-deploy/
├── .env.template                      # 根环境变量模板（Compose/Helm 共用契约）
├── docker-compose.yml                 # 根 Compose 入口（8 服务）
├── nginx.conf                         # 反向代理配置
├── docker/
│   ├── docker-compose.prod.yml        # Compose 变体（与根 Compose 存在重复）
│   ├── server.Dockerfile              # server/worker 共用镜像
│   └── studio.Dockerfile              # Studio 静态资源镜像（运行时 sed 注入 VITE_*）
├── envs/
│   ├── .env.shared.example            # 共享变量拆分视图
│   ├── .env.server.example            # Server 专属变量
│   └── .env.studio.example            # Studio 专属变量
├── kubernetes/helm/agentloom/         # Helm Chart
│   ├── Chart.yaml
│   ├── values.yaml                    # 默认 values
│   ├── values.private.yaml            # 生产 overlay（2 副本、TLS、大容量 PVC）
│   └── templates/                     # 15 个模板（含 BYOD fail() 守卫的 _helpers.tpl）
├── sandbox/                           # 沙箱容器镜像与 HTTP 适配层
│   ├── build.sh                       # 构建 agentloom/sandbox:latest 镜像
│   ├── Dockerfile                     # archlinux + pi-coding-agent + Fastify HTTP
│   ├── src/                           # Fastify v5 HTTP 适配层（server.ts, acp-adapter.ts, event-stream.ts, extension-factory.ts）
│   └── test/                          # 容器 HTTP 适配层测试
├── scripts/
│   ├── init-db.sh                     # 数据库初始化（Supabase 兼容角色 bootstrap + migrate + seed）
│   ├── backup-postgres.sh             # pg_dump -Fc + sha256 校验 + 结构验证
│   ├── backup-minio.sh               # mc mirror 对象备份
│   └── restore.sh                     # PG + MinIO 恢复（含前置校验与烟雾测试）
├── systemd/                           # 备份定时任务（4 个 unit 文件）
├── backups/                           # 备份输出目录（PG + MinIO）
└── README.md                          # 私有部署手册
```

## Docker Compose 部署

`docker-compose.yml` 定义 8 个服务，共享单一命名网络 `agentloom-private`：

| 服务 | 镜像 | 说明 |
|------|------|------|
| `reverse-proxy` | nginx:1.27-alpine | 唯一对外入口（默认 `:8080`） |
| `studio` | agentloom/studio | 前端静态站，内部监听 `:8080` |
| `server` | agentloom/server | API + Socket.IO + BullMQ |
| `worker` | agentloom/server（同镜像） | 部署拓扑拆分，运行同一 `node dist/src/main.js` |
| `postgres` | postgres:16-alpine | 持久卷 `postgres_data` |
| `redis` | redis:7-alpine | AOF 持久化，requirepass |
| `minio` | minio/minio:latest | 回环绑定 Console `:9001` |
| `qdrant` | qdrant/qdrant:v1.14.0 | 回环绑定 HTTP `:6333` |

Server 与 Worker 使用同一 Docker 镜像、同一启动命令。Worker 不暴露到外网，仅作水平扩展用途。MinIO Console 和 Qdrant HTTP 只绑定 `127.0.0.1`，需 SSH 隧道访问。`reverse-proxy` 的 `nginx.conf` 现通过 Docker embedded DNS（`127.0.0.11`）做运行时上游解析，避免 Compose 重建 `server/studio/docs/supabase-kong` 后因容器换 IP 出现 stale upstream。

## Kubernetes 部署

Chart 路径：`kubernetes/helm/agentloom/`，包含 15 个模板文件。

`_helpers.tpl` 内置 BYOD `fail()` 守卫：当内置依赖（PG/Redis/MinIO/Qdrant）被禁用但未提供外部连接信息时，`helm install` 直接报错。`values.private.yaml` 为生产 overlay：server 2 副本、TLS Ingress、PG 50Gi、MinIO 100Gi。每个依赖通过 `*.enabled` 开关控制是否部署内置实例。

## 备份与恢复

| 脚本 | 工具 | 输出 | 保留策略 |
|------|------|------|----------|
| `backup-postgres.sh` | `pg_dump -Fc` | `.dump` + `.sha256` + `.meta` | 默认 7 天 |
| `backup-minio.sh` | `mc mirror` | 目录快照 + `backup.meta` | 默认 7 天 |

PG 备份完成后自动执行 `pg_restore --list` 结构校验，避免产生不可恢复的假备份。

**恢复流程**（`restore.sh`）：sha256 校验 + `pg_restore --list` 验证 → 停应用服务 → 恢复 PG → `mc mirror --overwrite --remove` 回灌 MinIO → 重启应用 → 烟雾测试（DB 连通 + `/api/v1/health` + `/healthz`）。

**systemd 定时任务**：PG 每小时 `:05` 执行，MinIO 每小时 `:20` 执行，均配置 `Persistent=true`（错过的执行在下次启动时补跑），RPO < 1 小时。Kubernetes 环境不使用这些 systemd timer，需自行配置 CronJob。

## Nginx 反向代理

`nginx.conf` 路由规则：

- `/api/` → `server:3000`（标准 HTTP 代理）
- `/socket.io/` → `server:3000`（WebSocket 升级，`proxy_read_timeout 3600s`）
- `/` → `studio:8080`（前端 SPA）
- `/healthz` → 本地 200 直返

上游均配置 `keepalive 32`，`client_max_body_size 50m`。

## 环境变量

`.env.template` 是根便利模板，按三组划分：

- **共享**：`APP_DEPLOYMENT_MODE`、`APP_DATABASE_URL`、`APP_REDIS_URL`、`APP_MINIO_*`、`APP_QDRANT_URL`
- **Server 专属**：`APP_JWT_SECRET`、`APP_MASTER_ENCRYPTION_KEY`（32 字节 Base64）、`APP_SUPABASE_*`（private 模式可全留空）、`APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY`
- **Studio 专属**：`VITE_API_BASE_URL`、`VITE_AUTOSAVE_DEBOUNCE_MS`
- **Supabase 资源调优**：`SUPABASE_AUTH_CPU_LIMIT`、`SUPABASE_AUTH_MEMORY_LIMIT`、`SUPABASE_KONG_CPU_LIMIT`、`SUPABASE_KONG_MEMORY_LIMIT`、`SUPABASE_KONG_HEALTHCHECK_TIMEOUT`、`SUPABASE_KONG_HEALTHCHECK_RETRIES`、`SUPABASE_KONG_HEALTHCHECK_START_PERIOD`
- **运维**：`POSTGRES_BACKUP_RETENTION_DAYS`、`MINIO_BACKUP_RETENTION_DAYS`（默认均为 7）

`envs/` 下提供按职责拆分的三份 example 文件，变量名与根模板一致。

## 开发环境 Docker Compose 操作手册

所有命令的工作目录为 `agentloom-deploy/`（即 `cd agentloom-deploy`）。

### 前置条件

- `supabase-shared` 外部网络必须存在（由 `docker-compose.supabase.yml` 创建）
- `.env` 文件位于 `agentloom-deploy/.env`（从 `.env.template` 复制并填写）
- Supabase 栈需先启动（主 Compose 的 `postgres` 依赖它）

### 启动顺序

```bash
# 1. 首次：创建外部网络 + 启动 Supabase 栈
cd agentloom-deploy
docker compose -f docker-compose.supabase.yml up -d

# 2. 启动主应用栈（含 DB 初始化）
docker compose up -d

# 3. 首次部署后运行数据库迁移+种子
docker compose run --rm server-migrator sh -c "pnpm db:migrate && pnpm db:seed"
```

### 日常重建与重启

```bash
# 仅前端改动 → 重建 studio 镜像并重启
docker compose build --no-cache studio && docker compose up -d studio

# 仅后端改动 → 重建 server 镜像并重启 server + worker
docker compose build --no-cache server && docker compose up -d server worker

# 前后端都改了 → 重建全部应用镜像并重启
docker compose build --no-cache studio server && docker compose up -d

# 全量重建所有服务（含基础设施镜像拉取）
docker compose up -d --build
```

### 状态查看与日志

```bash
docker compose ps -a           # 查看所有服务状态
docker compose logs -f studio  # 跟踪 studio 日志
docker compose logs -f server  # 跟踪 server 日志
docker compose logs -f worker  # 跟踪 worker 日志
```

### 停止与清理

```bash
docker compose down            # 停止并移除容器（保留卷）
docker compose down -v         # 停止并移除容器+卷（完全重置数据）
```

### 关键文件映射

| 用途 | 文件 |
|------|------|
| 主 Compose 入口 | `agentloom-deploy/docker-compose.yml` |
| Supabase 栈 | `agentloom-deploy/docker-compose.supabase.yml` |
| 环境变量 | `agentloom-deploy/.env`（gitignored，从 `.env.template` 创建） |
| Server Dockerfile | `agentloom-deploy/docker/server.Dockerfile` |
| Studio Dockerfile | `agentloom-deploy/docker/studio.Dockerfile` |
| Docs Dockerfile | `agentloom-deploy/docker/docs.Dockerfile` |
| Nginx 配置 | `agentloom-deploy/nginx.conf` |

### 访问地址

| 服务 | URL |
|------|-----|
| Studio 前端 | `http://localhost:8080` |
| API | `http://localhost:8080/api/v1/` |
| Supabase Kong（Auth 网关） | `http://localhost:8000` |
| MinIO Console | `http://127.0.0.1:9001`（需 SSH 隧道） |
| Qdrant Dashboard | `http://127.0.0.1:6333/dashboard`（需 SSH 隧道） |

### 镜像名称

| 服务 | 镜像 tag |
|------|----------|
| server / worker | `agentloom/server:private-local` |
| studio | `agentloom/studio:private-local` |
| docs | `agentloom/docs:private-local` |

## 注意事项

- `init-db.sh` 在 vanilla PostgreSQL 上预创建 Supabase 兼容角色（`supabase_auth_admin`/`authenticated`/`anon`）、`auth` schema 与最小 `auth.users` 表，满足迁移中的授权与外键约束
- License 验签使用 `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` + RSA-PSS，由 Server 端 `PrivateDeploymentModule` 处理
- Studio 镜像构建时使用 `__VITE_*__` 占位符，容器启动时通过 `/docker-entrypoint.d/40-runtime-env.sh` 执行 `sed` 替换实现运行时环境注入
- Worker 与 Server 是**同一镜像、同一入口**，不存在 worker-only runtime。两者都会启动 BullMQ processors 和 scheduler
- systemd timer 仅适用于单机 Compose 部署；Kubernetes 环境需另行配置 CronJob
- `docker/docker-compose.prod.yml` 与根 `docker-compose.yml` 存在重复，根文件为主入口
- private 模式下 `APP_SUPABASE_*` 三个变量遵循"全空或全填"契约，全空时 Supabase 相关认证链路不可用
- `docker-compose.supabase.yml` 中 `supabase-auth` 与 `supabase-kong` 的资源限制现通过 env 变量控制；当前默认基线为 Auth `1 CPU / 1GiB`、Kong `1 CPU / 1GiB`，Kong healthcheck 为 `kong health`，`timeout=10s`、`retries=10`、`start_period=30s`

## 沙箱容器 (sandbox/)

`sandbox/` 子目录包含独立的 Agent 沙箱容器镜像构建与 HTTP 适配层：

- **镜像**: `agentloom/sandbox:latest`，基于 archlinux，内嵌 `pi-coding-agent` 运行时 + Fastify v5 HTTP 适配层
- **构建**: `bash sandbox/build.sh` 执行 Docker build
- **端点**: `POST /v1/session`（创建会话）、`POST /v1/prompt`（SSE 流式应答）、`POST /v1/abort`（取消）、`GET /health`（健康检查）
- **配置挂载**: Server 通过 `PiConfigGeneratorService` 生成 `settings.json`、`models.json`、`system-prompt.md`，bind-mount 到容器 `/config/`
- **LLM API Key**: 通过容器环境变量注入（ANTHROPIC_API_KEY、OPENAI_API_KEY 等）
- **工具权限**: 仅当 `/v1/prompt` 显式传入 `permissionCallbackUrl` 时，容器才会回调 AgentLoom 请求工具权限，30s 超时默认拒绝；当前普通 Agent 对话主路径默认不启用该链路
- **测试**: `npm test` 运行 Vitest 单元测试（mock session factory，无需真实 pi-coding-agent）
