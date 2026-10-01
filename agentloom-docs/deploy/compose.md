---
docType: tutorial
---

# 用 Docker Compose 部署

按本页从一份仓库检出开始，在一台 Linux 服务器上跑起完整的 AgentLoom：Studio、API、文档站、自托管 Supabase 认证与 Firecracker 沙箱运行时。完成后 `http://<服务器>:8080/api/v1/health` 返回 200，`http://<服务器>:8080/documentation/` 打开本文档站。拓扑说明见 [部署拓扑](/deploy/)。

::: warning 验证记录
本页每条命令都在 2026-10-01 于一份 `git clone` 的仓库检出（提交 `b484e96f`）上按顺序执行过，输出原样粘贴。为了不与同一宿主上的其他服务冲突，验证时在 `agentloom-deploy/` 下的 `.env` 末尾追加了下列覆盖；页面中的命令与端口写的是默认值：

```dotenv
COMPOSE_PROJECT_NAME=docs-verify-deploydocs
NGINX_HTTP_PORT=42080
MINIO_CONSOLE_PORT=42901
QDRANT_HTTP_PORT=42333
SUPABASE_KONG_PORT=42800
SERVER_IMAGE=docs-verify-deploydocs/server:local
STUDIO_IMAGE=docs-verify-deploydocs/studio:local
DOCS_IMAGE=docs-verify-deploydocs/docs:local
FIRECRACKER_RUNTIME_IMAGE=docs-verify-deploydocs/firecracker-runtime:local
MINIO_IMAGE=pgsty/minio:latest
MC_IMAGE=pgsty/mc:latest
FIRECRACKER_ENV=test
FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL=true
FIRECRACKER_ALLOW_SWAP=true
```

