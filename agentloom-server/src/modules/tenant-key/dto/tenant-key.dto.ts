import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UploadPublicKeySchema = z.object({
  publicKey: z.string().min(1, '公钥不能为空'),
});

export class UploadPublicKeyDto extends createZodDto(UploadPublicKeySchema) {}

export const TenantKeyResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  keyFingerprint: z.string(),
  status: z.enum(['active', 'rotating', 'revoked']),
  activatedAt: z.string().nullable(),
  rotatedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class TenantKeyResponseDto extends createZodDto(
  TenantKeyResponseSchema,
) {}

export type TenantKeyResponse = z.infer<typeof TenantKeyResponseSchema>;

export const TenantKeyDetailResponseSchema = TenantKeyResponseSchema.extend({
  publicKey: z.string(),
});

export class TenantKeyDetailResponseDto extends createZodDto(
  TenantKeyDetailResponseSchema,
) {}

export type TenantKeyDetailResponse = z.infer<
  typeof TenantKeyDetailResponseSchema
>;
