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
| `APP_MINIO_PUBLIC_URL` | 否 |  |  | 浏览器访问对象存储的地址（协议://主机[:端口]，不能带路径），知识库原文与证据导出的预签名链接按它签名；留空沿用 APP_MINIO_ENDPOINT |
| `APP_SANDBOX_MAINTENANCE_MODE` | 否 | `false` | `true` / `false` |  |
| `APP_MCP_STDIO_ENABLED` | 否 | `false` | `true` / `false` |  |
| `APP_FIRECRACKER_RUNTIME_URL` | 否 | `https://firecracker-runtime:8443` |  | Firecracker runtime manager（server/worker 仅持有 mTLS client 身份） URL/SERVER_NAME 仅在 sandbox_runtime_nodes 表为空时用于播种 default 节点； 多节点部署经 /api/v1/sandbox-nodes 管理，表非空后这两项不再回写。 CA/CERT/KEY 为全节点共用的 client 身份（manager 只校验签发 CA）。 |
| `APP_FIRECRACKER_RUNTIME_CA` | 否 | `/run/secrets/firecracker-client/ca.crt` |  |  |
| `APP_FIRECRACKER_RUNTIME_CERT` | 否 | `/run/secrets/firecracker-client/tls.crt` |  |  |
| `APP_FIRECRACKER_RUNTIME_KEY` | 否 | `/run/secrets/firecracker-client/tls.key` |  |  |
| `APP_FIRECRACKER_RUNTIME_SERVER_NAME` | 否 | `firecracker-runtime` |  |  |
| `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` | 否 | `""` |  | 允许管理沙箱节点的租户 ID（逗号分隔）；saas 模式下留空即全部拒绝，private 模式无条件放行 |
| `APP_SANDBOX_CALLBACK_BASE_URL` | 否 |  |  | 可选：sandbox 容器回调当前进程的 API 基址（容器化部署建议显式配置） |
| `APP_AGENT_API_CONVERSATION_IDLE_HOURS` | 否 | `24` |  | Agent 对外 API：API 对话空闲多少小时后由维护任务自动结束 |
| `APP_AGENT_CONVERSATION_CONCURRENCY` | 否 | `10` |  | 每个进程同时执行的 Agent 对话数（agent-conversation-execution 队列并发，同一对话始终串行） |
| `APP_PUBLIC_BASE_URL` | 否 |  |  | 可选：对外公开访问的站点基址（A2A Agent Card 中的 RPC 地址以它为前缀）；留空时取 APP_FRONTEND_URL 的 origin |
| `APP_QDRANT_URL` | 否 | `http://localhost:6333` |  | 向量数据库（Qdrant） |
| `APP_TYPESAFE_API_KEY` | 否 |  |  | TypeSafe Jev 决策 API Key；设置后以影子模式调用 Jev 并写入 decision_records，留空即不调用 |
| `APP_TYPESAFE_BASE_URL` | 否 | `https://api.typesafe.ai` |  | TypeSafe API 基址 |
| `APP_TYPESAFE_MODEL` | 否 | `jev-1.13.0` |  | 钉版的 Jev 模型名 |
| `APP_TYPESAFE_TIMEOUT_MS` | 否 | `3000` |  | 单次 Jev 影子调用超时（毫秒） |
| `FIREBASE_SERVICE_ACCOUNT` | 否 |  |  | Firebase Cloud Messaging（推送通知） Firebase 服务账号 JSON 字符串，留空即禁用推送，例如 {"type":"service_account","project_id":"...","private_key":"...","client_email":"..."} |
| `APP_GENERATED_APP_BROWSER_BASE_URL` | 否 |  |  | Gate 5 浏览器验收（browser-runner 进程，见 agentloom-deploy 的 generated-app-browser-runner 服务） runner 打开的 Studio 公开页基址（runner 拼接 /generated-apps/public/<验收令牌>）；只有 runner 读取，本地开发填 Studio 地址 |
| `APP_GENERATED_APP_BROWSER_CONCURRENCY` | 否 | `1` |  | 每个 runner 进程同时执行的验收任务数（每个任务一个 Chromium） |
| `APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS` | 否 | `180000` |  | 单个场景 × 视口的时限（毫秒），由 worker 写进验收任务 |
| `APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS` | 否 | `900000` |  | 一次验收任务的总时限（毫秒）；worker 最多等待它再加 30 秒，验收令牌在它再加 60 秒后过期 |
| `GENERATED_APP_GATE3_EXECUTOR_MODE` | 否 |  |  | Gate 3-7 执行模式：real（缺省）\| fixture（仅单测，不能产生发布候选）\| disabled；其他值按 disabled 处理 |
| `GENERATED_APP_GATE4_EXECUTOR_MODE` | 否 |  |  |  |
| `GENERATED_APP_GATE5_EXECUTOR_MODE` | 否 |  |  |  |
| `GENERATED_APP_GATE6_EXECUTOR_MODE` | 否 |  |  |  |
| `GENERATED_APP_GATE7_EXECUTOR_MODE` | 否 |  |  |  |
| `APP_GENERATED_APP_SPEC_TIMEOUT_MS` | 否 | `120000` |  | 生成应用门禁（可选） Gate 0 生成 AppSpec 的总超时（毫秒，含自我修复重试），到时取消模型调用 |
| `APP_GENERATED_APP_GENERATION_CONCURRENCY` | 否 | `2` |  |  |

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
