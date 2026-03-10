import { memo } from 'react'

import { cn } from '@/shared/lib/utils'

import { useEvidenceUiActions } from '../stores/evidenceUiStore'

interface InlineEvidenceRefProps {
  evidenceId: string
  index: number
  executionId: string
  className?: string
}

export const InlineEvidenceRef = memo(function InlineEvidenceRef({
  evidenceId,
  index,
  executionId,
  className,
}: InlineEvidenceRefProps) {
  const { openPanel, selectEvidence } = useEvidenceUiActions()

  return (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer text-blue-500 transition hover:text-blue-700',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation()
        openPanel(executionId)
        selectEvidence(evidenceId)
      }}
      title={`证据引用 #${index}`}
      data-testid={`inline-evidence-ref-${evidenceId}`}
    >
      <sup className="text-[10px] font-semibold">[{index}]</sup>
    </button>
  )
})
