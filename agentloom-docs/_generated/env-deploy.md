<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-deploy/.env.template`（Docker Compose 部署的变量合同；`agentloom-deploy/scripts/generate-secrets.sh` 复制它生成 `.env` 并填充密钥）。说明取自变量上方注释。

| 变量 | 模板值 | 说明 |
| --- | --- | --- |
| `AGENTLOOM_PROJECT_NAME` | `agentloom-private` | 两个 compose 文件各自的 project 名。不要设置 COMPOSE_PROJECT_NAME： 它优先于文件内的 name:，会把主栈与 Supabase 栈并进同一个 project。 |
| `AGENTLOOM_SUPABASE_PROJECT_NAME` | `agentloom-supabase` |  |
| `AGENTLOOM_NETWORK_PREFIX` | `agentloom` | 主栈 4 个网络名的前缀（<前缀>-frontend/-app/-data/-sandbox-egress）；备份/恢复脚本据此找到 MinIO 网络。 |
| `NGINX_HTTP_PORT` | `8080` |  |
| `MINIO_CONSOLE_PORT` | `9001` |  |
| `QDRANT_HTTP_PORT` | `6333` |  |
| `SERVER_IMAGE` | `agentloom/server:private-local` |  |
| `STUDIO_IMAGE` | `agentloom/studio:private-local` |  |
| `DOCS_IMAGE` | `agentloom/docs:private-local` |  |
| `NGINX_IMAGE` | `openresty/openresty:alpine` |  |
| `POSTGRES_IMAGE` | `postgres:16-alpine` |  |
| `REDIS_IMAGE` | `redis:7-alpine` |  |
| `MINIO_IMAGE` | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | MinIO 官方 Docker Hub 仓库（minio/minio、minio/mc）已于 2026-09 下架，quay.io/minio 匿名不可拉取； 改用 Pigsty 维护的社区构建（https://github.com/pgsty/minio），固定 RELEASE 标签。 |
| `QDRANT_IMAGE` | `qdrant/qdrant:v1.17.0` |  |
| `MC_IMAGE` | `pgsty/mc:RELEASE.2026-09-16T00-00-00Z` |  |
| `RUN_DB_SEED` | `false` |  |
| `POSTGRES_BACKUP_RETENTION_DAYS` | `7` |  |
| `MINIO_BACKUP_RETENTION_DAYS` | `7` |  |
| `APP_DEPLOYMENT_MODE` | `private` |  |
| `APP_NODE_ENV` | `production` |  |
| `APP_PORT` | `3000` |  |
| `POSTGRES_USER` | `agentloom` |  |
| `POSTGRES_PASSWORD` | `change-me-db-password` | ⚠ 仅使用字母数字字符，特殊字符会破坏 URL 编码 |
| `POSTGRES_DB` | `agentloom` |  |
| `APP_DATABASE_URL` | `postgresql://agentloom:change-me-db-password@postgres:5432/agentloom` |  |
| `REDIS_PASSWORD` | `change-me-redis-password` |  |
| `APP_REDIS_URL` | `redis://:change-me-redis-password@redis:6379/0` |  |
| `APP_MINIO_ENDPOINT` | `minio` |  |
| `APP_MINIO_PORT` | `9000` |  |
| `APP_MINIO_ACCESS_KEY` | `agentloom` |  |
| `APP_MINIO_SECRET_KEY` | `change-me-minio-password` |  |
| `APP_MINIO_USE_SSL` | `false` |  |
| `APP_MINIO_BUCKET` | `agentloom-documents` |  |
| `APP_QDRANT_URL` | `http://qdrant:6333` |  |
| `COMPOSE_PROFILES` | `sandbox` | Sandbox 由 Firecracker runtime manager 通过 KVM microVM 承载。 单机 compose 即单节点；跨服务器部署时每台宿主机各跑一个 runtime 容器， 用 scripts/generate-firecracker-pki.sh add-node 签发证书后经 /api/v1/sandbox-nodes 注册（详见 README「沙箱运行时节点」）。 首次部署前运行 scripts/generate-firecracker-pki.sh 和 firecracker/build-artifacts.sh。 firecracker-runtime 属于 compose profile `sandbox`。server/worker 对它是可选依赖：runtime 预检失败或 未启用 sandbox profile 时 server/worker 照常启动，仅 sandbox 运行态的 Agent 不可用（no_sandbox 不受影响）。 宿主不满足预检（KVM、内核 6.18.x、关闭 swap 等）时去掉 sandbox，省掉一个反复重启的容器。 |
| `FIRECRACKER_RUNTIME_IMAGE` | `agentloom/firecracker-runtime:1.16.1` |  |
| `FIRECRACKER_GUEST_CIDR` | `172.30.0.0/16` |  |
| `FIRECRACKER_GATEWAY` | `172.30.0.1` |  |
| `FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS` |  | 默认拒绝所有私网；仅在 private LLM/MCP 确有需要时填逗号分隔 IPv4 CIDR。 |
| `FIRECRACKER_MAX_VMS` | `20` |  |
| `FIRECRACKER_MAX_VCPU` | `20` |  |
| `FIRECRACKER_MAX_MEMORY_MIB` | `40960` |  |
| `FIRECRACKER_MAX_DISK_GIB` | `200` |  |
| `FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL` | `false` |  |
| `FIRECRACKER_SMT_POLICY` | `deny` |  |
| `APP_SANDBOX_MAINTENANCE_MODE` | `false` |  |
| `APP_SANDBOX_ROLLBACK_HOURS` | `168` |  |
| `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` |  | 允许管理 /api/v1/sandbox-nodes 的租户 ID（逗号分隔）。 saas 模式留空即全部拒绝；private 模式无条件放行，可不填。 |
| `APP_JWT_SECRET` | `change-me-jwt-secret` | ⚠ 生产环境必须替换！运行 scripts/generate-secrets.sh 自动生成 |
| `APP_MASTER_ENCRYPTION_KEY` | `REPLACE_WITH_BASE64_32_BYTES` | 必须是 32 字节 Base64；运行: openssl rand -base64 32 |
| `APP_OAUTH_REDIRECT_URL` | `http://localhost:8080/api/v1/auth/oauth/callback` | 公网部署请改成实际 HTTPS 域名；保留 localhost 会导致 OAuth / 邮件跳转回本机地址。 |
| `APP_FRONTEND_URL` | `http://localhost:8080` |  |
| `APP_TRUST_PROXY_HOPS` | `1` | server 前方可信反向代理跳数：compose 自带 reverse-proxy 为 1；外层再套一层 TLS 终止代理时改为 2 |
| `APP_SANDBOX_CALLBACK_BASE_URL_SERVER` | `http://server:3000/api/v1` | sandbox 容器需要回调到创建 session 的同一进程，server / worker 不能共用同一个地址 |
| `APP_SANDBOX_CALLBACK_BASE_URL_WORKER` | `http://worker:3000/api/v1` |  |
| `APP_SUPABASE_URL` |  | private 模式下这 3 个变量必须"全部留空"或"全部提供" 使用自托管 Supabase 时，由 generate-secrets.sh 自动填充 |
| `APP_SUPABASE_ANON_KEY` |  |  |
| `APP_SUPABASE_SERVICE_KEY` |  |  |
| `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` |  |  |
| `FIREBASE_SERVICE_ACCOUNT` |  |  |
| `VITE_API_BASE_URL` | `/api/v1` |  |
| `VITE_AUTOSAVE_DEBOUNCE_MS` | `2000` |  |
| `VITE_SUPABASE_URL` |  | Supabase Auth — 浏览器端直连地址（留空时前端回退到当前站点 origin，并通过 reverse-proxy 的 /auth 转发） |
| `VITE_SUPABASE_ANON_KEY` |  |  |
| `SUPABASE_NETWORK` | `supabase-shared` | 自托管 Supabase（可选） 共享 Docker 网络名，docker-compose.supabase.yml 与主 Compose 通过此网络互联 |
| `SUPABASE_JWT_SECRET` | `change-me-jwt-secret` | GoTrue JWT secret — 必须与 APP_JWT_SECRET 相同！ |
| `SUPABASE_KONG_PORT` | `8000` | GoTrue 配置 |
| `SUPABASE_GOTRUE_EXTERNAL_URL` | `http://localhost:8000` | 公网部署请改成实际 HTTPS 域名；reverse-proxy 会把 /auth/* 转发到 supabase-kong。 |
| `SUPABASE_SITE_URL` | `http://localhost:8080` |  |
| `SUPABASE_ADDITIONAL_REDIRECT_URLS` |  |  |
| `SUPABASE_AUTH_CPU_LIMIT` | `1` | Supabase 容器资源限制（默认给出较宽松基线，可按宿主资源继续调大） |
| `SUPABASE_AUTH_MEMORY_LIMIT` | `1G` |  |
| `SUPABASE_KONG_CPU_LIMIT` | `1` |  |
| `SUPABASE_KONG_MEMORY_LIMIT` | `1G` |  |
| `SUPABASE_KONG_HEALTHCHECK_TIMEOUT` | `10s` |  |
| `SUPABASE_KONG_HEALTHCHECK_RETRIES` | `10` |  |
| `SUPABASE_KONG_HEALTHCHECK_START_PERIOD` | `30s` |  |
| `SUPABASE_GOOGLE_ENABLED` | `false` | OAuth providers（可选，设为 true 并填写 CLIENT_ID/SECRET 启用） |
| `SUPABASE_GOOGLE_CLIENT_ID` |  |  |
| `SUPABASE_GOOGLE_SECRET` |  |  |
| `SUPABASE_GITHUB_ENABLED` | `false` |  |
| `SUPABASE_GITHUB_CLIENT_ID` |  |  |
| `SUPABASE_GITHUB_SECRET` |  |  |

**仅在 Compose 文件中出现的插值变量**（`.env.template` 未声明；未设置时按 Compose 中的默认值或报错）：

| 变量 | Compose 规则 | 出现文件 |
| --- | --- | --- |
| `APP_FIRECRACKER_RUNTIME_SERVER_NAME` | 默认 `firecracker-runtime` | `agentloom-deploy/docker-compose.yml` |
| `APP_FIRECRACKER_RUNTIME_URL` | 默认 `https://firecracker-runtime:8443` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_ALLOW_SWAP` | 默认 `false` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_CALLBACK_ALLOWED_HOSTS` | 默认 `server,worker` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_CLIENT_CA_FILE` | 默认 `./secrets/firecracker/client-ca.crt` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_CLIENT_CERT_FILE` | 默认 `./secrets/firecracker/app-client.crt` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_CLIENT_KEY_FILE` | 默认 `./secrets/firecracker/app-client.key` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_ENV` | 默认 `production` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_GUEST_CA_FILE` | 默认 `./secrets/firecracker/guest-ca.crt` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_GUEST_CA_KEY_FILE` | 默认 `./secrets/firecracker/guest-ca.key` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_GUEST_SERVER_NAME` | 默认 `agentloom-guest` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_HEALTH_CLIENT_CERT_FILE` | 默认 `./secrets/firecracker/health-client.crt` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_HEALTH_CLIENT_KEY_FILE` | 默认 `./secrets/firecracker/health-client.key` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_MANAGER_CA_FILE` | 默认 `./secrets/firecracker/manager-ca.crt` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_MANAGER_CERT_FILE` | 默认 `./secrets/firecracker/manager.crt` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_MANAGER_KEY_FILE` | 默认 `./secrets/firecracker/manager.key` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_RUNTIME_CPU_LIMIT` | 默认 `24` | `agentloom-deploy/docker-compose.yml` |
| `FIRECRACKER_RUNTIME_MEMORY_LIMIT` | 默认 `48G` | `agentloom-deploy/docker-compose.yml` |
