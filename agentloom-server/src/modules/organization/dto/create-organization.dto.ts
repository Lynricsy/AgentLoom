import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CreateOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, { message: '组织名称不能为空' })
    .max(255, { message: '组织名称不能超过255个字符' }),
  description: z
    .string()
    .max(500, { message: '组织描述不能超过500个字符' })
    .optional(),
});

export class CreateOrganizationDto extends createZodDto(
  CreateOrganizationSchema,
) {}
