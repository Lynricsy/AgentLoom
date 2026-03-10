import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { notificationTypeEnum } from '../../../database/schema';

export const upsertPreferenceSchema = z.object({
  type: z.enum(notificationTypeEnum.enumValues),
  channel: z.enum(['in_app', 'email']),
  enabled: z.boolean(),
});

export class UpsertPreferenceDto extends createZodDto(upsertPreferenceSchema) {}
