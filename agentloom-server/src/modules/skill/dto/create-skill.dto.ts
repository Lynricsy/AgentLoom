import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_NAME_MAX_LENGTH,
} from '../skill.constants';

export const CreateSkillSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(SKILL_NAME_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(SKILL_DESCRIPTION_MAX_LENGTH),
    content: z.string().optional(),
  })
  .strict();

export class CreateSkillDto extends createZodDto(CreateSkillSchema) {}

export type CreateSkillDtoType = z.infer<typeof CreateSkillSchema>;
