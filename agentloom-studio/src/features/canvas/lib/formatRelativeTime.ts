/**
 * 将 Date 格式化为中文相对时间字符串
 *
 * - < 60s → "刚刚"
 * - < 60min → "X分钟前"
 * - < 24h → "X小时前"
 * - >= 24h → "X天前"
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()

  if (diffMs < 0) {
    return '刚刚'
  }

  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}天前`
}
