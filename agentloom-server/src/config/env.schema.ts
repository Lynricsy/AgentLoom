import { z } from 'zod';

const supabaseFieldRequirements = {
  APP_SUPABASE_URL: '无效的 Supabase URL',
  APP_SUPABASE_ANON_KEY: 'Supabase Anon Key 不能为空',
  APP_SUPABASE_SERVICE_KEY: 'Supabase Service Key 不能为空',
} as const;

const baseEnvSchema = z.object({
  APP_PORT: z.coerce.number().default(3000),
  APP_NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  APP_DEPLOYMENT_MODE: z.enum(['saas', 'private']).default('saas'),

  APP_DATABASE_URL: z.string().min(1, '数据库连接字符串不能为空'),

  APP_SUPABASE_URL: z.string().url('无效的 Supabase URL').optional(),
  APP_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'Supabase Anon Key 不能为空')
    .optional(),
  APP_SUPABASE_SERVICE_KEY: z
    .string()
    .min(1, 'Supabase Service Key 不能为空')
    .optional(),

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

  APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY: z.string().min(1).optional(),

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

  APP_QDRANT_URL: z.string().url().default('http://localhost:6333'),
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

export type EnvConfig = z.infer<typeof envSchema>;
