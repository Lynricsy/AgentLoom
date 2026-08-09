# AgentLoom 私有部署资产

这套 `agentloom-deploy/` 目录覆盖 Docker Compose、Nginx、Helm、Firecracker runtime manager、环境变量模板，以及 PostgreSQL / MinIO 的备份恢复脚本。Docker 只承载部署服务；sandbox 隔离边界固定为 Firecracker microVM。

`server` 和 `worker` 复用同一 Nest 镜像和启动命令，但都只是 mTLS runtime client。两者不挂载 Docker socket、不访问 `/dev/kvm`，也不管理 TAP、network namespace 或 cgroup；这些权限只属于 singleton `firecracker-runtime`。

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
├── firecracker/                          # 可复现 kernel/rootfs/Firecracker 构建与网络模板
├── kubernetes/helm/agentloom/            # 含 singleton runtime manager 的私有部署 Helm chart
└── scripts/
    ├── generate-firecracker-pki.sh       # 生成 manager/client/guest 三个 mTLS 信任域
    ├── init-db.sh                        # 用 server 镜像执行 migrate/seed
    ├── backup-postgres.sh                # pg_dump -Fc
    ├── backup-minio.sh                    # mc mirror 备份 bucket
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
- Firecracker：`FIRECRACKER_MAX_*`、`FIRECRACKER_GUEST_CIDR`、`FIRECRACKER_SMT_POLICY`、`APP_SANDBOX_MAINTENANCE_MODE`
- studio：`VITE_API_BASE_URL`、`VITE_AUTOSAVE_DEBOUNCE_MS`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- 运维自动化：`POSTGRES_BACKUP_RETENTION_DAYS`、`MINIO_BACKUP_RETENTION_DAYS`

其中 `VITE_SUPABASE_URL` 在私有部署里默认建议留空；Studio 会在运行时回退到当前站点 origin，并通过反向代理的 `/auth/*` 访问 Supabase Auth。这样公网或局域网访问不会把登录请求误打到访问者自己的 `localhost`。

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
- 公网部署时，`APP_FRONTEND_URL`、`APP_OAUTH_REDIRECT_URL`、`SUPABASE_GOTRUE_EXTERNAL_URL` 与 `SUPABASE_SITE_URL` 必须改成实际对外域名；否则 OAuth / 邮件跳转仍可能落到 `localhost`

## Compose 拓扑

`agentloom-deploy/docker-compose.yml` 会启动这些服务：

- `reverse-proxy`：唯一对外入口，转发 `/api/`、`/socket.io/` 到 `server`，`/auth/` 到 `supabase-kong`，其余路径到 `studio`
- `studio`：前端静态站点，默认使用 `VITE_API_BASE_URL=/api/v1`
- `server`：对外 API / Socket.IO 暴露点，同时也会处理队列
- `worker`：内部-only 部署单元，**仍然运行完整的 `node dist/src/main.js`**，并非 worker-only 进程
- `firecracker-runtime`：唯一具备 KVM、TUN、cgroup 与网络管理权限的 node-local control plane；为每个 sandbox 创建独立 microVM，并通过 mTLS guest proxy 提供 prompt、文件、PTY 和 exec 能力
- `postgres`
- `redis`
- `minio`
- `qdrant`：向量数据库，默认镜像 `qdrant/qdrant:v1.17.0`，与服务端当前使用的 Qdrant JS client 1.17.x 保持兼容

### 单节点资源、内核与网络基线

