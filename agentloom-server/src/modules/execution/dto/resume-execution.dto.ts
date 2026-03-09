import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const resumeExecutionDtoSchema = z.object({
  fromNodeId: z
    .string()
    .trim()
    .min(1, 'fromNodeId 不能为空')
    .optional()
    .describe('指定从此节点开始恢复，重置该节点及所有下游节点'),
});

export class ResumeExecutionDto extends createZodDto(
  resumeExecutionDtoSchema,
) {}
