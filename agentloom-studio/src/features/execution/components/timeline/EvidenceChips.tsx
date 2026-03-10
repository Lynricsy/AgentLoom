import { memo } from 'react'
import { FileSearch2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

interface EvidenceChipsProps {
  count: number
  className?: string
}

export const EvidenceChips = memo(function EvidenceChips({
  count,
  className,
}: EvidenceChipsProps) {
  if (count <= 0) {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground',
        className,
      )}
      data-testid="evidence-chips"
    >
      <FileSearch2 className="h-3 w-3" />
      {count} 条证据
    </span>
  )
})
