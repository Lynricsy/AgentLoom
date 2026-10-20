import { z } from 'zod';

const supabaseFieldRequirements = {
  APP_SUPABASE_URL: '无效的 Supabase URL',
  APP_SUPABASE_ANON_KEY: 'Supabase Anon Key 不能为空',
  APP_SUPABASE_SERVICE_KEY: 'Supabase Service Key 不能为空',
} as const;

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  return value;
};

const optionalUrlFromEnv = (message: string) =>
  z.preprocess(emptyStringToUndefined, z.string().url(message).optional());

const optionalNonEmptyStringFromEnv = (message: string) =>
  z.preprocess(emptyStringToUndefined, z.string().min(1, message).optional());

const positiveNumberFromEnv = (defaultValue: number) =>
  z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().positive().default(defaultValue),
  );

/** Gate 执行模式取值由各 runner 归一化（大小写、别名），schema 只负责声明与空串归一 */
const optionalStringFromEnv = () =>
  z.preprocess(emptyStringToUndefined, z.string().optional());

const baseEnvSchema = z.object({
  APP_PORT: z.coerce.number().default(3000),
  /**
   * server 前方可信反向代理的跳数，直接映射 Fastify `trustProxy`。
   * 0 = 不信任任何 X-Forwarded-For（直连部署）；compose/nginx 单层代理为 1；
   * 外层再加一层 TLS 终止代理时为 2。决定 request.ip（Webhook IP 白名单、匿名限流）。
   */
  APP_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  APP_NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  APP_DEPLOYMENT_MODE: z.enum(['saas', 'private']).default('saas'),

  APP_DATABASE_URL: z.string().min(1, '数据库连接字符串不能为空'),

  APP_SUPABASE_URL: optionalUrlFromEnv('无效的 Supabase URL'),
  APP_SUPABASE_ANON_KEY: optionalNonEmptyStringFromEnv(
    'Supabase Anon Key 不能为空',
  ),
  APP_SUPABASE_SERVICE_KEY: optionalNonEmptyStringFromEnv(
    'Supabase Service Key 不能为空',
  ),

  APP_JWT_SECRET: z.string().min(1, 'JWT Secret 不能为空'),

  APP_REDIS_URL: z.string().min(1, 'Redis 连接字符串不能为空'),

  APP_MASTER_ENCRYPTION_KEY: z
    .string()
    .min(1, '主加密密钥不能为空')
    .refine(
      (val) => {
        try {
          return Buffer.from(val, 'base64').length === 32;
        } catch {
          return false;
        }
      },
      { message: '主加密密钥必须为 256 位（32 字节）Base64 编码' },
    ),

  APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY: optionalNonEmptyStringFromEnv(
    '私有部署 License 公钥不能为空',
  ),

  APP_OAUTH_REDIRECT_URL: z.string().url('无效的 OAuth 回调 URL'),
  APP_FRONTEND_URL: z.string().url('无效的前端 URL'),

  APP_MINIO_ENDPOINT: z.string().min(1).default('localhost'),
  APP_MINIO_PORT: z.coerce.number().default(9000),
  APP_MINIO_ACCESS_KEY: z.string().min(1).default('minioadmin'),
  APP_MINIO_SECRET_KEY: z.string().min(1).default('minioadmin'),
  APP_MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  APP_MINIO_BUCKET: z.string().min(1).default('agentloom-documents'),
  /**
   * 浏览器访问对象存储的地址，预签名下载链接（知识库原文、证据导出）按它签名；未设置时
   * 沿用 APP_MINIO_ENDPOINT。MinIO 按 path-style 寻址，只能是 协议://主机[:端口]，不能带路径。
   */
  APP_MINIO_PUBLIC_URL: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .url('无效的 MinIO 公网地址')
      .refine(
        (value) => {
          // url() 失败时 refine 仍会执行，先确认可解析
          if (!URL.canParse(value)) return false;
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            url.pathname === '/' &&
            !url.search &&
            !url.hash
          );
        },
        {
          message:
            'APP_MINIO_PUBLIC_URL 只能是 http(s)://主机[:端口]，不能带路径或查询参数',
        },
      )
      .optional(),
  ),

  APP_SANDBOX_MAINTENANCE_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** 允许在服务端宿主机上启动 stdio MCP 进程（任意命令执行）；多租户部署必须保持 false。 */
  APP_MCP_STDIO_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  APP_FIRECRACKER_RUNTIME_URL: z
    .string()
    .url()
    .default('https://firecracker-runtime:8443'),
  APP_FIRECRACKER_RUNTIME_CA: z
    .string()
    .min(1)
    .default('/run/secrets/firecracker-client/ca.crt'),
  APP_FIRECRACKER_RUNTIME_CERT: z
    .string()
    .min(1)
    .default('/run/secrets/firecracker-client/tls.crt'),
  APP_FIRECRACKER_RUNTIME_KEY: z
    .string()
    .min(1)
    .default('/run/secrets/firecracker-client/tls.key'),
  APP_FIRECRACKER_RUNTIME_SERVER_NAME: z
    .string()
    .min(1)
    .default('firecracker-runtime'),
  /**
   * 允许管理 `/api/v1/sandbox-nodes` 的租户 ID（逗号分隔 UUID）。
   *
   * 节点是跨租户共享的物理基础设施，saas 模式下默认空 = 全部 403，只能走 SQL——
   * 这是有意的安全默认。private 模式只有一个租户，无条件放行。
   */
  APP_SANDBOX_NODE_ADMIN_TENANT_IDS: z.string().default(''),
  /** 沙箱内 guest 回调 server 工具执行端点的 API 基址；缺省时按容器主机名推断 */
  APP_SANDBOX_CALLBACK_BASE_URL: optionalUrlFromEnv('无效的沙箱回调 URL'),
  /** Agent 对外 API 对话空闲多少小时后由维护任务自动结束 */
  APP_AGENT_API_CONVERSATION_IDLE_HOURS: positiveNumberFromEnv(24),
  /** 每个 server/worker 进程同时执行的 Agent 对话 loop 数（agent-conversation-execution 队列并发）；同一对话始终串行 */
  APP_AGENT_CONVERSATION_CONCURRENCY: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(10),
  ),
  /** 对外公开访问的站点基址（如 `https://agentloom.example.com`）；A2A Agent Card 用它拼接 RPC 地址，缺省时取请求的协议与主机 */
  APP_PUBLIC_BASE_URL: optionalUrlFromEnv('无效的公开访问基址 URL'),
  APP_QDRANT_URL: z.string().url().default('http://localhost:6333'),
  /** TypeSafe Jev 决策 API Key；设置后 DecisionService 以影子模式调用 Jev 并记录结果，未设置时不调用 */
  APP_TYPESAFE_API_KEY: optionalNonEmptyStringFromEnv(
    'TypeSafe API Key 不能为空',
  ),
  APP_TYPESAFE_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .url('无效的 TypeSafe API 基址')
      .default('https://api.typesafe.ai'),
  ),
  /** 钉版的 Jev 模型名，升级需走上游审阅 */
  APP_TYPESAFE_MODEL: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).default('jev-1.13.0'),
  ),
  /** 单次 Jev 影子调用超时（毫秒） */
  APP_TYPESAFE_TIMEOUT_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(3000),
  ),
  /** Firebase 服务账号 JSON；缺省时推送通知禁用 */
  FIREBASE_SERVICE_ACCOUNT:
    optionalNonEmptyStringFromEnv('Firebase 服务账号不能为空'),

  /**
   * Gate 5 浏览器验收（ADR-0007 §6）。BASE_URL 只由 browser-runner 读取：runner 打开
   * `${BASE_URL}/generated-apps/public/<验收令牌>`，即终端用户使用的 Studio 公开页（Compose
   * 默认 `http://reverse-proxy`）。CONCURRENCY 是每个 runner 进程同时执行的验收任务数；
   * 两个超时由 worker 写进任务，runner 按任务里的值执行。
   */
  APP_GENERATED_APP_BROWSER_BASE_URL:
    optionalUrlFromEnv('无效的浏览器验收入口基址 URL'),
  APP_GENERATED_APP_BROWSER_CONCURRENCY: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(1),
  ),
  APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(180_000),
  ),
  APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(900_000),
  ),

  /**
   * 生成应用门禁。Gate 3–7 执行模式取 real（缺省）/ fixture / disabled，其他值按 disabled 处理；
   * fixture 只用于单测，Gate 7 不会放行 fixture 结果。
   */
  GENERATED_APP_WORKSPACE_ROOT: optionalStringFromEnv(),
  GENERATED_APP_GATE3_EXECUTOR_MODE: optionalStringFromEnv(),
  GENERATED_APP_GATE4_EXECUTOR_MODE: optionalStringFromEnv(),
  GENERATED_APP_GATE5_EXECUTOR_MODE: optionalStringFromEnv(),
  GENERATED_APP_GATE6_EXECUTOR_MODE: optionalStringFromEnv(),
  GENERATED_APP_GATE7_EXECUTOR_MODE: optionalStringFromEnv(),
  /** Gate 0 生成 AppSpec 的总超时（含自我修复重试），到时经 AbortSignal 取消模型调用（ADR-0007 §1） */
  APP_GENERATED_APP_SPEC_TIMEOUT_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(120_000),
  ),
  /** 每个 server/worker 进程同时执行的生成运行数（generated-app-generation 队列并发，ADR-0007 §5） */
  APP_GENERATED_APP_GENERATION_CONCURRENCY: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(2),
  ),
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  const supabaseFields = [
    'APP_SUPABASE_URL',
    'APP_SUPABASE_ANON_KEY',
    'APP_SUPABASE_SERVICE_KEY',
  ] as const;
  const missingSupabaseFields = supabaseFields.filter(
    (field) => !env[field]?.trim(),
  );

  if (env.APP_DEPLOYMENT_MODE === 'saas') {
    for (const field of missingSupabaseFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: supabaseFieldRequirements[field],
        path: [field],
      });
    }
    return;
  }

  if (
    missingSupabaseFields.length > 0 &&
    missingSupabaseFields.length < supabaseFields.length
  ) {
    for (const field of missingSupabaseFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${supabaseFieldRequirements[field]}；private 部署模式下 APP_SUPABASE_* 必须全部省略或全部提供`,
        path: [field],
      });
    }
  }
});

/**
 * browser-runner 进程的配置：只含 Redis、对象存储与浏览器验收变量，不要求数据库、JWT、
 * 加密密钥等凭据——runner 渲染生成内容，不应持有它们。入口基址在 runner 中必填。
 */
export const browserRunnerEnvSchema = baseEnvSchema
  .pick({
    APP_NODE_ENV: true,
    APP_REDIS_URL: true,
    APP_MINIO_ENDPOINT: true,
    APP_MINIO_PORT: true,
    APP_MINIO_ACCESS_KEY: true,
    APP_MINIO_SECRET_KEY: true,
    APP_MINIO_USE_SSL: true,
    APP_MINIO_BUCKET: true,
    APP_MINIO_PUBLIC_URL: true,
    APP_GENERATED_APP_BROWSER_CONCURRENCY: true,
  })
  .extend({
    APP_GENERATED_APP_BROWSER_BASE_URL: z
      .string({ error: 'APP_GENERATED_APP_BROWSER_BASE_URL 不能为空' })
      .url('无效的浏览器验收入口基址 URL'),
  });

export type BrowserRunnerEnvConfig = z.infer<typeof browserRunnerEnvSchema>;

export type EnvConfig = z.infer<typeof envSchema>;
