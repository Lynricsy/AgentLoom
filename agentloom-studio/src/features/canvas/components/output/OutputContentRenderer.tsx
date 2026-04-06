import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { JsonTreeView } from '@/shared/components/json'
import { MarkdownRenderer } from '@/shared/components/markdown'
import { CodeViewer } from '@/shared/components/tool-renderers'
import { cn } from '@/shared/lib/utils'
import { parseJsonOutput, type OutputContentFormat } from '../../lib/outputContent'

export interface OutputContentRendererProps {
  format: OutputContentFormat
  output?: string | null
  isStreaming?: boolean
  placeholder: string
  className?: string
  dataTestId?: string
}

export const OutputContentRenderer = memo(function OutputContentRenderer({
  format,
  output,
  isStreaming = false,
  placeholder,
  className,
  dataTestId,
}: OutputContentRendererProps) {
  if (!output) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border/70 bg-surface/60 px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
        data-testid={dataTestId}
      >
        <p className="whitespace-pre-wrap leading-6">{placeholder}</p>
      </div>
    )
  }

  if (format === 'markdown') {
    return (
      <div
        className={cn(
          'rounded-xl border border-border/70 bg-surface/60 px-4 py-3',
          className,
        )}
        data-testid={dataTestId}
      >
        <MarkdownRenderer
          content={output}
          className="[&_li]:whitespace-pre-wrap [&_p]:whitespace-pre-wrap [overflow-wrap:anywhere]"
        />
      </div>
    )
  }

  if (format === 'json') {
    const parsed = !isStreaming ? parseJsonOutput(output) : { ok: false as const }

    if (parsed.ok) {
      return (
        <div
          className={cn(
            'rounded-xl border border-border/70 bg-surface/60 px-4 py-3',
            className,
          )}
          data-testid={dataTestId}
        >
          <JsonTreeView value={parsed.value} dataTestId="output-json-tree" />
        </div>
      )
    }

    return (
      <div className={cn('space-y-3', className)} data-testid={dataTestId}>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            {isStreaming
              ? 'JSON 仍在流式拼装，先按原文展示'
              : '当前输出不是合法 JSON，已回退到原文'}
          </span>
        </div>
        <CodeViewer
          code={output}
          language="json"
          maxHeight="520px"
          className="overflow-hidden rounded-xl border border-border/70"
        />
      </div>
    )
  }

  return (
    <pre
      className={cn(
        'rounded-xl border border-border/70 bg-surface/60 px-4 py-3 font-mono text-xs leading-6 text-foreground whitespace-pre-wrap break-words',
        className,
      )}
      data-testid={dataTestId}
    >
      {output}
    </pre>
  )
})
