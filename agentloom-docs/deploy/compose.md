---
docType: tutorial
---

# 用 Docker Compose 部署

按本页从一份仓库检出开始，在一台 Linux 服务器上跑起完整的 AgentLoom：Studio、API、文档站、自托管 Supabase 认证与 Firecracker 沙箱运行时。完成后 `http://<服务器>:8080/api/v1/health` 返回 200，`http://<服务器>:8080/documentation/` 打开本文档站。拓扑说明见 [部署拓扑](/deploy/)。

::: warning 验证记录
本页每条命令都在 2026-10-01 于仓库检出 `/root/Projects/Ling/fixlab-deploy` 上从零按顺序执行过（没有 `.env`、PKI、Firecracker 产物与数据卷），输出原样粘贴。为了不与同一宿主上的其他服务冲突，验证时在 `agentloom-deploy/` 下的 `.env` 末尾追加了下列覆盖；页面中的命令与端口写的是默认值：

```dotenv
AGENTLOOM_PROJECT_NAME=fixlab-deploy
AGENTLOOM_SUPABASE_PROJECT_NAME=fixlab-deploy-supabase
AGENTLOOM_NETWORK_PREFIX=fixlab-deploy
SUPABASE_NETWORK=fixlab-deploy-supabase-shared
NGINX_HTTP_PORT=44080
MINIO_CONSOLE_PORT=44901
QDRANT_HTTP_PORT=44633
SUPABASE_KONG_PORT=44800
SERVER_IMAGE=fixlab-deploy/server:local
STUDIO_IMAGE=fixlab-deploy/studio:local
DOCS_IMAGE=fixlab-deploy/docs:local
FIRECRACKER_RUNTIME_IMAGE=fixlab-deploy/firecracker-runtime:local
FIRECRACKER_ENV=test
FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL=true
FIRECRACKER_ALLOW_SWAP=true
```

