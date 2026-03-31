import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateUserPreferenceSchema = z.object({
  titleModelConfigId: z.uuid().nullable().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export class UpdateUserPreferenceDto extends createZodDto(
  UpdateUserPreferenceSchema,
) {}
