import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpsertTenantQuotaSchema = z
  .object({
    apiRateLimitPerMinute: z
      .int({ message: 'API 每分钟限流必须是整数' })
      .positive('API 每分钟限流必须大于 0')
      .optional(),
    maxConcurrentExecutions: z
      .int({ message: '并发执行上限必须是整数' })
      .positive('并发执行上限必须大于 0')
      .nullable()
      .optional(),
    dailyExecutionLimit: z
      .int({ message: '每日执行额度必须是整数' })
      .positive('每日执行额度必须大于 0')
      .nullable()
      .optional(),
    dailyApiCallLimit: z
      .int({ message: '每日 API 调用额度必须是整数' })
      .positive('每日 API 调用额度必须大于 0')
      .nullable()
      .optional(),
    storageQuotaMb: z
      .int({ message: '存储配额必须是整数' })
      .positive('存储配额必须大于 0')
      .nullable()
      .optional(),
    maxSandboxCpuPercent: z
      .int({ message: '沙箱 CPU 百分比上限必须是整数' })
      .min(1, '沙箱 CPU 百分比上限必须大于 0')
      .max(100, '沙箱 CPU 百分比上限不能超过 100')
      .nullable()
      .optional(),
    maxSandboxMemoryMb: z
      .int({ message: '沙箱内存上限必须是整数' })
      .positive('沙箱内存上限必须大于 0')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个配额字段',
  });

export type UpsertTenantQuotaDto = z.infer<typeof UpsertTenantQuotaSchema>;

export class UpsertTenantQuotaRequestDto extends createZodDto(
  UpsertTenantQuotaSchema,
) {}
