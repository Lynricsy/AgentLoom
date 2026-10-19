import type { ExecutionResponse } from '../api/executionApi'
import { Badge } from '@/shared/ui/badge'

interface DraftRunBadgeProps {
  execution: Pick<ExecutionResponse, 'definitionSource'>
}

/**
 * Studio 以画布草稿运行的执行没有对应的发布版本（workflowVersionId 为 null），
 * 运行的定义只在执行的 definitionSnapshot 中。版本运行不渲染任何内容。
 */
export function DraftRunBadge({ execution }: DraftRunBadgeProps) {
  if (execution.definitionSource !== 'draft') {
    return null
  }

  return (
    <Badge
      variant="warning"
      size="sm"
      title="以运行时的画布草稿执行，不对应任何发布版本"
      data-testid="execution-draft-run-badge"
    >
      草稿运行
    </Badge>
  )
}