因此输出中的 project 名、容器名、镜像名、端口与路径来自这些覆盖值。最后三行是因为验证宿主的内核为 `7.2.6-1-cachyos` 且开启了 swap，不满足 runtime 预检（见第 9 步与 [Firecracker 沙箱](/deploy/firecracker#宿主预检)）；`MINIO_IMAGE` / `MC_IMAGE` 的原因见第 8 步的已知问题。第 3、5 步还用了各自「已知问题」中的绕过。
:::

## 前置条件

- Linux x86_64 服务器，Docker Engine 与 Docker Compose v2、buildx。验证时为 Docker 29.8.1、Docker Compose 5.5.1。
- **可用的 KVM 与 Firecracker 宿主条件**。`server` 与 `worker` 在 compose 中依赖 `firecracker-runtime` 健康（`condition: service_healthy`），runtime 预检不通过时 server、worker 与入口都不会启动。宿主需要：可读写的 `/dev/kvm` 与 `/dev/net/tun`、cgroup v2、内核 `6.18.x`、关闭 swap、关闭 SMT（或设 `FIRECRACKER_SMT_POLICY=allow`）。完整条件见 [Firecracker 沙箱](/deploy/firecracker#宿主预检)。
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

✅ 密钥已生成并写入: /tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/.env

📋 生成的密钥摘要:
  DB 密码:              wQx5Qc...
  Redis 密码:           MKLaTJ...
  MinIO 密码:           y2PdZo...
  JWT Secret:           k4cPM5RiFf...
  Master Encryption:    R1m1vGw34u...
  Supabase Anon Key:    eyJhbGciOiJIUzI1NiIs...
  Supabase Service Key: eyJhbGciOiJIUzI1NiIs...

⚠ 请妥善保管此文件，切勿提交到版本控制！
⚠ 生产环境请修改 APP_FRONTEND_URL / APP_OAUTH_REDIRECT_URL / SUPABASE_GOTRUE_EXTERNAL_URL / SUPABASE_SITE_URL 为实际域名
```

`.env` 已存在时脚本拒绝覆盖并退出。公网部署按最后一行的提示修改域名，见 [配置参考](/deploy/configuration#公网地址)。

## 2. 生成 Firecracker mTLS 证书

```bash
./scripts/generate-firecracker-pki.sh
```

```text
Firecracker PKI 已生成: /tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/secrets/firecracker
Manager Secret: kubectl create secret generic agentloom-firecracker-manager-pki --from-file=/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/secrets/firecracker
Client Secret: kubectl create secret generic agentloom-firecracker-client-pki --from-file=manager-ca.crt=/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/secrets/firecracker/manager-ca.crt --from-file=app-client.crt=/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/secrets/firecracker/app-client.crt --from-file=app-client.key=/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/secrets/firecracker/app-client.key
```

`secrets/firecracker/` 下生成 manager、client、guest 三套 CA 及证书，共 12 个文件；`kubectl` 两行只用于 Helm，Compose 部署忽略。

## 3. 构建 Firecracker 产物

::: warning 已知问题：`npm ci` 缺少 lockfile
`agentloom-deploy/firecracker/build-artifacts.sh` 在 `agentloom-deploy/sandbox/` 中执行 `npm ci`，但该目录的 `package-lock.json` 被 `agentloom-deploy/sandbox/.gitignore` 忽略、不在仓库里。干净检出上脚本失败：

```text
npm error code EUSAGE
npm error
npm error The `npm ci` command can only install with an existing
npm error package-lock.json with lockfileVersion >= 1. Run an install with npm@5
npm error or later to generate a package-lock.json file, then try again.
```

验证时先生成 lockfile 再构建：

```bash
(cd sandbox && npm install --package-lock-only --ignore-scripts)
```

:::

```bash
./firecracker/build-artifacts.sh
```

脚本按 `firecracker/artifact-lock.json` 下载 Firecracker、内核源码与 BusyBox 并校验 SHA-256，构建 guest 侧程序、2 GiB ext4 rootfs、内核与 initramfs，写出清单。验证时耗时约 4 分钟，最后一行：

```text
Firecracker artifacts built at /tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/firecracker/artifacts
```

`firecracker/artifacts/` 会被第 8 步的 `firecracker-runtime` 镜像复制进去，缺少它时该镜像构建失败。

## 4. 创建共享网络

主 Compose 与 Supabase Compose 都把 `supabase-shared` 声明为 external 网络，它们不会自己创建：

```bash
docker network create supabase-shared
```

输出是新网络的 ID，例如：

```text
25d970c0b12fed767040e6ed25ec67a22ff20d5566ed853c23bcb51e866a7ab9
```

## 5. 初始化数据库（第一次）

`./scripts/init-db.sh` 依次执行：检查 `docker/.pi-tarballs`、构建 server 镜像、启动 `postgres`、创建 Supabase 所需的角色与 `auth` schema、用 `server-migrator` 执行 `pnpm db:migrate`。在空数据库上本次运行的迁移会失败，这是预期结果，原因与处理在第 6、7 步。

::: warning 已知问题：init-db.sh 与 server 镜像构建
以下三处在干净检出上阻断本步，验证时用了列出的绕过。绕过 2、3 修改了已跟踪文件，只用于本机构建，不要提交。

1. **`check_pi_tarballs` 触发 `prepare-pi-tarballs.sh` 失败。** `agentloom-deploy/scripts/init-db.sh` 在 `docker/.pi-tarballs` 为空时运行 `agentloom-deploy/scripts/prepare-pi-tarballs.sh`，后者在锁定的 pi 提交上构建失败：

   ```text
   src/providers/kimi-coding.ts(5,36): error TS2307: Cannot find module './kimi-coding.models.ts' or its corresponding type declarations.
   ```

   `agentloom-deploy/docker/server.Dockerfile` 不使用这些 tarball（server 依赖 npm 上的 `@earendil-works/pi-*`）。绕过：放一个占位文件让检查通过。

   ```bash
   mkdir -p docker/.pi-tarballs && touch docker/.pi-tarballs/.placeholder
   ```

2. **pnpm 未锁定版本。** 根 `package.json` 没有 `packageManager` 字段，镜像里的 `corepack enable` 取到 pnpm 12.8.1，`RUN pnpm build` 失败：

   ```text
   Error: ERR_PNPM_OUTDATED_LOCKFILE
     × installing dependencies
     ╰─▶ Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up
         to date with package.json.
           Failure reason:
           the lockfile records `importers["agentloom-studio"]`, but that
         project's directory or package.json is missing
   ```

   绕过：在仓库根 `package.json` 加 `"packageManager": "pnpm@10.14.0"`。

3. **`nest build` 声明文件报错。** 锁定 pnpm 后，`RUN pnpm build` 仍失败：

   ```text
   src/common/pipes/zod-validation.pipe.ts:3:14 - error TS2742: The inferred type of 'ZodValidationPipe' cannot be named without a reference to '../../../../node_modules/nestjs-zod/dist/dto-BYMDb-k9.cjs'. This is likely not portable. A type annotation is necessary.
   ```

   绕过：在 `agentloom-server/tsconfig.build.json` 加 `"compilerOptions": { "declaration": false }`。
:::

```bash
./scripts/init-db.sh
```

输出（省略镜像构建日志）以迁移失败结束：

```text
✓ .pi-tarballs 目录存在且非空
构建 server 镜像（server/worker 共用镜像）...
启动 PostgreSQL ...
 Network agentloom-app Created
 Network agentloom-data Created
 Container docs-verify-deploydocs-postgres-1 Started
为 vanilla PostgreSQL 初始化 Supabase 兼容角色、auth schema 与 auth.users ...
DO
GRANT
CREATE SCHEMA
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
执行数据库迁移...
> agentloom-server@0.0.1 db:migrate /build/agentloom-server
> drizzle-kit migrate
No config path provided, using default 'drizzle.config.ts'
Reading config file '/build/agentloom-server/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...[⣷] applying migrations... ELIFECYCLE  Command failed with exit code 1.
```

drizzle-kit 没有打印失败的语句。直接用 drizzle 迁移器执行时，错误是：

```text
ALTER TABLE "users" ADD CONSTRAINT "users_supabase_user_id_users_id_fk" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
params:  relation "auth.users" does not exist
```

`auth.users` 由 GoTrue 首次启动时创建，下一步启动它。此时 `postgres` 已运行，角色与 `auth` schema 已就绪。

## 6. 启动 Supabase 认证栈

```bash
docker compose -f docker-compose.supabase.yml up -d
```

```text
time="2026-10-01T17:56:20+08:00" level=warning msg="Found orphan containers (docs-verify-deploydocs-postgres-1) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up."
 Container docs-verify-deploydocs-supabase-db-ready-1 Started
 Container docs-verify-deploydocs-supabase-db-ready-1 Exited
 Container docs-verify-deploydocs-supabase-auth-1 Started
 Container docs-verify-deploydocs-supabase-auth-1 Healthy
 Container docs-verify-deploydocs-supabase-kong-1 Started
```

orphan 警告来自两个 compose 文件共用 `.env` 中的 `COMPOSE_PROJECT_NAME`，不影响运行，不要加 `--remove-orphans`（原因见 [自托管 Supabase](/deploy/supabase#一个-compose-project)）。`supabase-auth` 显示 `Healthy` 即 GoTrue 已在 `auth` schema 建表。

## 7. 初始化数据库（第二次）

```bash
./scripts/init-db.sh
```

镜像已构建，本次只需几秒。输出中有若干 PostgreSQL `NOTICE`（标识符超过 63 字符被截断），以下面两行结束：

```text
[✓] migrations applied successfully!跳过种子数据导入（RUN_DB_SEED=false）。
数据库初始化完成。
```

需要导入模板等种子数据时，把 `.env` 中的 `RUN_DB_SEED` 改为 `true` 后再运行一次本步。

## 8. 启动全部服务

::: warning 已知问题：MinIO 镜像拉取被拒
`MINIO_IMAGE` 与 `MC_IMAGE` 的默认值 `minio/minio:RELEASE.2025-02-28T09-55-16Z`、`minio/mc:RELEASE.2025-05-21T01-59-54Z` 在验证宿主上拉取失败：

```text
Error response from daemon: pull access denied for minio/minio, repository does not exist or may require 'docker login': denied: requested access to the resource is denied
Error response from daemon: pull access denied for minio/mc, repository does not exist or may require 'docker login': denied: requested access to the resource is denied
```

`quay.io/minio/minio` 与 `quay.io/minio/mc` 同一时间返回 `unauthorized: access to the requested resource is not authorized`。验证时在 `.env` 中改用 `MINIO_IMAGE=pgsty/minio:latest` 与 `MC_IMAGE=pgsty/mc:latest`（镜像内有 `/bin/sh` 与 `curl`，满足 compose 健康检查与 `createbuckets` 的入口脚本）。你的宿主能拉取默认镜像时不需要改。
:::

```bash
docker compose up -d --build
```

本步构建 studio、docs、firecracker-runtime 镜像并启动所有服务，验证时耗时约 1 分 40 秒。输出末尾（省略构建日志与重复行）：

```text
 Container docs-verify-deploydocs-firecracker-runtime-1 Healthy
 Container docs-verify-deploydocs-minio-1 Healthy
 Container docs-verify-deploydocs-createbuckets-1 Started
 Container docs-verify-deploydocs-redis-1 Healthy
 Container docs-verify-deploydocs-worker-1 Started
 Container docs-verify-deploydocs-server-1 Started
 Container docs-verify-deploydocs-studio-1 Healthy
 Container docs-verify-deploydocs-docs-1 Healthy
 Container docs-verify-deploydocs-server-1 Healthy
 Container docs-verify-deploydocs-reverse-proxy-1 Started
```

## 9. 验证

```bash
docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
```

所有常驻服务为 `(healthy)`（`createbuckets` 与 `supabase-db-ready` 执行完即退出，不在列表中）：

```text
SERVICE               STATUS                    PORTS
docs                  Up 36 seconds (healthy)   80/tcp, 8081/tcp
firecracker-runtime   Up 35 seconds (healthy)   8443/tcp
minio                 Up 35 seconds (healthy)   9000-9001/tcp
postgres              Up 4 minutes (healthy)    5432/tcp
qdrant                Up 35 seconds (healthy)   6333-6334/tcp
redis                 Up 35 seconds (healthy)   6379/tcp
reverse-proxy         Up 23 seconds (healthy)   0.0.0.0:42080->80/tcp, [::]:42080->80/tcp
server                Up 29 seconds (healthy)   3000/tcp
studio                Up 35 seconds (healthy)   80/tcp, 8080/tcp
supabase-auth         Up 2 minutes (healthy)
supabase-kong         Up 2 minutes (healthy)    8001/tcp, 8443-8444/tcp, 0.0.0.0:42800->8000/tcp, [::]:42800->8000/tcp
worker                Up 29 seconds (healthy)   3000/tcp
```

（验证时入口端口被覆盖为 42080、Kong 为 42800；默认分别是 8080、8000。MinIO 控制台与 Qdrant 的 `127.0.0.1` 映射在该格式下不显示。）

检查入口、API、文档站与认证：

```bash
curl -s http://localhost:8080/healthz; echo
curl -s -w '\nHTTP %{http_code}\n' http://localhost:8080/api/v1/health
curl -s -o /dev/null -w 'documentation HTTP %{http_code}\n' http://localhost:8080/documentation/
curl -s -w '\nHTTP %{http_code}\n' http://localhost:8080/auth/v1/health
```

```text
ok
{"status":"ok","timestamp":"2026-10-01T09:59:06.908Z"}
HTTP 200
documentation HTTP 200
{"version":"v2.175.0","name":"GoTrue","description":"GoTrue is a user registration and authentication API"}
HTTP 200
```

浏览器打开 `http://<服务器>:8080/` 进入 Studio，`http://<服务器>:8080/documentation/` 进入本文档站。

`firecracker-runtime` 启动日志中的预检结果（`docker compose logs firecracker-runtime`）：

```text
{"time":"2026-10-01T09:58:33.244459748Z","level":"INFO","msg":"Firecracker preflight passed","checks":{"architecture":"amd64","artifactDigest":"0d12f98b5fb50003c23b25b097e28164ab79ac620a66ab9f4b59aadcd5e9098a","binaries":"firecracker,jailer,ip,tc,nft","cgroup":"v2","guestAPIVersion":"v1","guestCIDR":"172.30.0.0/16","kernel":"7.2.6-1-cachyos","kvm":"read-write","pageSize":"4096","smt":"disabled","stateRoot":"/var/lib/agentloom-firecracker","tun":"read-write"},"warnings":["unsupported host kernel override enabled","host swap active by test-only override"]}
```

两条 `warnings` 来自验证用的覆盖变量。同一宿主不加覆盖时，runtime 退出并打印：

```text
{"level":"ERROR","msg":"Firecracker preflight failed","error":"unsupported host kernel 7.2.6-1-cachyos; Firecracker v1.16.1 production baseline is 6.18.x"}
```

只放开内核版本时为：

```text
{"level":"ERROR","msg":"Firecracker preflight failed","error":"host swap must be disabled"}
```

（以上两行省略了 `time` 字段。）满足宿主条件的服务器不需要这些覆盖。runtime 健康后，可以用 [Firecracker 沙箱](/deploy/firecracker#冒烟测试) 的冒烟脚本确认 microVM 能真正启动。

## 升级

拉取新代码后，在 `agentloom-deploy/` 下：

```bash
docker compose --profile tools build server-migrator
docker compose --profile tools run --rm server-migrator pnpm db:migrate
docker compose up -d --build
```

`server-migrator` 使用独立镜像（`SERVER_IMAGE` 加 `-migrator` 后缀），`run` 不会自动重建它，所以先 `build`。迁移输出以 `[✓] migrations applied successfully!` 结束；`up -d --build` 重建有变化的镜像并只重建受影响的容器。Firecracker 产物或 `firecracker/artifact-lock.json` 有变化时，先重跑第 3 步。

## 下一步

- [配置参考](/deploy/configuration)：调整 `.env`
- [自托管 Supabase](/deploy/supabase)：公网域名与 OAuth
- [反向代理](/deploy/reverse-proxy)：外层 TLS
- [备份与恢复](/deploy/backup-restore)：安装定时备份
