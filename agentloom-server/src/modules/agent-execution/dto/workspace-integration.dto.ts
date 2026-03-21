import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const workspaceFilePathParamSchema = z.object({
  id: z.string().uuid({ message: '对话 ID 必须是有效的 UUID' }),
  path: z.string().min(1, { message: '文件路径不能为空' }),
});

export class WorkspaceFilePathParamDto extends createZodDto(
  workspaceFilePathParamSchema,
) {}
