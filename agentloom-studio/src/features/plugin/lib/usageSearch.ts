import { z } from 'zod'

/** `YYYY-MM-DD`，与 `<input type="date">` 的取值格式一致 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const pluginUsageSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional().catch(undefined),
  periodStart: z.string().regex(DATE_PATTERN).optional().catch(undefined),
  periodEnd: z.string().regex(DATE_PATTERN).optional().catch(undefined),
})

export type PluginUsageSearchParams = z.infer<typeof pluginUsageSearchSchema>

export interface PluginUsageSearch {
  page: number
  /** `YYYY-MM-DD`（UTC） */
  periodStart: string
  periodEnd: string
}

export function parsePluginUsageSearch(input: unknown): PluginUsageSearchParams {
  return pluginUsageSearchSchema.parse(input)
}

function toUtcDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** 默认周期与服务端 summary 的缺省一致：当前 UTC 自然月 1 号至今 */
export function resolvePluginUsageSearch(
  input: PluginUsageSearchParams,
  now: Date = new Date(),
): PluginUsageSearch {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )

  return {
    page: input.page ?? 1,
    periodStart: input.periodStart ?? toUtcDay(monthStart),
    periodEnd: input.periodEnd ?? toUtcDay(now),
  }
}

/**
 * 日期区间 → 服务端要求的 ISO 带偏移时间戳。
 * 服务端用闭区间过滤 createdAt，所以结束日取当天最后一毫秒，
 * 否则当天产生的用量会被整段漏掉。
 */
export function toPluginUsageRange(search: PluginUsageSearch): {
  startDate: string
  endDate: string
} {
  return {
    startDate: `${search.periodStart}T00:00:00.000Z`,
    endDate: `${search.periodEnd}T23:59:59.999Z`,
  }
}
