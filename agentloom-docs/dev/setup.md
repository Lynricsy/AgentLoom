---
docType: tutorial
---

# 搭建本地开发环境

本教程从一份干净的检出开始，在本机跑起 server（`http://localhost:3000`）与 Studio（`http://localhost:5173`），并注册第一个账号。依赖服务（PostgreSQL、Redis、MinIO、Qdrant、自托管 Supabase 认证）全部用 Docker 运行，server 与 Studio 在宿主机上以开发模式运行，改代码即时生效。

## 前置条件

- Node.js 22 与 corepack（随 Node 22 发行），用于启用 pnpm。pnpm 版本由根 `package.json` 的 `packageManager` 字段固定为 `pnpm@10.34.6`，`corepack enable` 后自动使用该版本；不用 corepack 时自行安装 pnpm ≥ 10.26（`pnpm-workspace.yaml` 的 `allowBuilds` 从 10.26 起才生效，更早的版本会跳过 esbuild、`@swc/core`、tree-sitter 等依赖的构建脚本）。
- Docker 24 及以上，带 Compose v2 插件（`docker compose version` 有输出）。
- `openssl` 与 `curl`。
- 本机端口 3000、5173、5432、6379、9000、6333、6334、8000 空闲（Qdrant 与 Studio 的端口可覆盖，见第 3、9 步）。

以下命令都在仓库根目录执行，除非步骤中先 `cd` 到某个包。本教程选择 `APP_DEPLOYMENT_MODE=private`（私有部署模式），本地不需要连接任何外部 SaaS 服务。

## 1. 安装 JS 依赖

整个仓库只在根目录安装一次，workspace 成员共用：

```bash
corepack enable
pnpm install
```

最后一行形如：

```text
Done in 6.1s using pnpm v10.34.6
```

安装过程中 `agentloom-contracts`、`agentloom-api-client`、`agentloom-plugin-sdk` 会被构建，server 与 Studio 依赖它们的产物。

## 2. 生成本地密钥

部署脚本可以一次生成数据库密码、JWT 密钥、加密主密钥和 Supabase 的 anon/service key（后两者用 JWT 密钥签发，必须配套）：

```bash
./agentloom-deploy/scripts/generate-secrets.sh
```

```text
🔐 正在生成密钥...

✅ 密钥已生成并写入: /path/to/AgentLoom/agentloom-deploy/.env
```

输出中的路径是你的仓库所在位置；脚本随后打印各密钥的前几位摘要。文件已存在时脚本拒绝覆盖并退出，需要重新生成就先删除它。

后续步骤从这个文件取值。在同一个终端里定义一个取值函数（用绝对路径，`cd` 到子目录后仍可用）：

```bash
DEPLOY_ENV="$PWD/agentloom-deploy/.env"
get() { grep "^$1=" "$DEPLOY_ENV" | cut -d= -f2-; }
```

不要 `source` 整个部署 `.env`：其中的 `APP_*` 指向容器主机名，进入 shell 环境后会覆盖 server 自己的 `.env`。

## 3. 启动 PostgreSQL、Redis、MinIO 与 Qdrant

PostgreSQL 必须挂在 `supabase-shared` 网络上并带别名 `postgres`，下一步的 Supabase 认证服务按这个名字连接数据库：

```bash
docker network create supabase-shared

docker run -d --name agentloom-local-postgres \
  --network supabase-shared --network-alias postgres \
  -e POSTGRES_USER=agentloom -e POSTGRES_DB=agentloom \
  -e POSTGRES_PASSWORD="$(get POSTGRES_PASSWORD)" \
  -p 5432:5432 postgres:16-alpine

docker run -d --name agentloom-local-redis -p 6379:6379 redis:7-alpine

docker run -d --name agentloom-local-minio -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  pgsty/minio:RELEASE.2026-08-04T00-00-00Z server /data

docker compose -f docker-compose.dev.yml up -d
```

`docker-compose.dev.yml` 只定义 Qdrant，宿主端口默认 6333/6334，被占用时用环境变量覆盖：

```bash
QDRANT_HTTP_PORT=16333 QDRANT_GRPC_PORT=16334 docker compose -f docker-compose.dev.yml up -d
```

