import { memo } from 'react'
import { FileSearch2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

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
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[11px] text-muted transition-colors',
        executionId && 'cursor-pointer hover:bg-primary/10 hover:text-primary',
        className,
      )}
      onClick={(e) => {
        if (!executionId) return
        e.stopPropagation()
        openPanel(executionId, nodeId, nodeName)
      }}
      data-testid="evidence-chips"
    >
      <FileSearch2 className="h-3 w-3" />
      {count} 条证据
    </button>
  )
})
