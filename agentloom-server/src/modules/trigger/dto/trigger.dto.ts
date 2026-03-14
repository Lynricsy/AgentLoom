import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const TriggerTypeSchema = z.enum(['cron', 'webhook', 'api_event']);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const CronConfigSchema = z
  .object({
    expression: z
      .string()
      .min(1, { message: 'cron 表达式不能为空' })
      .regex(/^(\S+\s+){4}\S+$/, {
        message: 'cron 表达式格式无效，应为 5 段格式',
      }),
    timezone: z
      .string()
      .min(1, { message: '时区不能为空' })
      .default('UTC'),
  })
  .strict();

export const WebhookConfigCreateSchema = z
  .object({
    ipWhitelist: z
      .array(z.string().ip({ message: '无效的 IP 地址' }))
      .optional()
      .default([]),
  })
  .strict();

export const WebhookConfigSchema = z
  .object({
    token: z.string(),
    secret: z.string(),
    ipWhitelist: z.array(z.string()),
  })
  .strict();

export const ApiEventConfigSchema = z
  .object({
    eventSource: z.string().min(1, { message: '事件来源不能为空' }),
    eventType: z.string().min(1, { message: '事件类型不能为空' }),
    filterExpression: z.string().optional(),
  })
  .strict();

const BaseTriggerFields = {
  name: z
    .string()
    .trim()
    .min(1, { message: '触发器名称不能为空' })
    .max(255, { message: '触发器名称不能超过 255 个字符' }),
  description: z
    .string()
    .trim()
    .max(2000, { message: '触发器描述不能超过 2000 个字符' })
    .optional(),
  isEnabled: z.boolean().optional().default(true),
};

export const CreateCronTriggerSchema = z
  .object({
    ...BaseTriggerFields,
    type: z.literal('cron'),
    config: CronConfigSchema,
  })
  .strict();

export const CreateWebhookTriggerSchema = z
  .object({
    ...BaseTriggerFields,
    type: z.literal('webhook'),
    config: WebhookConfigCreateSchema,
  })
  .strict();

export const CreateApiEventTriggerSchema = z
  .object({
    ...BaseTriggerFields,
    type: z.literal('api_event'),
    config: ApiEventConfigSchema,
  })
  .strict();

export const CreateTriggerSchema = z.discriminatedUnion('type', [
  CreateCronTriggerSchema,
  CreateWebhookTriggerSchema,
  CreateApiEventTriggerSchema,
]);

export class CreateTriggerDto extends createZodDto(
  z.object({
    name: BaseTriggerFields.name,
    description: BaseTriggerFields.description,
    isEnabled: BaseTriggerFields.isEnabled,
    type: TriggerTypeSchema,
    config: z.union([
      CronConfigSchema,
      WebhookConfigCreateSchema,
      ApiEventConfigSchema,
    ]),
  }),
) {}

export const UpdateTriggerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: '触发器名称不能为空' })
      .max(255, { message: '触发器名称不能超过 255 个字符' })
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, { message: '触发器描述不能超过 2000 个字符' })
      .nullable()
      .optional(),
    config: z
      .union([CronConfigSchema, WebhookConfigCreateSchema, ApiEventConfigSchema])
      .optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict();

export class UpdateTriggerDto extends createZodDto(UpdateTriggerSchema) {}

export const QueryTriggerSchema = z.object({
  type: TriggerTypeSchema.optional(),
});

export class QueryTriggerDto extends createZodDto(QueryTriggerSchema) {}

export const TriggerHistoryStatusSchema = z.enum([
  'success',
  'failed',
  'skipped',
  'signature_failed',
]);

export const QueryTriggerHistorySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: TriggerHistoryStatusSchema.optional(),
});

export class QueryTriggerHistoryDto extends createZodDto(
  QueryTriggerHistorySchema,
) {}

export type TriggerHistoryStatus = z.infer<typeof TriggerHistoryStatusSchema>;
export type CronConfig = z.infer<typeof CronConfigSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type WebhookConfigCreate = z.infer<typeof WebhookConfigCreateSchema>;
export type ApiEventConfig = z.infer<typeof ApiEventConfigSchema>;
export type CreateTriggerInput = z.infer<typeof CreateTriggerSchema>;
export type UpdateTriggerInput = z.infer<typeof UpdateTriggerSchema>;
