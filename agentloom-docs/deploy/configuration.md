---
docType: reference
---

# 配置参考

部署配置分三层：Compose 读取的 `.env`（位于 `agentloom-deploy/`）、server 进程启动时校验的环境变量、Studio 镜像在容器启动时替换的浏览器变量。三张变量表由 `scripts/docs-reference/generate.ts` 从定义处生成；表后是表格表达不了的规则。

## 变量如何进入容器

- `agentloom-deploy/` 下的 `.env` 由 `./scripts/generate-secrets.sh` 从 `agentloom-deploy/.env.template` 复制并填入随机密钥。Compose 在 `agentloom-deploy/` 下运行时自动读取它，用于插值 `docker-compose.yml` 与 `docker-compose.supabase.yml` 中的 `${KEY:-默认值}`。
- 容器只收到 compose 文件 `environment:` 中列出的变量。server 与 worker 共用 `agentloom-deploy/docker-compose.yml` 顶部的 `x-server-app` 环境块；server 环境变量表中未出现在该块里的变量，写进 `.env` 也不会到达容器。
- `APP_SANDBOX_CALLBACK_BASE_URL` 在 Compose 中按服务分别取值：server 用 `APP_SANDBOX_CALLBACK_BASE_URL_SERVER`（默认 `http://server:3000/api/v1`），worker 用 `APP_SANDBOX_CALLBACK_BASE_URL_WORKER`（默认 `http://worker:3000/api/v1`）。沙箱回调必须回到创建该会话的进程，两个值不能相同。
- `APP_FIRECRACKER_RUNTIME_CA`、`APP_FIRECRACKER_RUNTIME_CERT`、`APP_FIRECRACKER_RUNTIME_KEY` 在 Compose 中写死为 `/run/secrets/firecracker-*` 路径，对应的宿主文件由 `FIRECRACKER_*_FILE` 变量选择，默认是 `./scripts/generate-firecracker-pki.sh` 在 agentloom-deploy/secrets/firecracker/ 下生成的文件（该目录不入库）。
- `docker-compose.yml` 中还有一些只在 compose 文件内带默认值、模板里没有的插值变量（例如 `FIRECRACKER_ENV`、`FIRECRACKER_RUNTIME_CPU_LIMIT`、各 `FIRECRACKER_*_FILE`），列在下方部署环境变量表的末尾。
- Helm 用 `values.yaml` 的 `env.shared` / `env.server` / `env.studio` 渲染 ConfigMap 与 Secret，键名与下表相同，见 [Helm 部署](/deploy/helm)。

## 部署环境变量（`.env`）

<!--@include: ../_generated/env-deploy.md-->

## server 环境变量

<!--@include: ../_generated/env-server.md-->

## Studio 环境变量

<!--@include: ../_generated/env-studio.md-->

## 规则

### 部署模式与 Supabase

`APP_DEPLOYMENT_MODE` 取 `saas` 或 `private`。`agentloom-server/src/config/env.schema.ts` 的 `superRefine` 在启动时检查 `APP_SUPABASE_URL`、`APP_SUPABASE_ANON_KEY`、`APP_SUPABASE_SERVICE_KEY` 三个变量：

| 模式 | 规则 | 不满足时 |
| --- | --- | --- |
| `saas` | 三个都必须非空 | 启动校验失败，进程退出 |
| `private` | 三个全部留空，或全部提供 | 只提供一部分时校验失败，报错含「private 部署模式下 APP_SUPABASE_* 必须全部省略或全部提供」 |

`private` 模式下三者全空时 server 能启动，但邮箱注册、登录会返回认证不可用错误。`./scripts/generate-secrets.sh` 会把三者填为自托管 Supabase 的值（`APP_SUPABASE_URL=http://supabase-kong:8000`），见 [自托管 Supabase](/deploy/supabase)。

`APP_DEPLOYMENT_MODE` 还影响 `/api/v1/sandbox-nodes`：`private` 模式下 owner/admin 都可管理节点；`saas` 模式下租户 ID 还必须在 `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` 中，留空即全部返回 403。

### JWT 密钥