MinIO 使用 server 的默认凭据 `minioadmin`，所以 server 的 `.env` 不需要再写 MinIO 配置。MinIO 官方 Docker Hub 镜像已下架，这里与部署模板一样使用 Pigsty 维护的社区构建 `pgsty/minio`，并固定 RELEASE 标签。

检查：

```bash
docker ps --format '{{.Names}} {{.Status}}'
```

列出 `agentloom-local-postgres`、`agentloom-local-redis`、`agentloom-local-minio` 与 Qdrant 容器，状态均为 `Up`。

## 4. 为 Supabase 认证准备数据库

Supabase 认证服务（GoTrue）与 AgentLoom 的迁移都需要 Supabase 约定的角色与 `auth` schema。原版 PostgreSQL 没有它们，先创建（与 `agentloom-deploy/scripts/init-db.sh` 中的引导 SQL 相同）：

```bash
docker exec -i agentloom-local-postgres psql -v ON_ERROR_STOP=1 -U agentloom -d agentloom <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres LOGIN SUPERUSER;
  END IF;
END
$$;

GRANT ALL ON DATABASE agentloom TO supabase_auth_admin;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO agentloom, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO agentloom, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON FUNCTIONS TO agentloom, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO agentloom, anon, authenticated, service_role;
SQL
```

```text
DO
GRANT
CREATE SCHEMA
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
```

## 5. 启动 Supabase 认证服务

即使是私有部署模式，注册与登录也经过 Supabase 认证（server 在 Supabase 配置缺失时拒绝认证请求）。启动 GoTrue 与 Kong 网关：

```bash
docker compose -f agentloom-deploy/docker-compose.supabase.yml --env-file agentloom-deploy/.env up -d
```

GoTrue 首次启动时在 `auth` schema 中建表，之后 AgentLoom 的迁移会引用 `auth.users`，所以这一步必须在迁移之前。检查 Kong 转发到 GoTrue：

```bash
curl -s http://localhost:8000/auth/v1/health
```

```json
{"version":"v2.175.0","name":"GoTrue","description":"GoTrue is a user registration and authentication API"}
```

## 6. 配置 server

server 启动时用 `agentloom-server/src/config/env.schema.ts` 校验环境变量，缺少必填项会直接退出。全部变量及默认值见 [配置参考](/deploy/configuration)，样例文件是 `agentloom-server/.env.example`。本地只需写下必填项和认证配置：

```bash
cd agentloom-server
cat > .env <<EOF
APP_DEPLOYMENT_MODE=private
APP_DATABASE_URL=postgresql://agentloom:$(get POSTGRES_PASSWORD)@localhost:5432/agentloom
APP_REDIS_URL=redis://localhost:6379
APP_JWT_SECRET=$(get APP_JWT_SECRET)
APP_MASTER_ENCRYPTION_KEY=$(get APP_MASTER_ENCRYPTION_KEY)
APP_OAUTH_REDIRECT_URL=http://localhost:3000/api/v1/auth/oauth/callback
APP_FRONTEND_URL=http://localhost:5173
APP_SUPABASE_URL=http://localhost:8000
APP_SUPABASE_ANON_KEY=$(get APP_SUPABASE_ANON_KEY)
APP_SUPABASE_SERVICE_KEY=$(get APP_SUPABASE_SERVICE_KEY)
EOF
```

各项的含义：

| 变量 | 说明 |
| --- | --- |
| `APP_DATABASE_URL` | 第 3 步的 PostgreSQL |
| `APP_REDIS_URL` | 第 3 步的 Redis，BullMQ 与 Socket.IO adapter 共用 |
| `APP_JWT_SECRET` | 必须与 GoTrue 使用的 `SUPABASE_JWT_SECRET` 相同，server 用它校验 Supabase 签发的 access token |
| `APP_MASTER_ENCRYPTION_KEY` | Base64 编码、解码后恰好 32 字节；脚本用 `openssl rand -base64 32` 生成 |
| `APP_OAUTH_REDIRECT_URL`、`APP_FRONTEND_URL` | OAuth 回调地址与 Studio 地址（也用于 CORS） |
| `APP_DEPLOYMENT_MODE` | `private` 时三项 `APP_SUPABASE_*` 要么全填要么全空；全空则无法登录 |
| `APP_SUPABASE_URL`、`APP_SUPABASE_ANON_KEY`、`APP_SUPABASE_SERVICE_KEY` | 第 5 步的 Kong 地址与脚本生成的 key |

