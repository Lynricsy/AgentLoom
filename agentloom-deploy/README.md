# AgentLoom 私有部署资产

这套 `agentloom-deploy/` 目录是当前仓库现实下的私有部署 bundle，覆盖 Docker Compose、Nginx、Helm、环境变量模板，以及 PostgreSQL / MinIO 的备份恢复脚本。它只描述**当前代码已经支持**的部署方式，不假设未来才会出现的 worker-only 入口、独立 API runtime，或额外的运维平台能力。

> 关键现实约束：`agentloom-server` 当前只有 `start:prod = node dist/src/main.js`，而 `main.ts` 会启动完整的 Nest runtime（HTTP + Socket.IO + BullMQ processors + 启动期 scheduler）。因此这里保留了 `server(api)` 和 `worker` 两个部署单元，但它们**复用同一镜像、同一启动命令**，只是部署拓扑拆分，**不是运行职责隔离**。当前 `server` 和 `worker` 都会处理队列；对外暴露只由 Nginx / Ingress 指向 `server`。

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
- server：`APP_JWT_SECRET`、`APP_MASTER_ENCRYPTION_KEY`、`APP_SUPABASE_*`、`APP_FRONTEND_URL`、`APP_OAUTH_REDIRECT_URL`、`HOST_DOCKER_GID`
- studio：`VITE_API_BASE_URL`、`VITE_AUTOSAVE_DEBOUNCE_MS`
- 运维自动化：`POSTGRES_BACKUP_RETENTION_DAYS`、`MINIO_BACKUP_RETENTION_DAYS`

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

- `reverse-proxy`：唯一对外入口，转发 `/api/`、`/socket.io/` 到 `server`，`/auth/` 到 `supabase-kong`，其余路径到 `studio`
- `studio`：前端静态站点，默认使用 `VITE_API_BASE_URL=/api/v1`
- `server`：对外 API / Socket.IO 暴露点，同时也会处理队列
- `worker`：内部-only 部署单元，**仍然运行完整的 `node dist/src/main.js`**，并非 worker-only 进程
- `postgres`
- `redis`
- `minio`
- `qdrant`

### 单机部署资源与网络基线

- 最小建议：4 vCPU / 8 GiB RAM / 100 GiB SSD；若要在同一主机上同时保留 7 天 PostgreSQL + MinIO 备份，建议预留额外 100 GiB 以上备份盘空间。
- `reverse-proxy` 当前使用 Docker embedded DNS（`127.0.0.11`）做运行时上游解析，避免 `server` / `studio` / `docs` / `supabase-kong` 在 Compose 重建后换 IP 时，Nginx 继续把流量打到旧容器地址。
- 对外只暴露 `NGINX_HTTP_PORT`（默认 `8080`）；MinIO Console（默认 `127.0.0.1:9001`）与 Qdrant HTTP（默认 `127.0.0.1:6333`）只绑定回环地址，供运维跳板机或 SSH 隧道使用。
- 如需正式域名 / TLS，优先在外层 LB 或反向代理终止 TLS，并把 `APP_FRONTEND_URL`、`APP_OAUTH_REDIRECT_URL` 与 `PUBLIC_BASE_URL` 改成企业域名；若直接使用当前 `nginx.conf`，则应在进入生产前替换为带证书的企业反向代理配置。

### 默认暴露端口

- `8080` → Nginx / 统一入口（可通过 `NGINX_HTTP_PORT` 改）
- `127.0.0.1:9001` → MinIO Console（可通过 `MINIO_CONSOLE_PORT` 改）
- `127.0.0.1:6333` → Qdrant HTTP（可通过 `QDRANT_HTTP_PORT` 改）

### 健康检查

- 应用健康：`GET /api/v1/health`，返回 `{ status: 'ok', timestamp }`
- 反向代理健康：`GET /healthz`
- Compose 中还对 PostgreSQL、Redis、MinIO、Studio、Server/Worker 加了容器级 healthcheck
- 使用 `docker-compose.supabase.yml` 时，`supabase-auth` 与 `supabase-kong` 也带容器级 healthcheck；当前默认基线为 Auth `1 CPU / 1 GiB`、Kong `1 CPU / 1 GiB`，并把 `kong health` timeout 放宽到 `10s`

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

