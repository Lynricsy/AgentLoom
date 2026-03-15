import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreatePlatformApiTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.string().max(1024).optional(),
  expires_at: z.iso.datetime().optional(),
});

export type CreatePlatformApiTokenDto = z.infer<
  typeof CreatePlatformApiTokenSchema
>;

export class CreatePlatformApiTokenSwaggerDto extends createZodDto(
  CreatePlatformApiTokenSchema,
) {}
