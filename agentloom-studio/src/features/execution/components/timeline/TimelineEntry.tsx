import { memo, useEffect, useState } from 'react'

import { cn } from '@/shared/lib/utils'

import type { TimelineData } from '../../hooks/useTimelineData'
import { DecisionAnnotation } from './DecisionAnnotation'
import { EvidenceChips } from './EvidenceChips'
import { FailedNodeError } from './FailedNodeError'
import { OutputLevelBadge } from './OutputLevelBadge'
import { TimelineDuration } from './TimelineDuration'
import { TimelineHeader } from './TimelineHeader'
import { TimelineIO } from './TimelineIO'

interface TimelineEntryProps {
  data: TimelineData
  isSelected: boolean
  onSelect: () => void
  executionId?: string
  executionStartedAt: string | null
  executionCompletedAt: string | null
}

export const TimelineEntry = memo(function TimelineEntry({
  data,
  isSelected,
  onSelect,
  executionId,
  executionStartedAt,
  executionCompletedAt,
}: TimelineEntryProps) {
  const {
    step,
    autonomyMode,
    agentDecisionEvidence,
    interventionEvidence,
    outputFormatLevel,
    evidenceCount,
  } = data
  const isFailed = step.status === 'failed'
  const [expanded, setExpanded] = useState(isFailed)

  useEffect(() => {
    if (isFailed) {
      setExpanded(true)
    }
  }, [isFailed])

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card/60 transition',
        isSelected && 'border-primary/40 bg-primary/5',
        isFailed && 'border-rose-500/30 bg-rose-500/5',
      )}
      data-testid={`timeline-entry-${step.id}`}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-card/80"
        onClick={() => {
          onSelect()
          setExpanded((prev) => !prev)
        }}
      >
        <TimelineHeader
          nodeName={step.nodeName}
          nodeType={step.nodeType}
          status={step.status}
          startedAt={step.startedAt}
          completedAt={step.completedAt}
        />

        <TimelineDuration
          status={step.status}
          startedAt={step.startedAt}
          completedAt={step.completedAt}
          executionStartedAt={executionStartedAt}
          executionCompletedAt={executionCompletedAt}
        />

        <div className="flex flex-wrap items-center gap-2">
          <OutputLevelBadge level={outputFormatLevel} />
          <EvidenceChips count={evidenceCount} executionId={executionId} />
        </div>
      </button>

      {(autonomyMode || interventionEvidence) && (
        <div className={cn('px-4', expanded ? 'pb-2' : 'pb-3')}>
          <DecisionAnnotation
            autonomyMode={autonomyMode}
            agentDecisionEvidence={agentDecisionEvidence}
            interventionEvidence={interventionEvidence}
            showDetails={expanded}
          />
        </div>
      )}

      {expanded && (
        <div className="space-y-2 px-4 pb-3">
          <TimelineIO
            input={step.input}
            output={step.output}
            startedAt={step.startedAt}
            completedAt={step.completedAt}
            retryCount={step.retryCount}
            executionId={executionId}
          />

          {isFailed && (
            <FailedNodeError
              errorMessage={step.errorMessage}
              errorDetail={step.errorDetail}
            />
          )}
        </div>
      )}
    </div>
  )
})