此外，当前沙箱生命周期会由 `server` / `worker` 直接通过宿主 Docker daemon 拉起 `agentloom/sandbox:latest`，因此 `.env` 里还需要设置：

- `HOST_DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)`

如果自托管 Supabase 需要承受更高认证流量，或宿主资源充足，也可以在 `.env` 中继续调大：

- `SUPABASE_AUTH_CPU_LIMIT`
- `SUPABASE_AUTH_MEMORY_LIMIT`
- `SUPABASE_KONG_CPU_LIMIT`
- `SUPABASE_KONG_MEMORY_LIMIT`
- `SUPABASE_KONG_HEALTHCHECK_TIMEOUT`
- `SUPABASE_KONG_HEALTHCHECK_RETRIES`
- `SUPABASE_KONG_HEALTHCHECK_START_PERIOD`

其中 `APP_MASTER_ENCRYPTION_KEY` 必须是 **32 字节 Base64**，例如：

```bash
openssl rand -base64 32
```

如果宿主机没有 Docker socket，或 socket 的 group id 没有正确映射到 `HOST_DOCKER_GID`，`POST /api/v1/sandboxes` 会先返回 `201`，随后在异步 `sandbox-lifecycle` worker 中因无法连接 `/var/run/docker.sock` 而把 session 置为 `failed`。

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

此外，`init-db.sh` 在发现 `agentloom-deploy/docker/.pi-tarballs` 缺失时，会自动调用 `agentloom-deploy/scripts/prepare-pi-tarballs.sh`。该脚本默认从 `https://github.com/badlogic/pi-mono` 拉取源码并构建 tarballs，因此 server/worker 的 Docker 构建不再依赖宿主机预先准备固定的 `pi-mono` 工作树。

### 3. 启动全栈

在首次启动全栈前，先准备 sandbox runtime 镜像：

```bash
bash agentloom-deploy/sandbox/build.sh
```

这一步会先调用共享的 `agentloom-deploy/scripts/prepare-pi-tarballs.sh`，再在宿主机上构建 `agentloom/sandbox:latest`。当前 `server` / `worker` 只负责通过 Docker daemon 拉起该镜像，并不会在 `docker compose up` 时自动帮你构建它。

默认行为：

- 从 `https://github.com/badlogic/pi-mono` 拉取源码
- 默认锁定 `PI_MONO_REF=576e5e1a2fbe1abbbad96b696f4058cffd8391ca`
- 生成 4 个 tarball：`pi-tui.tgz`、`pi-ai.tgz`、`pi-agent-core.tgz`、`pi-coding-agent.tgz`
- 同时发布到 `agentloom-deploy/docker/.pi-tarballs` 与 `agentloom-deploy/sandbox/.pi-tarballs`

如果你想覆盖默认来源，可以显式指定：

- 使用本地 checkout：`PI_MONO_DIR=/your/path/to/pi-mono`
- 升级/回退到其它提交、tag 或分支：`PI_MONO_REF=<commit|tag|branch>`
- 切换上游仓库：`PI_MONO_REPO_URL=<git-url>`

例如：

```bash
PI_MONO_DIR=/your/path/to/pi-mono bash agentloom-deploy/sandbox/build.sh
```

```bash
PI_MONO_REF=main bash agentloom-deploy/sandbox/build.sh
```

如果你只想预热 tarballs，而暂时不构建 sandbox 镜像，可单独执行：

```bash
./agentloom-deploy/scripts/prepare-pi-tarballs.sh
```

```bash
docker compose \
  -f agentloom-deploy/docker-compose.yml \
  --env-file agentloom-deploy/.env \
  up -d --build
```

### 3.1 首次部署耗时记录与 smoke-test

为满足 NFR29，建议在干净主机上把初始化与首次起栈耗时都记录下来：

