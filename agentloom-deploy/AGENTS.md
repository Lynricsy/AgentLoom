# AgentLoom 私有部署知识库

`agentloom-deploy/` 提供 Docker Compose、Nginx、Helm、Firecracker runtime manager、环境模板、备份恢复和 systemd 定时资产。

## 目录

```text
agentloom-deploy/
├── docker-compose.yml
├── docker/
│   ├── server.Dockerfile
│   ├── studio.Dockerfile
│   └── docs.Dockerfile
├── nginx.conf
├── firecracker/
├── sandbox/
├── kubernetes/helm/agentloom/
├── scripts/
└── systemd/
```

Compose 中 server/worker 使用同一 Nest 镜像和入口。只有 singleton `firecracker-runtime` 持有 KVM、TUN、cgroup、CNI/nft 与 mutable disk 权限；server/worker 是普通 mTLS client，不挂 Docker socket 或 KVM。

## pnpm workspace 镜像构建

`docker/server.Dockerfile` 与 `docker/studio.Dockerfile` 的 build context 是仓库根，依赖安装在根 pnpm workspace 上进行：

- 复制根 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、`package.json`。
- install 前复制 workspace 内部包的完整源码。`agentloom-contracts`、`agentloom-api-client`、`agentloom-plugin-sdk` 包含 `prepare`，只复制 package.json 会在安装期间缺少构建输入。
- server 使用 `pnpm install --frozen-lockfile --config.node-linker=hoisted --filter agentloom-server... --filter agentloom-server^...` 安装 server 及依赖子图。
- Studio 使用对应的 `--filter agentloom-studio... --filter agentloom-studio^...` 子图。
- 内部包在 deps stage 显式构建，再构建 server/studio。
- server production 依赖使用 `pnpm prune --prod --config.node-linker=hoisted --ignore-scripts`。`--ignore-scripts` 防止 prune 在 devDependencies 已移除后重复运行内部包 prepare。
- server production stage 整体复制 workspace 目录树，保留根 `node_modules` 指向内部包目录的符号链接。
- server production `WORKDIR` 是 `/app/agentloom-server`。

修改 workspace 包、根 lockfile 或 Dockerfile 时必须从仓库根执行 Compose build。

## Compose 拓扑

- `reverse-proxy`：统一入口；`/api/`、`/socket.io/` 到 server，`/` 到 studio。
- `server` / `worker`：完整 Nest 入口和队列消费者；worker callback Service 不对公网暴露。
- `firecracker-runtime`：singleton privileged control plane。
- `postgres`、`redis`、`minio`、`qdrant`：数据依赖。
- `sandbox-cutover`：migration profile 的维护工具，只有该临时进程接触 legacy Docker socket。

runtime manager 的 8443 只在内部网络暴露，使用 TLS 1.3 mTLS。生产拓扑是单节点 singleton，runtime state volume 不支持多写或跨节点透明漂移。

## Helm

Chart 位于 `kubernetes/helm/agentloom/`。Firecracker runtime 使用 replicas=1 StatefulSet、RWO PVC、privileged security context，并通过 nodeSelector 固定到满足 x86_64 Linux、KVM、TUN、cgroup v2 与 nftables 预检的节点。

PG/Redis/MinIO/Qdrant 禁用时必须提供外部连接配置。server/worker 只读挂载 client PKI；guest CA 私钥只进入 manager。

## 备份与恢复

- `scripts/backup-postgres.sh` 使用 `pg_dump -Fc`，生成 dump、sha256 与 metadata，并以 `pg_restore --list` 校验结构。
- `scripts/backup-minio.sh` 使用 `mc mirror` 生成 bucket 快照。
- `scripts/restore.sh` 校验 PostgreSQL/MinIO 输入，停止应用，恢复数据，拉起应用并检查 DB、`/api/v1/health` 与 `/healthz`。
- `systemd/` 提供 PostgreSQL 每小时 :05、MinIO 每小时 :20 的 timer，配置 `Persistent=true`。

mutable microVM disk 不属于 PostgreSQL/MinIO 备份。persistent sandbox 的权威工作区需要同步为 Workspace snapshot；runtime state volume 只能在 manager 停止后做 crash-consistent block snapshot。

## Firecracker runtime 内部约束

- `agentloom-firecracker-runtime/internal/manager/manager.go` 的全局 mutex 只保护 capacity、metadata、live map 与每 session operation map 的短临界区。disk、CNI、Firecracker launch/readiness、shutdown 等外部操作在锁外执行。
- operation map 是 per-session 操作租约；同一 session 的 create/start/stop/delete 互斥，metadata 的 `creating` / `stopping` 状态阻止同 VM 重入。
- `agentloom-firecracker-runtime/internal/runtime/launcher.go` 将调用方 `context.Context` 传给 machine factory、`NewMachine` 和 `Start`。启动失败与 PID 等待失败使用独立的 5 秒 cleanup context，避免调用方取消阻断清理。
- `agentloom-firecracker-runtime/internal/guest/runtime.go` 的 exec registry 同时限制 active 与 completed 记录，并通过 TTL reaper 清理完成记录。需要双锁时顺序固定为 registry mutex → exec record mutex。
- `agentloom-firecracker-runtime/internal/artifactpath/validate.go` 是 materialize 与 preflight 的共享 artifact path 校验器；拒绝绝对路径、逃逸根目录的 `..`、路径中的 symlink 和非 regular file。`agentloom-firecracker-runtime/internal/manager/artifacts.go` 与 `agentloom-firecracker-runtime/internal/preflight/check.go` 都调用 `artifactpath.Validate()`。

## 网络与隔离

Guest 使用 per-VM netns/TAP/CNI、source identity enforcement、nftables egress 与 cgroup 限制。manager 与 guest API 使用独立 mTLS 信任域。sandbox runtime 不回退到 Docker 或宿主 exec；artifact、metadata、disk 或 preflight 校验失败时 fail closed。

## 常用命令

从仓库根执行：

```bash
cp agentloom-deploy/.env.template agentloom-deploy/.env
./agentloom-deploy/scripts/generate-firecracker-pki.sh
docker compose -f agentloom-deploy/docker-compose.yml build server studio
docker compose -f agentloom-deploy/docker-compose.yml up -d
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/health
```

环境变量合同位于 `.env.template` 与 `envs/`。公网部署必须配置真实的 frontend、OAuth 与 Supabase external/site URL。
