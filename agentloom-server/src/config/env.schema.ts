import { z } from 'zod';

export const envSchema = z.object({
  APP_PORT: z.coerce.number().default(3000),
  APP_NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  APP_DATABASE_URL: z.string().min(1, '数据库连接字符串不能为空'),

  APP_SUPABASE_URL: z.string().url('无效的 Supabase URL'),
  APP_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase Anon Key 不能为空'),
  APP_SUPABASE_SERVICE_KEY: z.string().min(1, 'Supabase Service Key 不能为空'),

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

  APP_OAUTH_REDIRECT_URL: z.string().url('无效的 OAuth 回调 URL'),
  APP_FRONTEND_URL: z.string().url('无效的前端 URL'),
});

export type EnvConfig = z.infer<typeof envSchema>;
