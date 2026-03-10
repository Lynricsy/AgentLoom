import { memo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

import { formatClockTime, summarizeDataShape } from '../../lib/presentation'

interface TimelineIOProps {
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  retryCount: number
  className?: string
}

function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return '无数据'
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

export const TimelineIO = memo(function TimelineIO({
  input,
  output,
  startedAt,
  completedAt,
  retryCount,
  className,
}: TimelineIOProps) {
  const [expanded, setExpanded] = useState(false)

  const inputSummary = summarizeDataShape(input)
  const outputSummary = summarizeDataShape(output)

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
        <span>输入：{inputSummary}</span>
        <span className="mx-1">·</span>
        <span>输出：{outputSummary}</span>
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
            <pre className="max-h-[300px] overflow-auto text-xs text-foreground/80">
              {formatJson(input)}
            </pre>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              输出
            </p>
            <pre className="max-h-[300px] overflow-auto text-xs text-foreground/80">
              {formatJson(output)}
            </pre>
          </div>
          <div className="text-[11px] text-muted-foreground sm:col-span-2">
            开始：{formatClockTime(startedAt)} · 结束：
            {formatClockTime(completedAt)}
          </div>
        </div>
      )}
    </div>
  )
})
