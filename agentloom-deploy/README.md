# AgentLoom 私有部署

`agentloom-deploy/` 是 AgentLoom 的私有部署资产：Docker Compose 拓扑与 OpenResty 入口、server / studio / docs 镜像、可选的自托管 Supabase 认证、Firecracker microVM 沙箱运行时、Helm Chart，以及备份恢复脚本与 systemd 定时器。应用行为由各应用包实现，本目录只定义如何部署与运维它们。

## 目录

| 路径 | 内容 |
| --- | --- |
| `docker-compose.yml` | 主拓扑：reverse-proxy、studio、docs、server、worker、firecracker-runtime、PostgreSQL、Redis、MinIO、Qdrant |
| `docker-compose.supabase.yml`、`supabase/kong.yml` | 自托管 Supabase：GoTrue 与 Kong |
| `.env.template`、`envs/` | Compose 环境变量模板 |
| `nginx.conf` | 入口路由 |
| `docker/` | server、studio、docs 镜像的 Dockerfile（build context 为仓库根） |
| `scripts/` | 生成密钥与 PKI、初始化数据库、备份与恢复 |
| `firecracker/` | 产物锁定文件、产物与 runtime 镜像构建、冒烟与迁移演练脚本 |
| `sandbox/` | microVM 内运行的沙箱服务 |
| `kubernetes/helm/agentloom/` | Helm Chart |
| `systemd/` | 备份 service 与 timer |

## 命令

在本目录下执行：

```bash
./scripts/generate-secrets.sh
./scripts/generate-firecracker-pki.sh
./firecracker/build-artifacts.sh
docker network create supabase-shared
./scripts/init-db.sh
docker compose up -d --build
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/health
```

`init-db.sh` 依次执行：构建 server 镜像 → 启动 PostgreSQL 并创建 Supabase 兼容角色与 `auth` schema → 启动 Supabase 认证栈并等待 GoTrue 建好 `auth.users` → 执行迁移。

```bash
./firecracker/firecracker-smoke.sh
docker compose --profile tools run --rm server-migrator pnpm db:migrate
./scripts/backup-postgres.sh
./scripts/backup-minio.sh
./scripts/restore.sh --postgres-dump backups/postgres/agentloom-postgres-<timestamp>.dump --minio-dir backups/minio/agentloom-minio-<timestamp>
```

## 文档

详细步骤、变量参考与已知问题见文档站「部署运维」分区：<https://agentloom.ling.plus/documentation/deploy/>（源文件 `agentloom-docs/deploy/`）。
