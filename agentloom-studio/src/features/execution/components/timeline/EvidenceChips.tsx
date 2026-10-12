import { memo } from 'react'
import { FileSearch2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

import { useEvidenceUiActions } from '@/features/evidence'

interface EvidenceChipsProps {
  count: number
  executionId?: string
  nodeId?: string
  nodeName?: string
  className?: string
}

export const EvidenceChips = memo(function EvidenceChips({
  count,
  executionId,
  nodeId,
  nodeName,
  className,
}: EvidenceChipsProps) {
  const { openPanel } = useEvidenceUiActions()

  if (count <= 0) {
    return null
  }

  const label = (
    <>
      <FileSearch2 />
      <span className="tabular-nums">{count} 条证据</span>
    </>
  )

  // 没有执行上下文时无法打开证据面板，只展示计数，不渲染成可点按钮
  if (!executionId) {
    return (
      <Badge
        variant="secondary"
        size="sm"
        className={cn('[&_svg]:size-3', className)}
        data-testid="evidence-chips"
      >
        {label}
      </Badge>
    )
  }

  return (
    <Button
      variant="outline"
      size="xs"
      className={cn(
        'rounded-full font-normal text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation()
        openPanel(executionId, nodeId, nodeName)
      }}
      data-testid="evidence-chips"
    >
      {label}
    </Button>
  )
})
