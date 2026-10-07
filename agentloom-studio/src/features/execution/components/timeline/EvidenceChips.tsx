import { memo } from 'react'
import { FileSearch2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
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

  return (
    <Button
      variant="ghost"
      size="xs"
      className={cn(
        'h-auto gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-normal text-muted-foreground [&_svg]:size-3',
        executionId
          ? 'cursor-pointer hover:bg-primary/10 hover:text-primary'
          : 'hover:bg-muted',
        className,
      )}
      onClick={(e) => {
        if (!executionId) return
        e.stopPropagation()
        openPanel(executionId, nodeId, nodeName)
      }}
      data-testid="evidence-chips"
    >
      <FileSearch2 />
      {count} 条证据
    </Button>
  )
})