- 当前 Compose 与 Helm 都只支持 **一个 runtime manager 节点**。不能把同一个 runtime state volume 同时挂到多个 manager，也不能把 server/worker 横向扩容误认为 sandbox control plane 高可用。
- 宿主必须是 Linux x86_64，启用硬件虚拟化并暴露 `/dev/kvm`、`/dev/net/tun`、cgroup v2 和 nftables；内核必须位于 Firecracker v1.16.1 官方支持范围。生产环境保持 `FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL=false`，SMT 默认 `deny`。
- 容量由 `FIRECRACKER_MAX_VMS`、`FIRECRACKER_MAX_VCPU`、`FIRECRACKER_MAX_MEMORY_MIB`、`FIRECRACKER_MAX_DISK_GIB` 四个硬上限共同约束。默认 runtime manager 预留 24 CPU、48 GiB 内存和 250 GiB mutable disk。
- guest 默认使用 `172.30.0.0/16`。runtime manager 只允许到 server/worker callback relay 的受控回调，并由 nftables/CNI 执行 guest egress 策略；不要让 guest 网段与企业网络、集群 Pod CIDR 或 Service CIDR 重叠。
- 对外只暴露 `NGINX_HTTP_PORT`；runtime manager 的 8443 仅存在于内部网络，且强制 TLS 1.3 双向认证。

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

首次部署还必须生成不会写入镜像或日志的 mTLS 文件：

```bash
./agentloom-deploy/scripts/generate-firecracker-pki.sh
```

生成目录已由 `.gitignore` 排除。manager、应用 client 和 guest 使用三个独立 CA；server/worker 只挂载应用 client 证书，不持有 guest CA 私钥。

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

若 `/dev/kvm`、`/dev/net/tun`、cgroup v2、内核版本或 SMT 策略不满足要求，runtime manager 会在 readiness 前 fail closed；API 不会回退到 Docker 或宿主 exec。

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

`pnpm db:seed` 直接读取进程环境中的 `APP_DATABASE_URL`，因此 `server-migrator` / `init-db.sh` 不要求镜像内另带一份 `.env` 文件。

> 之所以要先 bootstrap 这些角色与 `auth.users`，是因为当前应用迁移既会引用 `auth.users(id)`，也会向 `supabase_auth_admin` / `authenticated` 授权；而私有化部署默认使用的是普通 PostgreSQL，而不是已经预置这些角色与 schema 的 Supabase 托管实例。

此外，`init-db.sh` 在发现 `agentloom-deploy/docker/.pi-tarballs` 缺失时，会自动调用 `agentloom-deploy/scripts/prepare-pi-tarballs.sh`。该脚本默认从 `https://github.com/badlogic/pi-mono` 拉取源码并构建 tarballs，因此 server/worker 的 Docker 构建不再依赖宿主机预先准备固定的 `pi-mono` 工作树。

### 3. 启动全栈

在首次启动全栈前，构建锁定版本且带校验和的 Firecracker、jailer、guest kernel、initramfs、rootfs 和 `agentloom-guestd`：

```bash
./agentloom-deploy/firecracker/build-artifacts.sh
./agentloom-deploy/firecracker/build-runtime-image.sh
```

`artifact-lock.json` 固定 Firecracker v1.16.1、kernel、BusyBox 与 Arch rootfs digest；构建脚本逐项校验下载 SHA-256，并生成 `manifest.json`。runtime manager 启动时再次校验 manifest，拒绝缺失或被篡改的 artifact。guest rootfs 内运行真实 sandbox Fastify 适配层，不使用宿主进程或 fake runtime。

启动前执行宿主预检：

