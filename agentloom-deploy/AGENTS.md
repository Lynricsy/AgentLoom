# AgentLoom 私有化部署

## 概览

`agentloom-deploy/` 是私有化部署 bundle，提供单机 Docker Compose、Kubernetes Helm Chart、Firecracker node-local sandbox control plane、Nginx 反向代理、备份恢复脚本与 systemd 定时任务。

## 目录结构

```
agentloom-deploy/
├── docker-compose.yml                  # 主 Compose；仅 runtime manager privileged
├── docker/                             # server/worker/studio/docs 镜像
├── firecracker/                        # artifact lock、kernel/rootfs/initramfs、CNI/nft、runtime image
├── sandbox/                            # Firecracker guest 内 Fastify runtime 适配层
├── kubernetes/helm/agentloom/          # singleton runtime StatefulSet + 应用与依赖
├── scripts/
│   ├── generate-firecracker-pki.sh     # manager/client/guest 独立 CA
│   ├── init-db.sh
│   ├── backup-postgres.sh
│   ├── backup-minio.sh
│   └── restore.sh
├── systemd/                            # PostgreSQL / MinIO 备份定时任务
└── README.md                           # operator runbook、cutover、容量与备份责任
```

## Docker Compose 部署

`docker-compose.yml` 的应用服务由 Docker 承载，但 sandbox 隔离边界固定为 Firecracker microVM：

| 服务 | 权限与职责 |
|------|------------|
| `reverse-proxy` / `studio` | 唯一 Web 入口与静态站 |
| `server` / `worker` | 普通 mTLS runtime client；无 Docker socket、KVM、NET_ADMIN、SYS_ADMIN |
| `firecracker-runtime` | singleton privileged control plane；独占 KVM、TUN、cgroup、CNI/nft 与 mutable disk |
| `sandbox-cutover` | `migration` profile 一次性工具；仅 legacy export/rollback/finalize 临时挂载 Docker socket |
| `postgres` / `redis` / `minio` / `qdrant` | 数据依赖 |

runtime manager 的 8443 仅在 internal `app_net` 暴露并强制 TLS 1.3 mTLS。server 与 worker 分别设置 callback base URL，guest remote tool 与 permission callback 经 manager allowlisted relay 返回创建 session 的同一进程。

## Kubernetes 部署

Chart 在 `kubernetes/helm/agentloom/`。`firecracker-runtime` 使用 replicas=1 StatefulSet、RWO state PVC、privileged security context 和 `/dev/kvm`、`/dev/net/tun`、cgroup hostPath；必须通过 nodeSelector 固定到经过预检的唯一 x86_64 Linux 节点。manager Pod 挂载 `agentloom-firecracker-manager-pki`；server/worker 只读挂载不含 guest CA 私钥的 `agentloom-firecracker-client-pki`，worker 的内部 Service 只供 callback relay。

`_helpers.tpl` 保留 BYOD `fail()` 守卫；PG/Redis/MinIO/Qdrant 禁用时必须提供外部连接。runtime state volume 不能多写或跨节点透明漂移。

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
- **Studio 专属**：`VITE_API_BASE_URL`、`VITE_AUTOSAVE_DEBOUNCE_MS`、`VITE_SUPABASE_URL`（默认留空；浏览器回退当前站点 origin，再通过 reverse-proxy `/auth/` 转发到 `supabase-kong`）、`VITE_SUPABASE_ANON_KEY`
- **Supabase 资源调优**：`SUPABASE_AUTH_CPU_LIMIT`、`SUPABASE_AUTH_MEMORY_LIMIT`、`SUPABASE_KONG_CPU_LIMIT`、`SUPABASE_KONG_MEMORY_LIMIT`、`SUPABASE_KONG_HEALTHCHECK_TIMEOUT`、`SUPABASE_KONG_HEALTHCHECK_RETRIES`、`SUPABASE_KONG_HEALTHCHECK_START_PERIOD`
- **运维**：`POSTGRES_BACKUP_RETENTION_DAYS`、`MINIO_BACKUP_RETENTION_DAYS`（默认均为 7）

`envs/` 下提供按职责拆分的三份 example 文件，变量名与根模板一致。

公网部署时，`APP_FRONTEND_URL`、`APP_OAUTH_REDIRECT_URL`、`SUPABASE_GOTRUE_EXTERNAL_URL` 与 `SUPABASE_SITE_URL` 必须改成实际对外域名；否则 OAuth / 邮件跳转仍可能回到 `localhost`。

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

`server-migrator` 与 `init-db.sh` 的 seed 步骤直接依赖 Compose 注入的 `APP_DATABASE_URL`，不要求镜像内额外存在 `.env` 文件。

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

## Firecracker Sandbox

- `firecracker/artifact-lock.json` 固定 Firecracker v1.16.1、kernel、BusyBox 与 Arch OCI digest；`build-artifacts.sh` 清理旧 kernel output、校验所有上游 SHA-256 和 ELF64 x86-64 `vmlinux`，构建 initramfs、2GiB ext4 rootfs、Firecracker/jailer 和静态 `agentloom-guestd`，并生成 runtime 启动时再次验证的 manifest。
- `sandbox/` 是 guest rootfs 内的 Fastify v5 适配层，提供 `/v1/session`、`/v1/prompt` SSE、`/v1/abort`、PTY、workspace archive 与 runtime exec；guest `/etc/resolv.conf` 指向 kernel IP autoconfiguration 的 `/proc/net/pnp`。
- `agentloom-firecracker-runtime` 的 manager 使用官方 jailer、per-VM netns/TAP/CNI、host-veth tc IPv4/MAC/ARP source enforcement、nftables egress、cgroup 资源限制和 per-session ext4 mutable disk；guest kernel 禁用 IPv6。Compose/Helm 仅 manager 加入宿主 PID/cgroup namespace；cold recovery 会在清理 jail/cgroup/PID/netns 全部成功后把 persistent VM 收口为可重启 stopped，任何清理失败都保留 handle 并 fail closed。
- manager API 与 guest API 分属独立 mTLS 信任域。manager 按分配的 guest IP 校验证书 IP SAN，不使用共享 DNS SNI；server/worker 没有 guest bearer token或 CA 私钥；guest callback 只能通过 manager relay 到配置的 server/worker host。Compose 中 manager 独占 `sandbox_egress_net`，应用内部服务仍只使用 internal 网络。
- `sandbox-cutover` 要求 maintenance=true、execution/prompt/queue 全部 drained。export/restore 使用 MinIO archive+manifest checksum；activate 写入 opaque `runtime_handle`；rollback 先从 Firecracker 导出最新写入再回灌 legacy volume；finalize 过 rollback window 后删除 legacy container/volume/object 与 `container_id`。`firecracker/test/cutover-rehearsal.sh` 使用隔离 database/bucket/queue 与真实 KVM 自动验证 fail-closed、rollback 和 finalize。
- 当前 production topology 为单节点 singleton manager。operator 负责 KVM/TUN/cgroup v2、支持内核、SMT deny、guest CIDR 冲突、容量、egress allowlist，以及 runtime state 冷快照；persistent workspace 的权威备份是同步到 MinIO 的 Workspace snapshot。