`SUPABASE_JWT_SECRET`（GoTrue 签发令牌用）必须等于 `APP_JWT_SECRET`（server 的 HTTP 与 WebSocket 守卫校验令牌用）。两者不同时，GoTrue 签发的令牌在 server 侧校验失败。`./scripts/generate-secrets.sh` 生成 `.env` 时把两者写成同一个值。

### 密钥格式

- `APP_MASTER_ENCRYPTION_KEY` 必须是 32 字节的 Base64，生成命令 `openssl rand -base64 32`。
- `POSTGRES_PASSWORD` 只用字母和数字：它被原样拼进 `APP_DATABASE_URL`，特殊字符会破坏 URL。`./scripts/generate-secrets.sh` 生成 20 位字母数字密码。
- 修改 `POSTGRES_PASSWORD`、`REDIS_PASSWORD` 时同步修改 `APP_DATABASE_URL`、`APP_REDIS_URL` 中的密码；`APP_MINIO_SECRET_KEY` 同时用作 MinIO 的 root 密码。

### 公网地址

保留 `localhost` 时，OAuth 回调和邮件链接会跳回访问者本机。公网部署把下列变量改成实际的 HTTPS 域名：

| 变量 | 形如 |
| --- | --- |
| `APP_FRONTEND_URL` | `https://agentloom.example.com` |
| `APP_OAUTH_REDIRECT_URL` | `https://agentloom.example.com/api/v1/auth/oauth/callback` |
| `SUPABASE_SITE_URL` | `https://agentloom.example.com` |
| `SUPABASE_GOTRUE_EXTERNAL_URL` | GoTrue 对外地址，见 [自托管 Supabase](/deploy/supabase) |
| `APP_MINIO_PUBLIC_URL` | `https://agentloom.example.com`（Compose 留空时取 `APP_FRONTEND_URL`） |

`APP_MINIO_PUBLIC_URL` 是浏览器打开预签名下载链接（知识库「查看原文」、证据导出下载）的地址。签名包含主机名，server 用这个地址签名，链接才能在浏览器里打开；Compose 的 `reverse-proxy` 把 `/agentloom-documents/`（bucket 名）转给 MinIO，因此它与 Studio 入口同源，只能写 `协议://主机[:端口]`，不能带路径。Helm 在 `minio.enabled` 与 `ingress.enabled` 时留空即取 Ingress 主机，并在 Ingress 中加 `/<bucket>` 路由。修改 `APP_MINIO_BUCKET` 时同步修改 `agentloom-deploy/nginx.conf` 中该 location 的路径。未设置（本地开发）时沿用 `APP_MINIO_ENDPOINT`。

### 来源 IP 与可信代理

server 用 `APP_TRUST_PROXY_HOPS` 判断请求的来源 IP：它是 server 前方可信反向代理的层数，server 从 `X-Forwarded-For` 末尾跳过这么多层代理追加的地址，取到的就是客户端地址。调用方自己写在 `X-Forwarded-For` 前面的值不会被采信。Webhook 的 IP 白名单与匿名请求的限流都按这个地址判断。

| 部署方式 | 值 |
| --- | --- |
| 本地直连 server（`pnpm start:dev`） | `0`（server 默认值） |
| Compose，只有自带的 `reverse-proxy` | `1`（`.env.template` 与 `docker-compose.yml` 的默认值） |
| Compose，宿主上再套一层终止 TLS 的代理（见 [反向代理](/deploy/reverse-proxy)） | `2` |
| Helm，Ingress Controller 直连 server | `1`（`values.yaml` 的默认值） |

值小于实际代理层数时，来源 IP 是某一层代理的地址，配置了 IP 白名单的 Webhook 会对所有调用返回 403；值大于实际层数时，调用方可以伪造来源 IP。

### Agent 对话执行并发

`APP_AGENT_CONVERSATION_CONCURRENCY`（默认 `10`）是单个 server 或 worker 进程同时执行的 Agent 对话数。server 与 worker 都消费对话执行队列，Compose 默认部署的总并发是两者之和 20；Helm 按副本数累加。对话超过总并发时，新对话的 run 保持 `queued`，直到有对话结束本轮。同一对话的 run 始终串行（对外 API 上一个 run 未结束时返回 409 `conversation-busy`），与这个值无关。