```bash
time ./agentloom-deploy/scripts/init-db.sh

time ./agentloom-deploy/scripts/prepare-pi-tarballs.sh

time docker build -t agentloom/sandbox:latest agentloom-deploy/sandbox

time docker compose \
  -f agentloom-deploy/docker-compose.yml \
  --env-file agentloom-deploy/.env \
  up -d --build

docker compose \
  -f agentloom-deploy/docker-compose.yml \
  --env-file agentloom-deploy/.env \
  ps
```

验收要点：

- `postgres`、`redis`、`minio`、`qdrant`、`server`、`worker`、`studio`、`reverse-proxy` 全部为 `running`，且需要 healthcheck 的服务进入 `healthy`。
- `curl http://localhost:8080/healthz` 与 `curl http://localhost:8080/api/v1/health` 返回成功。
- `cat agentloom-deploy/docker/.pi-tarballs/pi-mono-source.txt` 与 `cat agentloom-deploy/sandbox/.pi-tarballs/pi-mono-source.txt` 都能看到一致的 `resolved_commit`。
- `docker image inspect agentloom/sandbox:latest` 成功，且 `docker compose exec -T server sh -c 'ls -l /var/run/docker.sock && id'` 能看到挂载后的 Docker socket 与补充 group。
- 首次从 `.env.template` 到 `docker compose up -d --build` 的总耗时应记录在交付单中；若明显超过 30 分钟，优先检查镜像缓存、主机磁盘性能与企业代理下载带宽。

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
- 文件命名：`agentloom-postgres-YYYYmmdd-HHMMSS.dump`
- 输出格式：`pg_dump -Fc` 自定义归档，可直接给 `pg_restore` 使用
- 压缩 / 校验：`-Fc` 归档自带压缩；脚本额外生成 `*.sha256` 校验和与 `*.meta` 元数据文件
- 保留策略：默认按 `POSTGRES_BACKUP_RETENTION_DAYS=7` 清理过期 dump / sha256 / meta，可在 `.env` 中覆盖
- 脚本完成后会执行一次 `pg_restore --list` 结构校验，避免生成“有文件但不可恢复”的假备份
- 单次恢复命令参考：`./agentloom-deploy/scripts/restore.sh --postgres-dump <dump-file> --minio-dir <minio-backup-dir>`

### MinIO 备份

```bash
./agentloom-deploy/scripts/backup-minio.sh
```

- 输出目录默认：`agentloom-deploy/backups/minio/`
- 文件命名：`agentloom-minio-YYYYmmdd-HHMMSS/`
- 使用 `mc mirror` 拉取 `APP_MINIO_BUCKET` 到同名子目录，并生成 `backup.meta`
- 当 `APP_MINIO_USE_SSL=true` 时，脚本会自动切换到 `https://<APP_MINIO_ENDPOINT>:<APP_MINIO_PORT>` 作为 `mc` 连接端点
- 保留策略：默认按 `MINIO_BACKUP_RETENTION_DAYS=7` 清理过期镜像目录，可在 `.env` 中覆盖
- 恢复顺序：先恢复 PostgreSQL，再恢复 MinIO bucket，最后重新拉起 `server` / `worker` / `studio` / `reverse-proxy`

### 每小时调度资产（Compose / 单机）

首版 bundle 为单机 / Docker Compose 路径提供正式 `systemd` 定时资产，位于：

- `agentloom-deploy/systemd/agentloom-backup-postgres.service`
- `agentloom-deploy/systemd/agentloom-backup-postgres.timer`
- `agentloom-deploy/systemd/agentloom-backup-minio.service`
- `agentloom-deploy/systemd/agentloom-backup-minio.timer`

默认调度：

- PostgreSQL：每小时 `:05` 执行一次逻辑备份
- MinIO：每小时 `:20` 执行一次对象镜像备份

安装示例：

