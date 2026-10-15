import { memo } from 'react'
import { useDecisionRecords } from '../api/decision-record-queries'
import { formatJevShadowLabel } from '../lib/presentation'
import type { DecisionSubjectType } from '../types'
import { Badge } from '@/shared/ui/badge'

interface JevShadowBadgeProps {
  subjectType: DecisionSubjectType
  subjectId: string
  /** choice 决策的选项 id → 可读名称（如模型配置 id → 模型名） */
  choiceLabels?: Record<string, string>
  className?: string
}

/** 该主体存在 Jev 影子记录时显示影子结果；没有影子记录（未配置 Jev 或尚未返回）时不渲染 */
export const JevShadowBadge = memo(function JevShadowBadge({
  subjectType,
  subjectId,
  choiceLabels,
  className,
}: JevShadowBadgeProps) {
  const { data } = useDecisionRecords({ subjectType, subjectId })
  const shadow = data?.data.find((record) => record.mode === 'shadow')

  if (!shadow) {
    return null
  }

  return (
    <Badge
      variant={shadow.outcome ? 'info' : 'secondary'}
      size="sm"
      className={className}
      data-testid="jev-shadow-badge"
      title={
        shadow.error ??
        (shadow.model ? `影子模式，仅记录：${shadow.model}` : '影子模式，仅记录')
      }
    >
      {formatJevShadowLabel(shadow, choiceLabels)}
    </Badge>
  )
})
