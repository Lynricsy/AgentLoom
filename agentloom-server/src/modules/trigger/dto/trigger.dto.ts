import { getNextMillis } from 'bullmq';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { isValidIpAllowlistEntry } from '../ip-allowlist.util';

export const TriggerTypeSchema = z.enum(['cron', 'webhook', 'api_event']);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

/**
 * 已落库 cron 配置的形状。调度器注册时只校验形状：
 * 更早写入、按当前规则不再接受的配置不应在启动同步时阻断其他触发器。
 */
export const StoredCronConfigSchema = z
  .object({
    expression: z
      .string()
      .min(1, { message: 'cron 表达式不能为空' })
      .regex(/^(\S+\s+){4}\S+$/, {
        message: 'cron 表达式格式无效，应为 5 段格式',
      }),
    timezone: z.string().min(1, { message: '时区不能为空' }).default('UTC'),
  })
  .strict();

/**
 * 创建/更新时的 cron 配置：时区必须是 IANA 时区（Intl 可识别），
 * 表达式用 BullMQ Job Scheduler 计算下一次触发的同一函数（getNextMillis → cron-parser）
 * 在该时区下试算，调度器会拒绝的值在这里就返回 422，而不是先落库再注册失败。
 */
export const CronConfigSchema = StoredCronConfigSchema.superRefine(
  (config, ctx) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: config.timezone });
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['timezone'],
        message: `时区无效，应为 IANA 时区名（如 Asia/Shanghai）：${config.timezone}`,
      });
      return;
    }

    let nextMillis: number | undefined;
    try {
      nextMillis = getNextMillis(Date.now(), {
        pattern: config.expression,
        tz: config.timezone,
      });
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['expression'],
        message: `cron 表达式无效：${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    if (nextMillis === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['expression'],
        message: 'cron 表达式无效：不会产生任何触发时间',
      });
    }
  },
);

// github：校验 GitHub 的 X-Hub-Signature-256（HMAC-SHA256(secret, rawBody)），按 X-GitHub-Delivery 去重
export const WebhookAuthModeSchema = z.enum(['simple', 'signed', 'github']);
export type WebhookAuthMode = z.infer<typeof WebhookAuthModeSchema>;

const IpAllowlistSchema = z.array(
  z.string().trim().refine(isValidIpAllowlistEntry, {
    message: '无效的 IP 地址或 CIDR 网段',
  }),
);

export const WebhookConfigCreateSchema = z
  .object({
    authMode: WebhookAuthModeSchema.default('simple'),
    ipWhitelist: IpAllowlistSchema.optional().default([]),
  })
  .strict();

export const WebhookConfigUpdateSchema = z
  .object({
    authMode: WebhookAuthModeSchema.optional(),
    ipWhitelist: IpAllowlistSchema.optional(),
  })
  .strict();

export const WebhookConfigSchema = z
  .object({
    authMode: WebhookAuthModeSchema.optional(),
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
    // 事件源验签密钥（如 GitHub webhook 的 HMAC-SHA256 secret），仅需验签的事件源使用
    secret: z.string().min(1).optional(),
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

// 仅描述 OpenAPI 请求体形状（discriminatedUnion 无法作为 createZodDto 的基类）；
// 运行时由 controller 上的 ZodValidationPipe(CreateTriggerSchema) 按 type 校验 config。
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
      .union([
        CronConfigSchema,
        WebhookConfigUpdateSchema,
        ApiEventConfigSchema,
      ])
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
  'ip_rejected',
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
export type WebhookConfigUpdate = z.infer<typeof WebhookConfigUpdateSchema>;
export type ApiEventConfig = z.infer<typeof ApiEventConfigSchema>;
export type CreateTriggerInput = z.infer<typeof CreateTriggerSchema>;
export type UpdateTriggerInput = z.infer<typeof UpdateTriggerSchema>;
