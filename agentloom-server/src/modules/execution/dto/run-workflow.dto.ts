import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const InputParamsSchema = z.record(z.string(), z.unknown()).optional();
const LaunchSourceSchema = z.enum(['web-studio', 'mobile', 'api']).optional();

export const runWorkflowSchema = z
  .object({
    inputParams: InputParamsSchema,
    input_params: InputParamsSchema,
    launchSource: LaunchSourceSchema,
    launch_source: LaunchSourceSchema,
  })
  .transform((value) => ({
    inputParams: value.inputParams ?? value.input_params,
    launchSource: value.launchSource ?? value.launch_source,
  }));

export class RunWorkflowDto extends createZodDto(runWorkflowSchema) {}
