import { z } from 'zod';
import { LLM_PROVIDERS } from './create-api-key.dto';

export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(LLM_PROVIDERS),
  label: z.string(),
  keyPreview: z.string(),
  isDefault: z.boolean(),
  status: z.enum(['active', 'revoked', 'expired']),
  lastUsedAt: z.string().datetime().nullable(),
  rotatedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ApiKeyResponseDto = z.infer<typeof apiKeyResponseSchema>;