```bash
sudo cp agentloom-deploy/systemd/agentloom-backup-*.service /etc/systemd/system/
sudo cp agentloom-deploy/systemd/agentloom-backup-*.timer /etc/systemd/system/

# 如果部署目录不是 /opt/agentloom/agentloom-deploy，请先执行：
sudo systemctl edit agentloom-backup-postgres.service
sudo systemctl edit agentloom-backup-minio.service

sudo systemctl daemon-reload
sudo systemctl enable --now agentloom-backup-postgres.timer agentloom-backup-minio.timer
systemctl list-timers 'agentloom-backup-*'
```

`systemctl edit` 推荐覆盖的内容：

```ini
[Service]
Environment=AGENTLOOM_DEPLOY_DIR=/your/path/to/agentloom-deploy
```

这条路径满足 AC3 的“正式调度资产”要求：PostgreSQL 与 MinIO 都有可启用、可审计、可重启补跑（`Persistent=true`）的小时级备份计划，从而让 `RPO < 1h` 具备明确执行路径。

### 恢复

```bash
./agentloom-deploy/scripts/restore.sh \
  --postgres-dump agentloom-deploy/backups/postgres/agentloom-postgres-YYYYmmdd-HHMMSS.dump \
  --minio-dir agentloom-deploy/backups/minio/agentloom-minio-YYYYmmdd-HHMMSS
```

恢复脚本会：

1. 先做恢复前校验：
   - 若存在 `*.sha256`，先校验 PostgreSQL dump 校验和
   - 使用 `pg_restore --list` 验证 dump 结构可读
   - 检查 MinIO 备份目录中是否存在目标 bucket 快照
2. 停掉 `reverse-proxy` / `studio` / `server` / `worker`
3. 启动 `postgres` 与 `minio`
4. 恢复 PostgreSQL dump
5. 使用 `mc mirror --overwrite --remove` 回灌 MinIO bucket，并与 `backup-minio.sh` 一样遵循 `APP_MINIO_USE_SSL` 切换 `http/https` 端点
6. 重新拉起应用栈
7. 做基本烟雾检查：数据库连通性、`/api/v1/health`、Nginx `/healthz`

### 恢复演练 Runbook（RPO / RTO 证明路径）

每次正式交付前都应在演练环境跑一遍下面的恢复流程，并记录 wall-clock：

1. 确认最近一次 PostgreSQL dump 与最近一次 MinIO 镜像目录都在 1 小时内生成。
2. 记录开始时间，执行：

   ```bash
   ./agentloom-deploy/scripts/restore.sh \
     --postgres-dump <latest-postgres-dump> \
     --minio-dir <latest-minio-backup-dir>
   ```

3. 记录结束时间，并补充：
   - `docker compose ... ps`
   - `curl http://localhost:8080/healthz`
   - `curl http://localhost:8080/api/v1/health`
4. 若恢复总时长超过 4 小时，优先分析磁盘吞吐、对象存储体量、数据库大小与企业网络带宽；若最近备份超过 1 小时，则说明调度器未达成 `RPO < 1h`。

这份 runbook 是当前 bundle 的正式恢复演练文档：它把“备份存在”进一步收敛为“备份可校验、可恢复、可量化地满足 NFR23 的路径”。

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

1. **不存在 worker-only runtime。** 当前 `worker` 只是独立 Deployment / Compose service，实际仍然运行完整的 `node dist/src/main.js`。
2. **`server` 也会消费队列。** 即使只把对外流量指向 `server`，它仍会启动 BullMQ processors 和启动期 scheduler。
3. **`worker` 不应暴露到外网。** 这套资产只通过 Nginx / Ingress 暴露 `server`。
4. **认证能力取决于 Supabase 配置。** private 模式允许空配，但空配不代表 Supabase 相关登录能力可用。
5. **沙箱依赖宿主 Docker daemon。** 当前 Compose 路径下，`server` 和 `worker` 需要挂载 `/var/run/docker.sock`，并通过 `HOST_DOCKER_GID` 获得访问权限；同时宿主机必须预先构建 `agentloom/sandbox:latest`。

这几个 caveat 需要继续保留到后续 story / 运维文档阶段，直到仓库真正出现独立的 runtime role split 为止。
