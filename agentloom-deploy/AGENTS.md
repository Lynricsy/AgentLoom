# Repository Guidelines

## Project Overview

`agentloom-deploy/` 是私有部署资产包，负责 Compose/OpenResty 入口、应用镜像、数据依赖、可选 Supabase Auth、Firecracker microVM、Helm 和备份恢复。
本目录只定义部署与运维合同；应用行为分别由 server、studio、docs 和 Firecracker runtime 包实现，跨包总约束见根 `AGENTS.md`。

## Architecture & Data Flow

- `reverse-proxy` 是 Compose 唯一公开 Web 入口，默认绑定宿主 `8080`；`/api/`、`/socket.io/` 转发 server，页面转发 studio，文档位于 `/documentation/`。
- `server` 与 `worker` 共用 server 镜像和 Nest 入口；callback 地址分别指向各自容器，不能合并成同一地址。
- `postgres`、`redis`、`minio`、`qdrant` 保存业务数据；`createbuckets` 是一次性 MinIO bucket 初始化任务。
- `firecracker-runtime` 是单实例特权 control plane，持有 KVM、TUN、host PID/cgroup、CNI/nft 和 mutable VM disk；server/worker 仅持有只读 mTLS client 凭据。
- `frontend_net` 连接入口与 Web 应用，`app_net`、`data_net` 为 internal network，`sandbox_egress_net` 提供 guest 出站；`supabase_net` 是名为 `supabase-shared` 的 external network。
- runtime 的 8443 仅在 Compose 网络内暴露并要求 mTLS；sandbox 校验或 runtime 不可用时不回退到 Docker/宿主执行。

## Key Directories

- `docker-compose.yml`：主拓扑；常驻服务为 reverse-proxy、studio、docs、server、worker、firecracker-runtime、PostgreSQL、Redis、MinIO、Qdrant，另有 createbuckets。
- `docker-compose.supabase.yml`：可选 GoTrue + Kong；`supabase-db-ready` 等主 Compose PostgreSQL 就绪后退出。
- `.env.template`：完整 Compose 合同；`envs/*.example` 按 shared/server/studio 拆分，修改变量时保持对应层一致。
- `docker/`：server、studio、docs 多阶段镜像；build context 都是仓库根。
- `scripts/`：凭据、数据库初始化、pi-mono tarball、备份与恢复入口。
- `firecracker/`：锁定来源、构建 guest/kernel/rootfs/runtime image、KVM smoke 和迁移演练。
- `kubernetes/helm/agentloom/`：server、worker、studio、数据依赖及单实例 runtime 的 Helm chart。
- `systemd/`：调用备份脚本的 oneshot service 和持久化 timer，默认部署目录为 `/opt/agentloom/agentloom-deploy`。

## Development Commands

以下命令从仓库根执行。首次配置优先让脚本从模板生成 `.env`；脚本拒绝覆盖已有文件：

```bash
./agentloom-deploy/scripts/generate-secrets.sh --output agentloom-deploy/.env
./agentloom-deploy/scripts/generate-firecracker-pki.sh
```

`generate-secrets.sh` 生成数据库、Redis、MinIO、JWT、32 字节 Base64 master key 及 Supabase anon/service JWT，并将 `.env` 权限设为 0600。PKI 脚本生成 manager、client、guest 三套独立 CA；目标目录已存在时会退出，可把自定义输出目录作为第一个参数。

主 Compose 和 Supabase Compose 都声明 external Supabase 网络，首次使用先创建；Supabase 与主栈共享 PostgreSQL：

```bash
docker network create supabase-shared
docker compose -f agentloom-deploy/docker-compose.yml --env-file agentloom-deploy/.env up -d postgres
./agentloom-deploy/scripts/init-db.sh
docker compose -f agentloom-deploy/docker-compose.supabase.yml --env-file agentloom-deploy/.env up -d
docker compose -f agentloom-deploy/docker-compose.yml --env-file agentloom-deploy/.env up -d --build
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/health
```

`init-db.sh` 会准备 pi tarballs、构建 server、启动 PostgreSQL、创建 GoTrue 所需角色/schema，再用 `server-migrator` 执行 `pnpm db:migrate`；仅当 `RUN_DB_SEED=true` 时执行 seed。GoTrue 首次启动后如业务角色需要访问 session，按脚本提示授予 `auth.sessions` 权限。

Compose profiles：

```bash
docker compose -f agentloom-deploy/docker-compose.yml --profile tools run --rm server-migrator pnpm db:migrate
docker compose -f agentloom-deploy/docker-compose.yml --profile migration run --rm sandbox-cutover export
```

`tools` 只启用 `server-migrator`；`migration` 只启用临时 `sandbox-cutover`，它是唯一挂载 legacy Docker socket 的服务。迁移需依序使用 export/restore/activate/finalize；rollback 受 `APP_SANDBOX_ROLLBACK_HOURS` 约束，不要绕过维护模式和队列 drain 检查。

## Code Conventions & Common Patterns

- Compose 变量保留 `APP_`、`FIRECRACKER_`、`SUPABASE_` 前缀；生产环境不得保留 `change-me-*` 或 localhost OAuth/site URL。
- private 模式下 `APP_SUPABASE_URL`、anon key、service key 必须三者全空或全有；`SUPABASE_JWT_SECRET` 必须与 `APP_JWT_SECRET` 相同。
- 新增服务要声明网络、healthcheck、resource limit、restart 策略和持久卷责任；不要向 server/worker 添加 Docker socket、KVM 或 guest CA 私钥。
- shell 脚本使用 Bash、`set -euo pipefail`、可覆盖的 `COMPOSE_FILE`/`ENV_FILE`；破坏性恢复必须先验证输入，并在停止写入者后执行。
- server Dockerfile 必须在 workspace install 前复制含 `prepare` 的内部包完整源码，production prune 保留 `--ignore-scripts`，并整体复制 workspace 以维持符号链接。
- studio 镜像在启动时替换 `__VITE_*__` 占位符；新增浏览器运行时变量需同时更新 build args、替换脚本、Compose 和环境模板。
- docs 镜像输出到 `/documentation`，nginx 监听 8081；不要把它当作根路径站点。