提高之前按两点估算：每个进行中的对话在进程内持有一个 Agent 会话，进程内存限额（Compose 默认 2G）要容纳得下；所有对话共用模型供应商的并发与速率配额。

### Gate 5 浏览器验收

生成应用的 Gate 5 由独立服务 `generated-app-browser-runner` 执行。四个变量的读取方不同：

| 变量 | 读取方 | 默认 | 作用 |
| --- | --- | --- | --- |
| `APP_GENERATED_APP_BROWSER_BASE_URL` | browser-runner（必填） | Compose `http://reverse-proxy`；Helm 取 `http(s)://<ingress.host>` | runner 打开 `<基址>/generated-apps/public/<验收令牌>`，也就是终端用户使用的 Studio 公开页。该地址必须让 Studio 与 `/api/v1` 同源 |
| `APP_GENERATED_APP_BROWSER_CONCURRENCY` | browser-runner | `1` | 每个 runner 进程同时执行的验收任务数。每个任务启动一个 Chromium，约占 1GB 内存，调大前要同步调大容器内存限额（Compose 默认 2G） |
| `APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS` | worker | `180000` | 单个场景 × 视口的时限，包含被绑定工作流或 Agent 的执行时间 |
| `APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS` | worker | `900000` | 一次验收任务的总时限。worker 最多等待该值再加 30 秒，验收令牌在该值再加 60 秒后过期 |

runner 只读取 Redis、对象存储和上面两个 runner 变量，不需要也不应配置数据库连接串、`APP_JWT_SECRET` 或 `APP_MASTER_ENCRYPTION_KEY`。runner 未运行或连的不是同一个 Redis 时，生成应用的 Gate 5 会立即失败，失败码为 `gate-5-browser-runner-unavailable`。

生成应用的产物都写在 `APP_MINIO_BUCKET` 的 `tenants/<租户 id>/generated-apps/<应用 id>/` 前缀下：Gate 3 工作区文件（`runs/<运行 id>/gate-3/`，server 或 worker 写入）和 Gate 5 截图与 trace（`runs/<运行 id>/gate-5/`，runner 写入）。生成队列由 server 与 worker 共同消费，产物不落进程本地磁盘，不需要共享卷，容器重启也不会丢失。删除应用时先删除整个前缀，对象存储不可用时删除接口返回 503，应用保留，可稍后重试。

### Studio 运行时变量

Studio 镜像（`agentloom-deploy/docker/studio.Dockerfile`）构建时把四个 Vite 变量设为占位符，容器启动时由 `/docker-entrypoint.d/40-runtime-env.sh` 在 `/usr/share/nginx/html` 下所有 `.html`、`.js`、`.css` 文件中替换：

| 占位符 | 替换为 | 未设置时 |
| --- | --- | --- |
| `__VITE_API_BASE_URL__` | `VITE_API_BASE_URL` | `/api/v1` |
| `__VITE_AUTOSAVE_DEBOUNCE_MS__` | `VITE_AUTOSAVE_DEBOUNCE_MS` | `2000` |
| `__VITE_SUPABASE_URL__` | `VITE_SUPABASE_URL` | 空 |
| `__VITE_SUPABASE_ANON_KEY__` | `VITE_SUPABASE_ANON_KEY` | 空 |

因此改这些变量只需重建容器（`docker compose up -d studio`），不需要重新构建镜像。`VITE_SUPABASE_URL` 为空时，浏览器端回退到当前站点 origin，经入口的 `/auth/` 访问 Kong（`agentloom-studio/src/shared/lib/supabase.ts`）。新增浏览器运行时变量需要同时改 Dockerfile 的 build arg、替换脚本、compose `x-studio-app` 环境块与 `agentloom-deploy/.env.template`。

## 相关

- [Docker Compose 部署](/deploy/compose)
- [Firecracker 沙箱](/deploy/firecracker)：`FIRECRACKER_*` 变量的作用与预检
- [备份与恢复](/deploy/backup-restore)：备份脚本读取的变量
