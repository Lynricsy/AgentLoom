import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_NAME_MAX_LENGTH,
} from '../skill.constants';

export const UpdateSkillSchema = z
  .object({
    name: z.string().trim().min(1).max(SKILL_NAME_MAX_LENGTH).optional(),
    description: z
      .string()
      .trim()
      .min(1)
      .max(SKILL_DESCRIPTION_MAX_LENGTH)
      .optional(),
    content: z.string().optional(),
    occVersion: z.number().int().min(1, { message: 'occVersion 必须为正整数' }),
  })
  .strict();

export class UpdateSkillDto extends createZodDto(UpdateSkillSchema) {}

export type UpdateSkillDtoType = z.infer<typeof UpdateSkillSchema>;
