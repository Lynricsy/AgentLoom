import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const InputParamsSchema = z.record(z.string(), z.unknown()).optional();
const LaunchSourceSchema = z.enum(['web-studio', 'mobile', 'api']).optional();
const SchemaVersionSchema = z.number().int().positive().optional();

export const runWorkflowSchema = z
  .object({
    inputParams: InputParamsSchema,
    input_params: InputParamsSchema,
    launchSource: LaunchSourceSchema,
    launch_source: LaunchSourceSchema,
    schemaVersion: SchemaVersionSchema,
    schema_version: SchemaVersionSchema,
  })
  .transform((value) => ({
    inputParams: value.inputParams ?? value.input_params,
    launchSource: value.launchSource ?? value.launch_source,
    schemaVersion: value.schemaVersion ?? value.schema_version,
  }));

type PublicRunWorkflowInput = z.infer<typeof runWorkflowSchema>;

export type InternalLaunchSource =
  | NonNullable<PublicRunWorkflowInput['launchSource']>
  | 'cron-trigger'
  | 'webhook-trigger'
  | 'api-event-trigger'
  | 'evaluation';

export type ExecutionTriggerType = 'manual' | 'api' | 'webhook' | 'system';

export type InternalRunWorkflowRequest = {
  inputParams?: PublicRunWorkflowInput['inputParams'];
  launchSource?: InternalLaunchSource;
  schemaVersion?: PublicRunWorkflowInput['schemaVersion'];
  triggerType?: ExecutionTriggerType;
  /** 仅服务端内部：按指定版本快照启动（优化提案评测用），缺省为当前发布版本。 */
  workflowVersionId?: string;
};

export class RunWorkflowDto extends createZodDto(runWorkflowSchema) {}