```bash
test -r /dev/kvm
test -c /dev/net/tun
docker compose -f agentloom-deploy/docker-compose.yml \
  --env-file agentloom-deploy/.env \
  run --rm --entrypoint preflight firecracker-runtime
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

time ./agentloom-deploy/firecracker/build-artifacts.sh
time ./agentloom-deploy/firecracker/build-runtime-image.sh

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

- `postgres`、`redis`、`minio`、`qdrant`、`firecracker-runtime`、`server`、`worker`、`studio`、`reverse-proxy` 全部为 `running`，且需要 healthcheck 的服务进入 `healthy`。
- `curl http://localhost:8080/healthz` 与 `curl http://localhost:8080/api/v1/health` 返回成功。
- `agentloom-deploy/firecracker/artifacts/manifest.json` 中的每个 SHA-256 与实际 artifact 一致。
- `server` / `worker` 没有 `/var/run/docker.sock`、`/dev/kvm`、`NET_ADMIN` 或 `SYS_ADMIN`；只有 `firecracker-runtime` 为 privileged，并加入宿主 PID/cgroup namespace 管理 jailer 子树。
- `firecracker-runtime` 同时连接 internal `app_net` 与独占的 `sandbox_egress_net`；CNI provision 后的 host-veth tc filter 固定 guest IPv4/MAC 与 ARP sender 身份，guest kernel 不提供 IPv6，manager nftables 拒绝 sibling VM、私网/reserved CIDR 与非 relay host ingress，再为允许的公网流量执行 NAT。
- 运行 `agentloom-deploy/firecracker/firecracker-smoke.sh`，确认真实 KVM VM 的 session、SSE terminal event、abort、文件、runtime exec、PTY registry、callback rewrite、persistent stop/start、禁用 IPv6、source-IP spoof 拒绝、manager control-plane 拒绝以及 guest DNS/HTTPS。

runtime manager 会在 `SIGTERM` 时先收口 active VM；Compose/Kubernetes 应保留至少 60 秒终止宽限期。若宿主故障或强制终止遗留 Firecracker 进程，operator 必须先清理对应 `agentloom-firecracker/<runtimeHandle>` cgroup，再重启 manager；cold recovery 会把仍标记为 running 但进程已不存在的 persistent VM 收口为可重新启动的 stopped 状态。

guest 默认允许公网 egress（smoke 覆盖 DNS/HTTPS），并拒绝 source-IP/MAC/ARP spoof、sibling VM、loopback、link-local、RFC1918、CGNAT、metadata 与 reserved CIDR。private LLM/MCP 需要在 `FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS`（Helm: `firecrackerRuntime.allowedPrivateCIDRs`）逐项加入 IPv4 CIDR；该 allowlist 不能放开 sibling VM。

### 4. 验证

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/health
```

> `StorageService` 会在应用启动时自动创建缺失的 MinIO bucket，所以这套部署脚本**不需要额外的 bucket bootstrap 步骤**。

## Legacy Docker → Firecracker 数据切换

已有 persistent sandbox 必须经过一次 maintenance cutover；fresh install 没有 legacy session，迁移会直接创建 `runtime_handle` 并移除空的 legacy 列。

1. 把 `.env` 中 `APP_SANDBOX_MAINTENANCE_MODE=true`，重启 server/worker，等待 execution、agent conversation prompt 和 `sandbox-lifecycle` 队列排空。
2. 顺序执行：

```bash
docker compose -f agentloom-deploy/docker-compose.yml --env-file agentloom-deploy/.env \
  --profile migration run --rm sandbox-cutover export
docker compose -f agentloom-deploy/docker-compose.yml --env-file agentloom-deploy/.env \
  --profile migration run --rm sandbox-cutover restore
docker compose -f agentloom-deploy/docker-compose.yml --env-file agentloom-deploy/.env \
  --profile migration run --rm sandbox-cutover activate
