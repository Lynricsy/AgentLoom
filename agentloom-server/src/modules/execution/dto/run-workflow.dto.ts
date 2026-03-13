import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const runWorkflowSchema = z.object({
  inputParams: z.record(z.string(), z.unknown()).optional(),
  launchSource: z.enum(['web-studio', 'mobile', 'api']).optional(),
});

export class RunWorkflowDto extends createZodDto(runWorkflowSchema) {}
