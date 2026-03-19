# AgentLoom 私有部署资产

这套 `agentloom-deploy/` 目录是当前仓库现实下的私有部署 bundle，覆盖 Docker Compose、Nginx、Helm、环境变量模板，以及 PostgreSQL / MinIO 的备份恢复脚本。它只描述**当前代码已经支持**的部署方式，不假设未来才会出现的 worker-only 入口、独立 API runtime，或额外的运维平台能力。

> 关键现实约束：`agentloom-server` 当前只有 `start:prod = node dist/main`，而 `main.ts` 会启动完整的 Nest runtime（HTTP + Socket.IO + BullMQ processors + 启动期 scheduler）。因此这里保留了 `server(api)` 和 `worker` 两个部署单元，但它们**复用同一镜像、同一启动命令**，只是部署拓扑拆分，**不是运行职责隔离**。当前 `server` 和 `worker` 都会处理队列；对外暴露只由 Nginx / Ingress 指向 `server`。

## 目录说明

```text
agentloom-deploy/
├── .env.template                         # 一份可直接复制的根环境模板
├── docker-compose.yml                    # 根私有部署 Compose 入口
├── nginx.conf                            # Compose 反向代理配置
├── docker/
│   ├── docker-compose.prod.yml           # 供 deploy 目录内引用的 Compose 变体
│   ├── server.Dockerfile                 # server/worker 共用镜像
│   └── studio.Dockerfile                 # studio 静态资源镜像（支持运行时注入 VITE_*）
├── envs/
│   ├── .env.shared.example               # shared env contract
│   ├── .env.server.example               # server-only env contract
│   └── .env.studio.example               # studio-only env contract
├── kubernetes/helm/agentloom/            # 私有部署 Helm chart
└── scripts/
    ├── init-db.sh                        # 用 server 镜像执行 migrate/seed
    ├── backup-postgres.sh                # pg_dump -Fc
    ├── backup-minio.sh                   # mc mirror 备份 bucket
    └── restore.sh                        # PostgreSQL + MinIO 恢复与烟雾检查
```

## 环境变量合同

### 1. 根便利模板

直接复制：

```bash
cp agentloom-deploy/.env.template agentloom-deploy/.env
```

`agentloom-deploy/.env.template` 汇总了 Compose 与 Helm 共享的环境合同，变量名和应用真实代码对齐，包括：

- shared：`APP_DEPLOYMENT_MODE`、`APP_DATABASE_URL`、`APP_REDIS_URL`、`APP_MINIO_*`、`APP_QDRANT_URL`
- server：`APP_JWT_SECRET`、`APP_MASTER_ENCRYPTION_KEY`、`APP_SUPABASE_*`、`APP_FRONTEND_URL`、`APP_OAUTH_REDIRECT_URL`
- studio：`VITE_API_BASE_URL`、`VITE_AUTOSAVE_DEBOUNCE_MS`

### 2. 拆分模板

如果你希望按职责管理变量，可参考：

- `envs/.env.shared.example`
- `envs/.env.server.example`
- `envs/.env.studio.example`

这些文件和 `.env.template` 使用**同名变量**，只是拆分视图不同，方便后续接入私有密管或生成 Helm values。

### 3. private 模式下的 Supabase 语义

当前后端已经实现：

- `APP_DEPLOYMENT_MODE=private` 时，`APP_SUPABASE_URL` / `APP_SUPABASE_ANON_KEY` / `APP_SUPABASE_SERVICE_KEY` 可以**全部留空**
- 但如果提供，就必须**三个一起提供**
- 若三者全部留空，应用仍可启动；只是依赖 Supabase 的认证链路会在调用时返回不可用错误，而不是在启动阶段假装正常

## Compose 拓扑

`agentloom-deploy/docker-compose.yml` 会启动这些服务：

- `reverse-proxy`：唯一对外入口，转发 `/api/`、`/socket.io/` 到 `server`，其余路径到 `studio`
- `studio`：前端静态站点，默认使用 `VITE_API_BASE_URL=/api/v1`
- `server`：对外 API / Socket.IO 暴露点，同时也会处理队列
- `worker`：内部-only 部署单元，**仍然运行完整的 `node dist/main`**，并非 worker-only 进程
- `postgres`
- `redis`
- `minio`
- `qdrant`

### 默认暴露端口

- `8080` → Nginx / 统一入口（可通过 `NGINX_HTTP_PORT` 改）
- `127.0.0.1:9001` → MinIO Console（可通过 `MINIO_CONSOLE_PORT` 改）
- `127.0.0.1:6333` → Qdrant HTTP（可通过 `QDRANT_HTTP_PORT` 改）

### 健康检查

- 应用健康：`GET /api/v1/health`，返回 `{ status: 'ok', timestamp }`
- 反向代理健康：`GET /healthz`
- Compose 中还对 PostgreSQL、Redis、MinIO、Studio、Server/Worker 加了容器级 healthcheck

## Compose 快速启动

### 1. 准备环境变量

```bash
cp agentloom-deploy/.env.template agentloom-deploy/.env
```

