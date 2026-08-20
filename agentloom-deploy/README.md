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
- singleton `firecracker-runtime` 独占 KVM、TUN、cgroup、CNI/nft 和 guest disk 权限。
- PostgreSQL、Redis、MinIO、Qdrant 提供数据依赖。
- runtime manager 不可用或校验失败时 sandbox fail closed，没有 Docker fallback。

Compose 与 Helm 均要求单个 runtime manager。宿主需要 x86_64 Linux、KVM、TUN、cgroup v2 与 nftables。

## 运维入口

- 根环境模板：`.env.template`
- Compose：`docker-compose.yml`
- Helm Chart：`kubernetes/helm/agentloom/`
- PostgreSQL 备份：`scripts/backup-postgres.sh`
- MinIO 备份：`scripts/backup-minio.sh`
- 恢复：`scripts/restore.sh`
- Firecracker artifact 构建：`firecracker/build-artifacts.sh`
- Firecracker runtime image：`firecracker/build-runtime-image.sh`

详细拓扑、备份责任和 workspace 镜像约定见 `AGENTS.md`。
