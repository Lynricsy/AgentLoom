import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LookupModelMetadataQuerySchema = z.object({
  providerSlug: z.string().trim().min(1, 'providerSlug 不能为空').max(128),
  modelId: z.string().trim().min(1, 'modelId 不能为空').max(256),
});

export class LookupModelMetadataQueryDto extends createZodDto(
  LookupModelMetadataQuerySchema,
) {}
