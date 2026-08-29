# AgentLoom 私有部署

`agentloom-deploy/` 是 AgentLoom 的私有部署 bundle，提供 Docker Compose、Nginx、Helm、Firecracker sandbox control plane、环境模板和备份恢复资产。

## 快速启动

```bash
cp agentloom-deploy/.env.template agentloom-deploy/.env
./agentloom-deploy/scripts/generate-firecracker-pki.sh

docker compose \
  -f agentloom-deploy/docker-compose.yml \
  --env-file agentloom-deploy/.env \
  up -d --build
```

健康检查：

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/health
```

## 镜像构建

Server 与 Studio Dockerfile 从仓库根 pnpm workspace 安装依赖：

- 使用 `--filter agentloom-server...` / `--filter agentloom-studio...` 安装目标包依赖子图。
- workspace 内部包在 install 前复制完整源码，因为它们包含 `prepare`。
- server 使用 `pnpm prune --prod --ignore-scripts` 生成 production 依赖。
- server production stage 保留整个 workspace 目录树，避免内部包符号链接断开；运行目录为 `/app/agentloom-server`。

单独构建应用镜像：

```bash
docker compose -f agentloom-deploy/docker-compose.yml build server studio
```

## 隔离拓扑

- Nginx 是唯一 Web 入口。
- server 与 worker 使用同一 Nest 镜像和入口，只作为 Firecracker manager 的 mTLS client。
- `firecracker-runtime` 独占 KVM、TUN、cgroup、CNI/nft 和 guest disk 权限；server/worker 不持有这些特权。
- PostgreSQL、Redis、MinIO、Qdrant 提供数据依赖。
- runtime manager 不可用或校验失败时 sandbox fail closed，没有 Docker fallback。

### 沙箱运行时节点

沙箱运行时节点登记在 `sandbox_runtime_nodes` 表，经 `/api/v1/sandbox-nodes` 管理（owner/admin；saas 模式还需租户在 `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` 白名单内）。`sandbox_sessions.runtime_handle` 形如 `<nodeId>/<managerHandle>`，据此把后续所有操作路由回原节点。

- 表为空时首次启动按 `APP_FIRECRACKER_RUNTIME_URL` / `APP_FIRECRACKER_RUNTIME_SERVER_NAME` 播种 `default` 节点；表非空后这两项不再回写，节点列表以 DB 为准。
- 创建沙箱时并行探测各 active 节点的 `GET /v1/capacity`，剔除不健康与余量不足的，按空闲内存比择优；节点返回 503 或不可达则换下一个。
- **Compose 本质单节点**：单机 compose 只跑一个 runtime 容器。跨服务器部署 = 每台宿主机各跑一个 runtime 容器，用 `scripts/generate-firecracker-pki.sh add-node <name> <sans>` 为其签发服务端证书，再经管理 API 注册。
- **Helm 支持多节点**：`firecrackerRuntime.replicas` 可大于 1，各 pod 通过 headless service 以 `https://<statefulset>-N.<headless>.<ns>.svc:8443` 稳定寻址；证书 SAN 用 PKI 脚本的 `FIRECRACKER_MANAGER_EXTRA_SANS` 覆盖。要求每个 K8s node 具备 KVM。
- server/worker 用同一套 client 证书直连所有节点——manager 只校验 client 证书的签发 CA，不校验 CN/SAN。

每台承载 runtime manager 的宿主需要 x86_64 Linux、KVM、TUN、cgroup v2 与 nftables。

## 运维入口

- 根环境模板：`.env.template`
- Compose：`docker-compose.yml`
- Helm Chart：`kubernetes/helm/agentloom/`
- PostgreSQL 备份：`scripts/backup-postgres.sh`
- MinIO 备份：`scripts/backup-minio.sh`
- 恢复：`scripts/restore.sh`
- Firecracker artifact 构建：`firecracker/build-artifacts.sh`
- Firecracker runtime image：`firecracker/build-runtime-image.sh`
- Firecracker PKI 生成：`scripts/generate-firecracker-pki.sh`
- 新增沙箱节点服务端证书：`scripts/generate-firecracker-pki.sh add-node <name> <sans>`

详细拓扑、备份责任和 workspace 镜像约定见 `AGENTS.md`。
