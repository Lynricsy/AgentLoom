import { memo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { JsonTreeView } from '@/shared/components/json'
import { cn } from '@/shared/lib/utils'

import {
  formatClockTime,
  formatExecutionDuration,
} from '../../lib/presentation'

import {
  hasEvidenceRefs,
  parseEvidenceRefs,
} from '@/features/evidence/lib/parseEvidenceRefs'
import { InlineEvidenceRef } from '@/features/evidence/components/InlineEvidenceRef'

interface TimelineIOProps {
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  retryCount: number
  executionId?: string
  nodeId?: string
  nodeName?: string
  className?: string
}

function TextWithRefs({
  text,
  executionId,
  nodeId,
  nodeName,
}: {
  text: string
  executionId?: string
  nodeId?: string
  nodeName?: string
}) {
  if (!executionId || !hasEvidenceRefs(text)) {
    return <>{text}</>
  }

  const segments = parseEvidenceRefs(text)

  return (
    <>
      {segments.map((seg) =>
        seg.type === 'text' ? (
          <span key={`text-${seg.content.slice(0, 20)}`}>{seg.content}</span>
        ) : (
           <InlineEvidenceRef
             key={seg.evidenceId}
             evidenceId={seg.evidenceId}
             index={seg.index}
             executionId={executionId}
             nodeId={nodeId}
             nodeName={nodeName}
           />
         ),
       )}
     </>
   )
}

function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return '无数据'
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function buildPreview(data: Record<string, unknown> | null) {
  const json = formatJson(data)
  const singleLine = json.replace(/\s+/g, ' ')

  return singleLine.length > 120
    ? `${singleLine.slice(0, 117)}...`
    : singleLine
}

export const TimelineIO = memo(function TimelineIO({
  input,
  output,
  startedAt,
  completedAt,
  retryCount,
  executionId,
  nodeId,
  nodeName,
  className,
}: TimelineIOProps) {
  const [expanded, setExpanded] = useState(false)

  const inputPreview = buildPreview(input)
  const outputPreview = buildPreview(output)
  const duration = formatExecutionDuration(startedAt, completedAt)

  return (
    <div className={cn('space-y-1', className)} data-testid="timeline-io">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation()
          setExpanded((prev) => !prev)
        }}
        data-testid="timeline-io-toggle"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span data-testid="timeline-io-input-preview">输入预览：{inputPreview}</span>
        <span className="mx-1">·</span>
        <span data-testid="timeline-io-output-preview">输出预览：{outputPreview}</span>
        <span className="mx-1">·</span>
        <span data-testid="timeline-io-duration">耗时 {duration}</span>
        {retryCount > 0 && (
          <>
            <span className="mx-1">·</span>
            <span className="text-amber-300">重试 {retryCount} 次</span>
          </>
        )}
      </button>

      {expanded && (
        <div
          className="grid gap-2 sm:grid-cols-2"
          data-testid="timeline-io-expanded"
        >
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              输入
            </p>
            <div className="max-h-[300px] overflow-auto">
              <JsonTreeView
                value={input}
                renderString={(text) => (
                  <TextWithRefs
                    text={text}
                    executionId={executionId}
                    nodeId={nodeId}
                    nodeName={nodeName}
                  />
                )}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              输出
            </p>
            <div className="max-h-[300px] overflow-auto">
              <JsonTreeView
                value={output}
                renderString={(text) => (
                  <TextWithRefs
                    text={text}
                    executionId={executionId}
                    nodeId={nodeId}
                    nodeName={nodeName}
                  />
                )}
              />
            </div>
          </div>
          <div
            className="grid gap-2 text-[11px] text-muted-foreground sm:col-span-2 sm:grid-cols-4"
            data-testid="timeline-io-meta"
          >
            <span>开始：{formatClockTime(startedAt)}</span>
            <span>结束：{formatClockTime(completedAt)}</span>
            <span>耗时：{duration}</span>
            <span>重试：{retryCount} 次</span>
          </div>
        </div>
      )}
    </div>
  )
})