## Firecracker Artifacts & Runtime

`artifact-lock.json` 固定 Firecracker 1.16.1、Amazon microVM kernel 源码/config、BusyBox、Arch OCI digest/snapshot 和 2 GiB rootfs。升级时同步更新 URL、commit、SHA-256、Docker image tag 和 manifest，不允许只替换生成物。

```bash
./agentloom-deploy/scripts/prepare-pi-tarballs.sh
PI_MONO_DIR=/path/to/pi-mono ./agentloom-deploy/scripts/prepare-pi-tarballs.sh
./agentloom-deploy/firecracker/build-artifacts.sh
./agentloom-deploy/firecracker/build-runtime-image.sh
./agentloom-deploy/firecracker/firecracker-smoke.sh
./agentloom-deploy/firecracker/test/cutover-rehearsal.sh
```

- tarball 脚本默认获取锁定的 pi-mono commit，按 `tui → ai → agent → coding-agent` 构建，并发布到 `docker/.pi-tarballs` 与 `sandbox/.pi-tarballs`；位置参数可改为一个或多个输出目录。
- artifact 构建要求 Linux x86_64、Docker buildx、Go、npm、jq、mke2fs 等工具；下载项先校验 SHA-256，再构建 guestd、sandbox、ext4 rootfs、kernel/initramfs 和 manifest。
- runtime image 脚本先重建 artifacts，再构建 `agentloom/firecracker-runtime:1.16.1`；其镜像内含 preflight、jailer wrapper、cutover 与 CNI 插件。
- smoke 脚本要求主栈 runtime 已健康且宿主可用 KVM；它验证 VM 生命周期、guest API、持久文件、DNS/HTTPS、源地址防伪、私网隔离、session/SSE，并在退出时删除 VM/disk。
- cutover rehearsal 会创建隔离数据库、bucket、Redis queue、legacy 容器/卷和真实 KVM VM，并清理资源；只在专用开发宿主运行。

## Backup & Restore

```bash
./agentloom-deploy/scripts/backup-postgres.sh
COMPOSE_NETWORK=agentloom-app ./agentloom-deploy/scripts/backup-minio.sh
./agentloom-deploy/scripts/restore.sh --postgres-dump agentloom-deploy/backups/postgres/agentloom-postgres-<timestamp>.dump --minio-dir agentloom-deploy/backups/minio/agentloom-minio-<timestamp>
```

- PostgreSQL 使用 `pg_dump -Fc`，写 `.sha256` 与 `.meta`，并以同版本 `pg_restore --list` 验证；默认保留 7 天。
- MinIO 使用 `mc mirror --overwrite` 备份配置 bucket，写 `backup.meta`；默认保留 7 天。`COMPOSE_NETWORK` 必须指向 MinIO 所在网络，默认备份值与恢复值不同，调用时应显式设为实际网络名。
- restore 同时要求 dump 和 MinIO 目录；它校验 checksum（存在时）、dump 结构和 bucket 目录，停止应用写入者，重建数据库，以 `mc mirror --remove` 恢复 bucket，重启应用并检查数据库、server 与 proxy health。
- timer 在每小时 `:05` 运行 PostgreSQL 备份、`:20` 运行 MinIO 备份，均为 `Persistent=true`；安装前按实际路径修改 service 的 `AGENTLOOM_DEPLOY_DIR`。
- PostgreSQL/MinIO 备份不包含 mutable microVM disk。持久 sandbox 的权威内容应进入 Workspace snapshot；runtime state 只能在 manager 停止后做 crash-consistent block snapshot。

## Important Files

- `docker-compose.yml` / `docker-compose.supabase.yml`：主拓扑与可选 Supabase Auth 栈。
- `.env.template` 与 `envs/*.example`：Compose 环境合同（shared/server/studio 分层）。
- `firecracker/artifact-lock.json`：Firecracker/kernel/BusyBox/rootfs 来源与 SHA-256 锁定。
- `kubernetes/helm/agentloom/values.yaml`（生产参考 `values.private.yaml`）：Helm 拓扑与 runtime 约束。
- `systemd/`：备份 oneshot service 与 `Persistent=true` timer。

## Runtime/Tooling Preferences

- 宿主要求：Linux x86_64、Docker Compose v2 + buildx；Firecracker 相关操作需 KVM/TUN/cgroup v2/nftables；artifact 构建另需 Go、npm、jq、mke2fs、curl、tar。
- Helm runtime 固定 `replicas: 1`、privileged、hostPID、RWO state PVC，并挂载 `/dev/kvm`、`/dev/net/tun` 与宿主 cgroup；用 `nodeSelector` 固定到通过预检的节点。
- `managerPkiSecretName` 包含 manager/server、client CA 和 guest CA 私钥；`clientPkiSecretName` 只供 server/worker 使用。禁用内置 PostgreSQL/Redis/MinIO/Qdrant 时填写外部 endpoint/credential。

## Testing & QA

- 本目录无单元测试套件；验证手段是拓扑检查与真机 smoke。
- Compose 改动至少用 `docker compose ... config` 检查插值与 profiles；运行态改动使用 `/healthz`、`/api/v1/health`。
- Firecracker artifact/runtime 或网络隔离改动必须在 KVM 宿主运行 `firecracker/firecracker-smoke.sh`；cutover 变更必须运行 `firecracker/test/cutover-rehearsal.sh`。
