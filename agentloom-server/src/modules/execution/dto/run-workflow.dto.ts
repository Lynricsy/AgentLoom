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

type PublicRunWorkflowInput = z.infer<typeof runWorkflowSchema>;

export type InternalLaunchSource =
  | NonNullable<PublicRunWorkflowInput['launchSource']>
  | 'cron-trigger'
  | 'webhook-trigger';

export type ExecutionTriggerType = 'manual' | 'api' | 'webhook' | 'system';

export type InternalRunWorkflowRequest = {
  inputParams?: PublicRunWorkflowInput['inputParams']
  launchSource?: InternalLaunchSource;
  triggerType?: ExecutionTriggerType;
};

export class RunWorkflowDto extends createZodDto(runWorkflowSchema) {}
