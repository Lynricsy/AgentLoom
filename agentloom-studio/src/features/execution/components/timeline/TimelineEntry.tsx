import { memo, useEffect, useState } from 'react'

import { Collapse } from '@/shared/components/collapse/Collapse'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

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
    nodeErrorEvidenceRecords,
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
        'min-w-0 rounded-lg border border-border bg-surface transition-colors duration-150',
        isSelected && 'border-primary bg-primary/5',
        isFailed && 'border-error/40 bg-error/5',
        !isSelected && !isFailed && 'hover:border-border-hover',
      )}
      data-testid={`timeline-entry-${step.id}`}
    >
      <Button
        variant="ghost"
        aria-expanded={expanded}
        className="flex h-auto w-full flex-col items-stretch gap-2 whitespace-normal rounded-lg px-4 py-3 text-left font-normal hover:bg-transparent"
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
          expanded={expanded}
        />

        <TimelineDuration
          status={step.status}
          startedAt={step.startedAt}
          completedAt={step.completedAt}
          executionStartedAt={executionStartedAt}
          executionCompletedAt={executionCompletedAt}
        />
      </Button>

      {/* 证据 chip 自身是按钮，必须放在头部按钮之外；两者都不渲染时整行隐藏 */}
      <div className="-mt-1 flex flex-wrap items-center gap-2 px-4 pb-3 empty:hidden">
        <OutputLevelBadge level={outputFormatLevel} />
        <EvidenceChips
          count={evidenceCount}
          executionId={executionId}
          nodeId={step.nodeId}
          nodeName={step.nodeName}
        />
      </div>

      {(autonomyMode || interventionEvidence) && (
        <div className={cn('px-4', expanded ? 'pb-2' : 'pb-3')}>
          <DecisionAnnotation
            autonomyMode={autonomyMode}
            agentDecisionEvidence={agentDecisionEvidence}
            interventionEvidence={interventionEvidence}
            showDetails={expanded}
            executionId={executionId}
            nodeId={step.nodeId}
            nodeName={step.nodeName}
          />
        </div>
      )}

      <Collapse open={expanded}>
        <div className="space-y-2 px-4 pb-3">
          <TimelineIO
            input={step.input}
            output={step.output}
            startedAt={step.startedAt}
            completedAt={step.completedAt}
            retryCount={step.retryCount}
            executionId={executionId}
            nodeId={step.nodeId}
            nodeName={step.nodeName}
          />

          {isFailed && (
            <FailedNodeError
              errorMessage={step.errorMessage}
              errorDetail={step.errorDetail}
              evidenceRecords={nodeErrorEvidenceRecords}
            />
          )}
        </div>
      </Collapse>
    </div>
  )
})
