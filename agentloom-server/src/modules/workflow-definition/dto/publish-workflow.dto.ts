import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const publishWorkflowSchema = z.object({
  label: z
    .string()
    .max(255, { message: '版本标签不能超过 255 个字符' })
    .optional(),
  releaseNotes: z
    .string()
    .max(1000, { message: '发布说明不能超过 1000 个字符' })
    .optional(),
  versionId: z.string().uuid({ message: '版本 ID 格式无效' }).optional(),
});

export class PublishWorkflowDto extends createZodDto(publishWorkflowSchema) {}