## 7. 建表并写入种子数据

```bash
pnpm db:migrate
```

drizzle-kit 自动读取当前目录的 `.env`。最后一行：

```text
[✓] migrations applied successfully!
```

种子脚本不读 `.env`，先把它导入当前 shell：

```bash
set -a; . ./.env; set +a
pnpm db:seed
```

输出中依次出现 `Seeding LLM providers...`、`Seeding workflow templates...`、`Seeding routing benchmarks...`、`Seeding skills...`，每段以 `Done —` 开头的一行结束。

## 8. 启动 server

```bash
pnpm start:dev
```

编译完成后日志出现：

```text
[Nest] LOG [NestApplication] Nest application successfully started
```

另开一个终端检查健康：

```bash
curl -s http://localhost:3000/api/v1/health
```

```json
{"status":"ok","timestamp":"2026-10-01T10:05:03.894Z"}
```

Swagger UI 在 `http://localhost:3000/docs`。

## 9. 启动 Studio 并注册账号

另开一个终端，在仓库根：

```bash
cd agentloom-studio
cp .env.example .env
sed -i "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=http://localhost:8000|" .env
sed -i "s|^VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=$(grep '^APP_SUPABASE_ANON_KEY=' ../agentloom-deploy/.env | cut -d= -f2-)|" .env
pnpm dev
```

```text
  VITE v8.2.2  ready in 193 ms

  ➜  Local:   http://localhost:5173/
```

Vite 把 `/api` 与 `/socket.io` 代理到 `http://localhost:3000`（`agentloom-studio/vite.config.ts`）。端口 5173 被占用或 server 不在 3000 时，在 Studio 目录的 `.env` 中修改 `STUDIO_DEV_PORT` 与 `STUDIO_DEV_API_TARGET`（`cp .env.example .env` 已带上默认值），它们只影响开发服务器，不进入构建产物。

浏览器打开 `http://localhost:5173/register`，页面标题「创建账号」，填写「邮箱」「密码」「确认密码」（密码至少 8 位，含大写字母、小写字母与数字），点击「注册」。表单提交到 `POST /api/v1/auth/register`；本地 GoTrue 开启了自动确认，不需要确认邮件。用 curl 调同一个接口可以直接看到结果：

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"dev@example.com","password":"DevPassw0rd"}'
```

响应以 `{"data":{"user":{"id":` 开头，包含 `user` 与 `tokens` 两部分，说明账号已在 Supabase 与 AgentLoom 中创建。

随后在 `http://localhost:5173/login` 用该账号登录。登录成功后进入 `/onboarding`，页面显示「欢迎使用 AgentLoom」。浏览器直连 Kong（`http://localhost:8000`）时，supabase-js 的 CORS 预检会带 `x-supabase-api-version` 头，`agentloom-deploy/supabase/kong.yml` 的 cors 插件已放行该头。

## 可选：不使用沙箱运行 Agent

Agent 的 `sandbox` 运行态需要 Firecracker 运行时（KVM 宿主机、PKI 证书），本地开发通常不具备。创建 Agent 时选择 `no_sandbox` 运行态，Agent 在 server 进程内运行，不需要任何沙箱组件；两种运行态的区别见 [核心概念](/dev/concepts)。需要在本地验证沙箱时，按 [Firecracker 部署](/deploy/firecracker) 准备宿主机。

## 停止与清理

```bash
docker compose -f agentloom-deploy/docker-compose.supabase.yml --env-file agentloom-deploy/.env down
docker compose -f docker-compose.dev.yml down
docker rm -f agentloom-local-postgres agentloom-local-redis agentloom-local-minio
docker network rm supabase-shared
```

数据库数据保存在 `agentloom-local-postgres` 容器内，删除容器即清空；下次从第 3 步重新开始。

## 下一步

- [系统架构](/dev/architecture)：一个请求和一次运行经过哪些组件。
- [运行与编写测试](/dev/testing)：提交前要跑的命令。
