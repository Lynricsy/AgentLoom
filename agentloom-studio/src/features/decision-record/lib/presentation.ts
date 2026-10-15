import type { DecisionRecord } from '../types'

const probabilityFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})

/**
 * Jev 影子记录的展示文案：noul → `Jev 影子：p=0.82`，choice → `Jev 影子：<模型名> conf=0.64`，
 * 调用失败 → `Jev 影子：失败`。choiceLabels 把选项 id（如模型配置 id）映射为可读名称。
 */
export function formatJevShadowLabel(
  record: DecisionRecord,
  choiceLabels: Record<string, string> = {},
): string {
  const { outcome } = record

  if (!outcome) {
    return 'Jev 影子：失败'
  }

  if (outcome.type === 'noul') {
    return `Jev 影子：p=${probabilityFormatter.format(outcome.value)}`
  }

  const choice = choiceLabels[outcome.choice] ?? outcome.choice
  return `Jev 影子：${choice} conf=${probabilityFormatter.format(outcome.confidence)}`
}
