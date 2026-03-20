import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const OAuthProviderSchema = z.enum(['google', 'github'], {
  error: '不支持的 OAuth 提供商，仅支持 google 和 github',
});

export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export const OAuthPlatformSchema = z.enum(['mobile']);

export type OAuthPlatform = z.infer<typeof OAuthPlatformSchema>;

const OAuthInitiateBodySchema = z.object({
  redirectUrl: z.url('无效的重定向 URL').optional(),
  platform: OAuthPlatformSchema.optional(),
});

export class OAuthInitiateBodyDto extends createZodDto(
  OAuthInitiateBodySchema,
) {}

const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1, 'OAuth 授权码不能为空'),
  platform: OAuthPlatformSchema.optional(),
});

export class OAuthCallbackQueryDto extends createZodDto(
  OAuthCallbackQuerySchema,
) {}
