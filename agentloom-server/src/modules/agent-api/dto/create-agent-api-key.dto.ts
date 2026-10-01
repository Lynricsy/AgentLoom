import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 管理接口请求体沿用 snake_case（Studio ky hook 负责转换） */
export const CreateAgentApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    rate_limit_per_minute: z.number().int().min(1).max(6000).optional(),
    max_concurrent_runs: z.number().int().min(1).max(50).default(5),
    expires_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type CreateAgentApiKeyDto = z.infer<typeof CreateAgentApiKeySchema>;

export class CreateAgentApiKeySwaggerDto extends createZodDto(
  CreateAgentApiKeySchema,
) {}
