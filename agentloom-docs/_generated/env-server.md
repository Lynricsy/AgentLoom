<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-server/src/config/env.schema.ts` 的 `envSchema`（启动时校验，失败即退出）；说明取自 `agentloom-server/.env.example` 中该变量上方的注释。

| 变量 | 必填 | 默认值 | 取值 | 说明 |
| --- | --- | --- | --- | --- |
| `APP_PORT` | 否 | `3000` |  | 应用配置 |
| `APP_TRUST_PROXY_HOPS` | 否 | `0` |  | server 前方可信反向代理跳数（Fastify trustProxy）；本地直连保持 0，compose/nginx 后为 1 |
| `APP_NODE_ENV` | 否 | `development` | `development` / `production` / `test` |  |
| `APP_DEPLOYMENT_MODE` | 否 | `saas` | `saas` / `private` |  |
| `APP_DATABASE_URL` | 是 |  |  | 数据库连接 |
| `APP_SUPABASE_URL` | 否 |  |  | Supabase 配置 |
| `APP_SUPABASE_ANON_KEY` | 否 |  |  |  |
| `APP_SUPABASE_SERVICE_KEY` | 否 |  |  |  |
| `APP_JWT_SECRET` | 是 |  |  | JWT 密钥（Supabase JWT Secret） |
| `APP_REDIS_URL` | 是 |  |  | Redis 连接 |
| `APP_MASTER_ENCRYPTION_KEY` | 是 |  |  | 加密配置（256 位 Base64 编码密钥，可用 `openssl rand -base64 32` 生成） |
| `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` | 否 |  |  |  |
| `APP_OAUTH_REDIRECT_URL` | 是 |  |  | OAuth 配置 |
| `APP_FRONTEND_URL` | 是 |  |  |  |
| `APP_MINIO_ENDPOINT` | 否 | `localhost` |  | MinIO 对象存储配置 |
| `APP_MINIO_PORT` | 否 | `9000` |  |  |
| `APP_MINIO_ACCESS_KEY` | 否 | `minioadmin` |  |  |
| `APP_MINIO_SECRET_KEY` | 否 | `minioadmin` |  |  |
| `APP_MINIO_USE_SSL` | 否 | `false` | `true` / `false` |  |
| `APP_MINIO_BUCKET` | 否 | `agentloom-documents` |  |  |
| `APP_SANDBOX_MAINTENANCE_MODE` | 否 | `false` | `true` / `false` |  |
| `APP_FIRECRACKER_RUNTIME_URL` | 否 | `https://firecracker-runtime:8443` |  | Firecracker runtime manager（server/worker 仅持有 mTLS client 身份） URL/SERVER_NAME 仅在 sandbox_runtime_nodes 表为空时用于播种 default 节点； 多节点部署经 /api/v1/sandbox-nodes 管理，表非空后这两项不再回写。 CA/CERT/KEY 为全节点共用的 client 身份（manager 只校验签发 CA）。 |
| `APP_FIRECRACKER_RUNTIME_CA` | 否 | `/run/secrets/firecracker-client/ca.crt` |  |  |
| `APP_FIRECRACKER_RUNTIME_CERT` | 否 | `/run/secrets/firecracker-client/tls.crt` |  |  |
| `APP_FIRECRACKER_RUNTIME_KEY` | 否 | `/run/secrets/firecracker-client/tls.key` |  |  |
| `APP_FIRECRACKER_RUNTIME_SERVER_NAME` | 否 | `firecracker-runtime` |  |  |
| `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` | 否 | `""` |  | 允许管理沙箱节点的租户 ID（逗号分隔）；saas 模式下留空即全部拒绝，private 模式无条件放行 |
| `APP_SANDBOX_CALLBACK_BASE_URL` | 否 |  |  | 可选：sandbox 容器回调当前进程的 API 基址（容器化部署建议显式配置） |
| `APP_AGENT_API_CONVERSATION_IDLE_HOURS` | 否 | `24` |  | Agent 对外 API：API 对话空闲多少小时后由维护任务自动结束 |
| `APP_QDRANT_URL` | 否 | `http://localhost:6333` |  | 向量数据库（Qdrant） |
| `FIREBASE_SERVICE_ACCOUNT` | 否 |  |  | Firebase Cloud Messaging（推送通知） Firebase 服务账号 JSON 字符串，留空即禁用推送，例如 {"type":"service_account","project_id":"...","private_key":"...","client_email":"..."} |
| `GENERATED_APP_WORKSPACE_ROOT` | 否 |  |  | 生成应用门禁（可选） 生成工作区根目录，留空使用系统临时目录下的 agentloom-generated-app-workspaces |
| `GENERATED_APP_GATE3_EXECUTOR_MODE` | 否 |  |  | Gate 3-7 执行模式：real（缺省）\| fixture \| disabled；Gate 5 另支持 real-browser-e2e |
| `GENERATED_APP_GATE3_COMMAND_TIMEOUT_MS` | 否 | `30000` |  | Gate 3 单条命令超时（毫秒） |
| `GENERATED_APP_GATE4_EXECUTOR_MODE` | 否 |  |  |  |
| `GENERATED_APP_GATE5_EXECUTOR_MODE` | 否 |  |  |  |
| `GENERATED_APP_GATE5_REAL_BROWSER_UNAVAILABLE_REASON` | 否 |  |  | 非空时强制把 Gate 5 真实浏览器标记为不可用，值即原因 |
| `GENERATED_APP_GATE6_EXECUTOR_MODE` | 否 |  |  |  |
| `GENERATED_APP_GATE7_EXECUTOR_MODE` | 否 |  |  |  |

**未经 `envSchema` 校验、由源码直接读取 `process.env` 的变量**（缺省时行为以读取处代码为准）：

| 变量 | 读取位置 | 说明 |
| --- | --- | --- |
| `ACP_TEST_FAKE_RUNTIME` | `agentloom-server/src/modules/acp-gateway/resolve-acp-agent-runtime.ts`<br>`agentloom-server/src/modules/acp-gateway/testing/acp-test-sandbox-runtime.ts`<br>`agentloom-server/src/modules/knowledge/qdrant.provider.ts` |  |
| `ACP_TEST_SANDBOX_WORKSPACE_ROOT` | `agentloom-server/src/modules/acp-gateway/testing/acp-test-sandbox-runtime.ts` |  |
| `ACP_TEST_TERMINAL_TIMEOUT_MS` | `agentloom-server/src/modules/acp-gateway/services/acp-terminal-proxy.service.ts` |  |
| `HOME` | `agentloom-server/src/modules/agent/code-execution.service.ts` |  |
| `HOSTNAME` | `agentloom-server/src/modules/agent/sandbox-tool-registry.service.ts` |  |
| `LANG` | `agentloom-server/src/modules/agent/code-execution.service.ts` |  |
| `NODE_ENV` | `agentloom-server/src/modules/knowledge/qdrant.provider.ts` |  |
| `PATH` | `agentloom-server/src/modules/agent/code-execution.service.ts` |  |
| `PYTHONPATH` | `agentloom-server/src/modules/agent/code-execution.service.ts` |  |
| `TERM` | `agentloom-server/src/modules/agent/code-execution.service.ts` |  |