因此输出中的 project 名、容器名、镜像名、端口与路径来自这些覆盖值。最后三行是因为验证宿主的内核为 `7.2.6-1-cachyos` 且开启了 swap，不满足 runtime 预检（见第 8 步与 [Firecracker 沙箱](/deploy/firecracker#宿主预检)）；第 4 步因此创建的是 `fixlab-deploy-supabase-shared` 而不是 `supabase-shared`。
:::

## 前置条件

- Linux x86_64 服务器，Docker Engine 与 Docker Compose v2（需要支持 `depends_on.required`，Compose 2.20 起）、buildx。验证时为 Docker 29.8.1、Docker Compose 5.5.1。
- 使用 Firecracker 沙箱（`.env.template` 默认启用）时，宿主需要：可读写的 `/dev/kvm` 与 `/dev/net/tun`、cgroup v2、内核 `6.18.x`、关闭 swap、关闭 SMT（或设 `FIRECRACKER_SMT_POLICY=allow`），完整条件见 [Firecracker 沙箱](/deploy/firecracker#宿主预检)。不满足时 server 与 worker 仍会启动，只有 sandbox 运行态的 Agent 不可用；也可以按 [不启用沙箱](/deploy/firecracker#不启用沙箱) 关闭 runtime。
- 构建 Firecracker 产物所需的命令：`curl`、`docker`、`go`、`jq`、`mke2fs`、`npm`、`od`、`sha256sum`、`tar`、`tr`（`agentloom-deploy/firecracker/build-artifacts.sh` 启动时逐个检查），以及 `git` 与 `openssl`。仓库必须是 git 检出：产物清单记录 `git rev-parse HEAD`。
- 服务器能访问 Docker Hub、GitHub（Firecracker 与内核源码下载）和 npm registry。
- 端口 8080（入口）与 8000（Supabase Kong）未被占用；9001（MinIO 控制台）与 6333（Qdrant）只绑定 `127.0.0.1`。

以下命令都在仓库的 `agentloom-deploy/` 目录下执行：

```bash
cd agentloom-deploy
```

## 1. 生成 `.env`

```bash
./scripts/generate-secrets.sh
```

脚本从 `.env.template` 复制出 `.env`，填入随机的数据库、Redis、MinIO 密码，`APP_JWT_SECRET`、`APP_MASTER_ENCRYPTION_KEY` 与 Supabase anon / service key，并把文件权限设为 0600。输出（密钥前缀每次不同）：

```text
🔐 正在生成密钥...

✅ 密钥已生成并写入: /root/Projects/Ling/fixlab-deploy/agentloom-deploy/.env

📋 生成的密钥摘要:
  DB 密码:              Jg5TuZ...
  Redis 密码:           ySufKP...
  MinIO 密码:           VZKWZP...
  JWT Secret:           Y9qI68j8wg...
  Master Encryption:    1jPhIK2U9G...
  Supabase Anon Key:    eyJhbGciOiJIUzI1NiIs...
  Supabase Service Key: eyJhbGciOiJIUzI1NiIs...

⚠ 请妥善保管此文件，切勿提交到版本控制！
⚠ 生产环境请修改 APP_FRONTEND_URL / APP_OAUTH_REDIRECT_URL / SUPABASE_GOTRUE_EXTERNAL_URL / SUPABASE_SITE_URL 为实际域名
```

`.env` 已存在时脚本拒绝覆盖并退出。公网部署按最后一行的提示修改域名，见 [配置参考](/deploy/configuration#公网地址)。`.env` 中的 `COMPOSE_PROFILES=sandbox` 启用 Firecracker runtime；不要在 `.env` 中设置 `COMPOSE_PROJECT_NAME`（原因见 [自托管 Supabase](/deploy/supabase#两个-compose-project)）。

## 2. 生成 Firecracker mTLS 证书

```bash
./scripts/generate-firecracker-pki.sh
```

```text
Firecracker PKI 已生成: /root/Projects/Ling/fixlab-deploy/agentloom-deploy/secrets/firecracker
Manager Secret: kubectl create secret generic agentloom-firecracker-manager-pki --from-file=/root/Projects/Ling/fixlab-deploy/agentloom-deploy/secrets/firecracker
Client Secret: kubectl create secret generic agentloom-firecracker-client-pki --from-file=manager-ca.crt=/root/Projects/Ling/fixlab-deploy/agentloom-deploy/secrets/firecracker/manager-ca.crt --from-file=app-client.crt=/root/Projects/Ling/fixlab-deploy/agentloom-deploy/secrets/firecracker/app-client.crt --from-file=app-client.key=/root/Projects/Ling/fixlab-deploy/agentloom-deploy/secrets/firecracker/app-client.key
```

`secrets/firecracker/` 下生成 manager、client、guest 三套 CA 及证书，共 12 个文件；`kubectl` 两行只用于 Helm，Compose 部署忽略。server 与 worker 把客户端证书挂载为 Compose secret，不启用沙箱时这一步也要执行。

## 3. 构建 Firecracker 产物

```bash
./firecracker/build-artifacts.sh
```

脚本按 `firecracker/artifact-lock.json` 下载 Firecracker、内核源码与 BusyBox 并校验 SHA-256，按已跟踪的 `sandbox/package-lock.json` 执行 `npm ci` 构建 guest 侧程序，生成 2 GiB ext4 rootfs、内核与 initramfs，写出清单。验证时耗时约 2.5 分钟（Docker 构建缓存已存在；无缓存时约 6 分钟），最后一行：

```text
Firecracker artifacts built at /root/Projects/Ling/fixlab-deploy/agentloom-deploy/firecracker/artifacts
```

`firecracker/artifacts/` 会被第 6 步的 `firecracker-runtime` 镜像复制进去。不启用沙箱时可以跳过本步。

## 4. 创建共享网络

主 Compose 与 Supabase Compose 都把 `supabase-shared` 声明为 external 网络，它们不会自己创建：

```bash
docker network create supabase-shared
```

输出是新网络的 ID，例如：

```text
8b928eb6a3554939cc700afcbc53625620502cf1b5ba3b5e3ad525a4046f2675
```

## 5. 初始化数据库

```bash
./scripts/init-db.sh
```

脚本依次：构建 server 镜像 → 启动 `postgres` 并创建 Supabase 所需的角色与 `auth` schema → 启动 Supabase 认证栈（`docker-compose.supabase.yml`，`up -d --wait`）并等待 GoTrue 建好 `auth.users` → 用 `server-migrator` 执行 `pnpm db:migrate`。server 迁移中有指向 `auth.users` 的外键，所以必须在 GoTrue 首次启动之后迁移，详见 [自托管 Supabase](/deploy/supabase#与主栈的依赖顺序)。输出（省略镜像构建日志、Compose 的 `Container …` 行与 PostgreSQL 的标识符截断 `NOTICE`）：

```text
构建 server 镜像（server/worker 共用镜像）...
启动 PostgreSQL ...
为 vanilla PostgreSQL 初始化 Supabase 兼容角色与 auth schema ...
DO
GRANT
CREATE SCHEMA
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
启动 Supabase 认证栈，等待 GoTrue 创建 auth.users ...
✓ auth.users 已由 GoTrue 创建
执行数据库迁移...
> agentloom-server@0.0.1 db:migrate /build/agentloom-server
> drizzle-kit migrate
No config path provided, using default 'drizzle.config.ts'
Reading config file '/build/agentloom-server/drizzle.config.ts'
Using 'postgres' driver for database querying
[✓] migrations applied successfully!跳过种子数据导入（RUN_DB_SEED=false）。
数据库初始化完成。
```

验证时耗时 32 秒（server 镜像已有构建缓存）。再次运行时 `auth.users` 已存在，脚本打印 `✓ auth.users 已存在` 并跳过启动 Supabase 栈。需要导入模板等种子数据时，把 `.env` 中的 `RUN_DB_SEED` 改为 `true` 后再运行一次本步。

## 6. 启动全部服务

```bash
docker compose up -d --build
```

本步构建 studio、docs、firecracker-runtime 镜像并启动所有服务。输出末尾（省略构建日志与重复行）：

```text
 Container fixlab-deploy-createbuckets-1 Started
 Container fixlab-deploy-firecracker-runtime-1 Healthy
 Container fixlab-deploy-server-1 Started
 Container fixlab-deploy-worker-1 Started
 Container fixlab-deploy-docs-1 Healthy
 Container fixlab-deploy-studio-1 Healthy
 Container fixlab-deploy-server-1 Healthy
 Container fixlab-deploy-reverse-proxy-1 Started
```

主栈与 Supabase 栈是两个 project，输出中没有 orphan 警告。

## 7. 验证

```bash
docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
docker compose -f docker-compose.supabase.yml ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
```

所有常驻服务为 `(healthy)`（`createbuckets` 与 `supabase-db-ready` 执行完即退出，不在列表中）：

```text
SERVICE               STATUS                    PORTS
docs                  Up 36 seconds (healthy)   80/tcp, 8081/tcp
firecracker-runtime   Up 36 seconds (healthy)   8443/tcp
minio                 Up 35 seconds (healthy)   9000-9001/tcp
postgres              Up 2 minutes (healthy)    5432/tcp
qdrant                Up 35 seconds (healthy)   6333-6334/tcp
redis                 Up 36 seconds (healthy)   6379/tcp
reverse-proxy         Up 20 seconds (healthy)   0.0.0.0:44080->80/tcp, [::]:44080->80/tcp
server                Up 26 seconds (healthy)   3000/tcp
studio                Up 36 seconds (healthy)   80/tcp, 8080/tcp
worker                Up 25 seconds (healthy)   3000/tcp
SERVICE         STATUS                   PORTS
supabase-auth   Up 2 minutes (healthy)
supabase-kong   Up 2 minutes (healthy)   8001/tcp, 8443-8444/tcp, 0.0.0.0:44800->8000/tcp, [::]:44800->8000/tcp
```

（验证时入口端口被覆盖为 44080、Kong 为 44800；默认分别是 8080、8000。MinIO 控制台与 Qdrant 的 `127.0.0.1` 映射在该格式下不显示。）

检查入口、API、文档站与认证：

```bash
curl -s http://localhost:8080/healthz; echo
curl -s -w '\nHTTP %{http_code}\n' http://localhost:8080/api/v1/health
curl -s -o /dev/null -w 'documentation HTTP %{http_code}\n' http://localhost:8080/documentation/
curl -s -w '\nHTTP %{http_code}\n' http://localhost:8080/auth/v1/health
```

```text
ok
{"status":"ok","timestamp":"2026-10-01T13:46:51.783Z"}
HTTP 200
documentation HTTP 200
{"version":"v2.175.0","name":"GoTrue","description":"GoTrue is a user registration and authentication API"}
HTTP 200
```

浏览器打开 `http://<服务器>:8080/` 进入 Studio，`http://<服务器>:8080/documentation/` 进入本文档站。

## 8. 检查沙箱运行时

`firecracker-runtime` 启动日志中的预检结果（`docker compose logs firecracker-runtime`）：

```text
{"time":"2026-10-01T13:46:17.262452233Z","level":"INFO","msg":"Firecracker preflight passed","checks":{"architecture":"amd64","artifactDigest":"fad88d9d7a175314ede19373d52d9ee149adbc61b699a31ce2302bebb17cc1b0","binaries":"firecracker,jailer,ip,tc,nft","cgroup":"v2","guestAPIVersion":"v1","guestCIDR":"172.30.0.0/16","kernel":"7.2.6-1-cachyos","kvm":"read-write","pageSize":"4096","smt":"disabled","stateRoot":"/var/lib/agentloom-firecracker","tun":"read-write"},"warnings":["unsupported host kernel override enabled","host swap active by test-only override"]}
```

两条 `warnings` 来自验证用的覆盖变量。同一宿主不加覆盖时，runtime 预检失败并反复重启：

```text
"msg":"Firecracker preflight failed","error":"unsupported host kernel 7.2.6-1-cachyos; Firecracker v1.16.1 production baseline is 6.18.x"
```

此时第 6 步的 `docker compose up` 打印下面的警告后照常启动 server 与 worker，第 7 步的检查仍然通过，只有 sandbox 运行态的 Agent 不可用：

```text
level=warning msg="optional dependency \"firecracker-runtime\" failed to start: container fixlab-deploy-firecracker-runtime-1 is unhealthy"
```

满足宿主条件的服务器不需要这些覆盖；不打算使用沙箱时按 [不启用沙箱](/deploy/firecracker#不启用沙箱) 关闭 runtime。runtime 健康后，可以用 [Firecracker 沙箱](/deploy/firecracker#冒烟测试) 的冒烟脚本确认 microVM 能真正启动。

## 升级

拉取新代码后，在 `agentloom-deploy/` 下：

```bash
docker compose --profile tools build server-migrator
docker compose --profile tools run --rm server-migrator pnpm db:migrate
docker compose up -d --build
```

`server-migrator` 使用独立镜像（`SERVER_IMAGE` 加 `-migrator` 后缀），`run` 不会自动重建它，所以先 `build`。迁移输出以 `[✓] migrations applied successfully!` 结束；`up -d --build` 重建有变化的镜像并只重建受影响的容器。Firecracker 产物、`firecracker/artifact-lock.json` 或 `sandbox/package-lock.json` 有变化时，先重跑第 3 步。

### 从 `COMPOSE_PROJECT_NAME` 与无 profile 的旧版本升级

旧版 `.env.template` 用 `COMPOSE_PROJECT_NAME=agentloom-private` 同时命名两个 compose 文件，`firecracker-runtime` 也不在任何 profile 中。按以下顺序迁移已有部署的 `.env`（数据卷与网络名不变）：

1. 停掉旧 project 里的 Supabase 容器（新旧 Kong 会抢同一个端口）：

   ```bash
   docker compose -p agentloom-private -f docker-compose.supabase.yml down
   ```

2. 编辑 `.env`：删除 `COMPOSE_PROJECT_NAME` 一行，加入下面四行（project 名填原来的 `COMPOSE_PROJECT_NAME` 值，主栈的容器与数据卷因此保持原名）：

   ```dotenv
   AGENTLOOM_PROJECT_NAME=agentloom-private
   AGENTLOOM_SUPABASE_PROJECT_NAME=agentloom-supabase
   AGENTLOOM_NETWORK_PREFIX=agentloom
   COMPOSE_PROFILES=sandbox
   ```

   漏掉 `COMPOSE_PROFILES=sandbox` 时，`docker compose up` 不再管理 `firecracker-runtime`；不使用沙箱的宿主就把它留空。

3. 把 `MINIO_IMAGE`、`MC_IMAGE` 改成 `.env.template` 中的 `pgsty/*` 固定标签（旧默认的 `minio/minio`、`minio/mc` 已从 Docker Hub 下架）。
4. 重新启动两个栈：

   ```bash
   docker compose -f docker-compose.supabase.yml up -d --wait
   docker compose up -d --build
   ```

## 下一步

- [配置参考](/deploy/configuration)：调整 `.env`
- [自托管 Supabase](/deploy/supabase)：公网域名与 OAuth
- [反向代理](/deploy/reverse-proxy)：外层 TLS
- [备份与恢复](/deploy/backup-restore)：安装定时备份
