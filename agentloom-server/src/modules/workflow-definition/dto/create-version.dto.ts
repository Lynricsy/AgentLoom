import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createVersionSchema = z.object({
  label: z
    .string()
    .max(255, { message: '版本标签不能超过 255 个字符' })
    .optional(),
});

export class CreateVersionDto extends createZodDto(createVersionSchema) {}
