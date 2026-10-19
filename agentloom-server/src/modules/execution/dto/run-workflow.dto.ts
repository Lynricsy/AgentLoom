import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const InputParamsSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    '启动参数，键为输入参数的字段 ID；工作流定义了输入参数时，未声明的键返回 422',
  );
const LaunchSourceSchema = z
  .enum(['web-studio', 'mobile', 'api'])
  .optional()
  .describe(
    '启动来源：web-studio 运行当前画布草稿，其余取值或缺省时运行当前发布版本',
  );
const SchemaVersionSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(
    '调用方依据的输入参数契约版本，取 GET /workflow-definitions/:id/input-schema 返回的 version；工作流定义了输入参数时必填，与当前契约不一致时 409',
  );

// strict：拼错的字段（如 inputs）必须 422，不能被静默丢弃后以空输入启动执行。
export const runWorkflowSchema = z
  .object({
    inputParams: InputParamsSchema,
    input_params: InputParamsSchema,
    launchSource: LaunchSourceSchema,
    launch_source: LaunchSourceSchema,
    schemaVersion: SchemaVersionSchema,
    schema_version: SchemaVersionSchema,
  })
  .strict()
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
