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
          'rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground',
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
          'rounded-lg border border-border bg-muted px-4 py-3',
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
            'rounded-lg border border-border bg-muted px-4 py-3',
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
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-2xs font-medium text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0">
            {isStreaming
              ? 'JSON 仍在流式拼装，先按原文展示'
              : '当前输出不是合法 JSON，已回退到原文'}
          </span>
        </div>
        <CodeViewer
          code={output}
          language="json"
          maxHeight="520px"
          className="overflow-hidden rounded-lg border border-border"
        />
      </div>
    )
  }

  return (
    <pre
      className={cn(
        'rounded-lg border border-border bg-muted px-4 py-3 font-mono text-xs leading-6 text-foreground whitespace-pre-wrap break-words',
        className,
      )}
      data-testid={dataTestId}
    >
      {output}
    </pre>
  )
})