```

`export` 是唯一临时挂载 Docker socket 的进程。它按共享 workspace 分组归档到 MinIO，同时保存文件 manifest 与 SHA-256；`restore` 为每个 session 创建独立 ext4 mutable disk，逐项校验 manifest，并保证同一 workspace lease 只有一个 active runtime。任何对象截断、checksum、manifest、manager metadata 或 disk 不一致都会 fail closed，数据库不会 activate。

3. 取消 maintenance，重启应用并运行真实 KVM smoke。在 `APP_SANDBOX_ROLLBACK_HOURS` 窗口内若需回退，重新进入 maintenance、排空队列后执行 `sandbox-cutover rollback`，再部署上一版 legacy server。rollback 先从当前 Firecracker workspace 导出最新归档，再覆盖旧 Docker volume，因此不会丢失 cutover 后写入。
4. 窗口结束且验收通过后执行 `sandbox-cutover finalize`。它删除 legacy container/volume 和临时迁移对象，把所有记录标记为 finalized，最后删除 `sandbox_sessions.container_id`。finalize 后不可 rollback。

切换前必须在隔离测试数据上执行完整演练；脚本会创建临时 PostgreSQL database、MinIO bucket、Redis queue keys、三个 legacy container/两个 volume 和真实 KVM VM，并在退出时清理：

```bash
./agentloom-deploy/firecracker/test/cutover-rehearsal.sh
```

演练覆盖 maintenance/drain gate、共享 workspace、文本/binary/空目录/Unicode/symlink manifest、截断对象 fail-closed、active workspace 冲突、cutover 后写入回滚、再次 forward/finalize 和 fresh install 空表迁移。

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

这份 runbook 把“备份存在”收敛为“备份可校验、可恢复、可量化”。

## Helm Chart

Chart 路径：`agentloom-deploy/kubernetes/helm/agentloom`

它覆盖：

- `server` Deployment + Service + 可选 HPA
- `worker` Deployment + 内部 callback Service + 可选 HPA
- singleton `firecracker-runtime` StatefulSet + Service + RWO state PVC
- `studio` Deployment + Service + 可选 HPA
- `Ingress`（把 `/api` 与 `/socket.io` 指向 `server`，`/` 指向 `studio`）
- PostgreSQL / Redis / MinIO / Qdrant 的可选内置依赖
- PVC、ConfigMap，以及由 operator 预创建的 Firecracker PKI Secret

部署前先创建 PKI Secret，并把 runtime manager 固定到满足 KVM 前提的唯一节点：

```bash
./agentloom-deploy/scripts/generate-firecracker-pki.sh
kubectl create secret generic agentloom-firecracker-manager-pki \
  --from-file=agentloom-deploy/secrets/firecracker
kubectl create secret generic agentloom-firecracker-client-pki \
  --from-file=manager-ca.crt=agentloom-deploy/secrets/firecracker/manager-ca.crt \
  --from-file=app-client.crt=agentloom-deploy/secrets/firecracker/app-client.crt \
  --from-file=app-client.key=agentloom-deploy/secrets/firecracker/app-client.key
kubectl label node <runtime-node> agentloom.dev/firecracker=true
```

然后设置 `firecrackerRuntime.nodeSelector.agentloom.dev/firecracker=true`。state PVC 必须是 RWO，且容量要覆盖所有 mutable guest disk；server/worker 只读挂载 client Secret，manager Secret 中的 guest CA 私钥不会进入应用 Pod。

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

## 当前部署约束

1. **singleton control plane。** Compose 与 Helm 都只支持一个 runtime manager；state volume 不支持多写或跨节点透明漂移。
2. **宿主责任。** operator 负责支持范围内的 Linux kernel、KVM/TUN/cgroup/nftables、CPU/内存/disk 容量和 guest 网段冲突检查。
3. **备份责任。** PostgreSQL/MinIO 备份不包含 mutable microVM disk。persistent sandbox 的权威工作区应定期同步为 Workspace snapshot；runtime state volume 只能在 manager 停止后做 crash-consistent block snapshot。
4. **egress 责任。** 默认 nftables/CNI 策略只允许受控 DNS、HTTP(S) egress 和 callback relay。企业环境应进一步收紧目的 CIDR/域名，并验证 guest CIDR 与 Pod/Service/VPC 网段不重叠。
5. **没有 Docker fallback。** runtime manager 不可用、artifact 校验失败或 manager metadata/disk 不一致时，sandbox 操作 fail closed；不得把 Docker socket、KVM 或额外 capabilities 加回 server/worker。
6. **worker 仍不是 worker-only runtime。** `server` 与 `worker` 都运行完整 Nest 入口并消费队列；worker Service 只供 guest callback relay 使用，不可暴露到公网。
