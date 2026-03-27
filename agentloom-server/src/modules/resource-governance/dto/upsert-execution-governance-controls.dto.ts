import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const WorkflowExecutionGovernanceControlSchema = z
  .object({
    scope: z.literal('workflow'),
    targetId: z.uuid({ message: '工作流目标 ID 必须是合法 UUID' }),
    status: z.enum(['active', 'paused'], {
      message: '无效的工作流治理状态',
    }),
    reason: z
      .string()
      .trim()
      .max(500, '治理原因不能超过 500 个字符')
      .nullable(),
  })
  .strict();

export const TenantExecutionGovernanceControlSchema = z
  .object({
    status: z.enum(['active', 'paused'], {
      message: '无效的租户治理状态',
    }),
    reason: z
      .string()
      .trim()
      .max(500, '治理原因不能超过 500 个字符')
      .nullable(),
  })
  .strict();

export const UpsertExecutionGovernanceControlsSchema = z
  .object({
    tenantControl: TenantExecutionGovernanceControlSchema.optional(),
    workflowControls: z
      .array(WorkflowExecutionGovernanceControlSchema)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个治理字段',
  });

export type UpsertExecutionGovernanceControlsDto = z.infer<
  typeof UpsertExecutionGovernanceControlsSchema
>;

export class UpsertExecutionGovernanceControlsRequestDto extends createZodDto(
  UpsertExecutionGovernanceControlsSchema,
) {}
