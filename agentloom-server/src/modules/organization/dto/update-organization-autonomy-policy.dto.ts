import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateOrganizationAutonomyPolicySchema = z
  .object({
    autonomyCap: z.enum(['MANUAL_CONFIRM', 'RULE_BASED', 'LLM_SUGGEST'], {
      message: '无效的自治上限模式',
    }),
  })
  .strict();

export class UpdateOrganizationAutonomyPolicyDto extends createZodDto(
  UpdateOrganizationAutonomyPolicySchema,
) {}
