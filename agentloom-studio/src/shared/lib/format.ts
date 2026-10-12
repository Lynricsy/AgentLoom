/**
 * 展示用格式化 — 日期时间 / 字节 / 百分比 / 数字统一走这里（locale 固定 zh-CN），
 * 禁止在组件里就地 `toLocaleString()` 或 `/ 1024`。
 */

type DateInput = string | number | Date | null | undefined

const DATE_TIME = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const DATE = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' })
const TIME = new Intl.DateTimeFormat('zh-CN', { timeStyle: 'short' })
const NUMBER = new Intl.NumberFormat('zh-CN')
const BYTE_NUMBER = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })

/** 空值与无效日期的占位符 */
export const EMPTY_VALUE = '—'

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 2026年10月7日 21:55 */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value)
  return date ? DATE_TIME.format(date) : EMPTY_VALUE
}

/** 2026年10月7日 */
export function formatDate(value: DateInput): string {
  const date = toDate(value)
  return date ? DATE.format(date) : EMPTY_VALUE
}

/** 21:55 */
export function formatTime(value: DateInput): string {
  const date = toDate(value)
  return date ? TIME.format(date) : EMPTY_VALUE
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** 1024 进制，最多 1 位小数；数字与单位之间为不换行空格（U+00A0） */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return EMPTY_VALUE
  }
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const amount = unit === 0 ? NUMBER.format(value) : BYTE_NUMBER.format(value)
  return `${amount}\u00A0${BYTE_UNITS[unit]}`
}

/** ratio 为 0–1 的比例：0.873 → 87.3% */
export function formatPercent(ratio: number, digits = 1): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(ratio)
}

/** 千分位：12345 → 12,345 */
export function formatNumber(n: number): string {
  return NUMBER.format(n)
}

const DECIMAL_CACHE = new Map<number, Intl.NumberFormat>()

/** 固定小数位：0.8734 → 0.87（相关度分数、比率等） */
export function formatDecimal(n: number, digits = 2): string {
  let formatter = DECIMAL_CACHE.get(digits)
  if (!formatter) {
    formatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    DECIMAL_CACHE.set(digits, formatter)
  }
  return formatter.format(n)
}