至少要替换这些敏感值：

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `APP_MINIO_SECRET_KEY`
- `APP_JWT_SECRET`
- `APP_MASTER_ENCRYPTION_KEY`

其中 `APP_MASTER_ENCRYPTION_KEY` 必须是 **32 字节 Base64**，例如：

```bash
openssl rand -base64 32
```

### 2. 初始化数据库

```bash
./agentloom-deploy/scripts/init-db.sh
```

这个脚本会：

1. 读取 `agentloom-deploy/.env`
2. 构建 `server` 镜像
3. 启动 `postgres`
4. 在 vanilla PostgreSQL 上预先创建 Supabase 兼容角色（`supabase_auth_admin`、`authenticated`、`anon`）、`auth` schema 与最小 `auth.users` 表，以满足迁移中的授权与外键约束
5. 使用 **同一份 server 镜像** 执行 `pnpm db:migrate`
6. 当 `RUN_DB_SEED=true` 时追加执行 `pnpm db:seed`

> 之所以要先 bootstrap 这些角色与 `auth.users`，是因为当前应用迁移既会引用 `auth.users(id)`，也会向 `supabase_auth_admin` / `authenticated` 授权；而私有化部署默认使用的是普通 PostgreSQL，而不是已经预置这些角色与 schema 的 Supabase 托管实例。

### 3. 启动全栈

```bash
docker compose \
  -f agentloom-deploy/docker-compose.yml \
  --env-file agentloom-deploy/.env \
  up -d --build
```

### 4. 验证

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/health
```

> `StorageService` 会在应用启动时自动创建缺失的 MinIO bucket，所以这套部署脚本**不需要额外的 bucket bootstrap 步骤**。

## 备份与恢复

### PostgreSQL 备份

```bash
./agentloom-deploy/scripts/backup-postgres.sh
```

- 输出目录默认：`agentloom-deploy/backups/postgres/`
- 输出格式：`pg_dump -Fc` 自定义归档，可直接给 `pg_restore` 使用

### MinIO 备份

```bash
./agentloom-deploy/scripts/backup-minio.sh
```

- 输出目录默认：`agentloom-deploy/backups/minio/`
- 使用 `mc mirror` 拉取 `APP_MINIO_BUCKET`

### 恢复

```bash
./agentloom-deploy/scripts/restore.sh \
  --postgres-dump agentloom-deploy/backups/postgres/agentloom-postgres-YYYYmmdd-HHMMSS.dump \
  --minio-dir agentloom-deploy/backups/minio/agentloom-minio-YYYYmmdd-HHMMSS
```

恢复脚本会：

1. 停掉 `reverse-proxy` / `studio` / `server` / `worker`
2. 启动 `postgres` 与 `minio`
3. 恢复 PostgreSQL dump
4. 使用 `mc mirror --overwrite --remove` 回灌 MinIO bucket
5. 重新拉起应用栈
6. 做基本烟雾检查：数据库连通性、`/api/v1/health`、Nginx `/healthz`

## Helm Chart

Chart 路径：`agentloom-deploy/kubernetes/helm/agentloom`

它覆盖：

- `server` Deployment + Service + 可选 HPA
- `worker` Deployment + 可选 HPA
- `studio` Deployment + Service + 可选 HPA
- `Ingress`（把 `/api` 与 `/socket.io` 指向 `server`，`/` 指向 `studio`）
- PostgreSQL / Redis / MinIO / Qdrant 的可选内置依赖
- PVC、ConfigMap、Secret

### 推荐私有部署样例

```bash
helm upgrade --install agentloom \
  agentloom-deploy/kubernetes/helm/agentloom \
  -f agentloom-deploy/kubernetes/helm/agentloom/values.private.yaml
```

### BYOD / 外部依赖

如果你要接入外部 PostgreSQL、Redis、MinIO、Qdrant：

1. 把对应的 `*.enabled` 设为 `false`
2. 在 `env.shared` 中显式填写真实的：
   - `APP_DATABASE_URL`
   - `APP_REDIS_URL`
   - `APP_MINIO_ENDPOINT`
   - `APP_MINIO_PORT`
   - `APP_MINIO_ACCESS_KEY`
   - `APP_MINIO_SECRET_KEY`
   - `APP_QDRANT_URL`

这样 Compose 与 Helm 依然维持**同一套应用 env contract**。

## 当前部署 caveats

1. **不存在 worker-only runtime。** 当前 `worker` 只是独立 Deployment / Compose service，实际仍然运行完整的 `node dist/main`。
2. **`server` 也会消费队列。** 即使只把对外流量指向 `server`，它仍会启动 BullMQ processors 和启动期 scheduler。
3. **`worker` 不应暴露到外网。** 这套资产只通过 Nginx / Ingress 暴露 `server`。
4. **认证能力取决于 Supabase 配置。** private 模式允许空配，但空配不代表 Supabase 相关登录能力可用。

这几个 caveat 需要继续保留到后续 story / 运维文档阶段，直到仓库真正出现独立的 runtime role split 为止。
