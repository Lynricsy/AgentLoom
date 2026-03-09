import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { notificationTypeEnum } from '../../../database/schema';

export const upsertPreferenceSchema = z.object({
  type: z.enum(notificationTypeEnum.enumValues),
  channel: z.string().trim().min(1).max(32),
  enabled: z.boolean(),
});

export class UpsertPreferenceDto extends createZodDto(upsertPreferenceSchema) {}
