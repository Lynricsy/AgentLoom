import { memo, useCallback, useState } from 'react'
import { Check, Copy, Wrench } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { ToolRendererProps, ToolSummaryProps } from './types'

/**
 * Format a value for display. Attempts JSON formatting if value
 * is a JSON string or object.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return 'null'

  if (typeof value === 'string') {
    // Try to parse and re-format JSON strings
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }, [text])

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => void handleCopy()}
      className="size-6 shrink-0 text-muted-foreground hover:bg-border hover:text-foreground [&_svg]:size-3"
      title="复制"
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const formatted = formatValue(value)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <CopyButton text={formatted} />
      </div>
      <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        <code>{formatted}</code>
      </pre>
    </div>
  )
}

export const DefaultSummary = memo(function DefaultSummary({
  toolCall,
}: ToolSummaryProps) {
  return (
    <span className="truncate font-mono text-xs text-foreground">
      {toolCall.tool}
    </span>
  )
})

export const DefaultDetail = memo(function DefaultDetail({
  toolCall,
  state,
}: ToolRendererProps) {
  const hasArgs = toolCall.args !== undefined && toolCall.args !== null
  const hasResult = toolCall.result !== undefined && toolCall.result !== null
  const hasError = !!toolCall.error

  return (
    <div className="space-y-3">
      {hasArgs && <JsonBlock label="输入" value={toolCall.args} />}

      {state === 'completed' && hasResult && (
        <JsonBlock label="输出" value={toolCall.result} />
      )}

      {(state === 'failed' || hasError) && toolCall.error && (
        <div>
          <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-error">
            错误
          </span>
          <pre
            className={cn(
              'overflow-auto rounded-md bg-error/10 p-3 font-mono text-xs leading-relaxed text-error',
            )}
          >
            {toolCall.error}
          </pre>
        </div>
      )}

      {state === 'pending' && !hasArgs && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          等待工具执行...
        </div>
      )}
    </div>
  )
})

export const DefaultIcon = Wrench

export const defaultRendererDefinition = {
  Summary: DefaultSummary,
  Detail: DefaultDetail,
  icon: DefaultIcon,
}
