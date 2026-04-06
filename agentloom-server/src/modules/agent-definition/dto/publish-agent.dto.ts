import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PublishAgentSchema = z
  .object({
    label: z
      .string()
      .max(255, { message: '发布标签不能超过 255 个字符' })
      .optional(),
    releaseNotes: z
      .string()
      .max(2000, { message: '发布说明不能超过 2000 个字符' })
      .optional(),
    release_notes: z
      .string()
      .max(2000, { message: '发布说明不能超过 2000 个字符' })
      .optional(),
    changelog: z
      .string()
      .max(2000, { message: '变更日志不能超过 2000 个字符' })
      .optional(),
    versionId: z.string().uuid({ message: '版本 ID 格式无效' }).optional(),
    version_id: z.string().uuid({ message: '版本 ID 格式无效' }).optional(),
  })
  .transform((value) => ({
    label: value.label,
    releaseNotes: value.releaseNotes ?? value.release_notes ?? value.changelog,
    versionId: value.versionId ?? value.version_id,
  }));

export class PublishAgentDto extends createZodDto(PublishAgentSchema) {}
