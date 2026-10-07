import { memo, useCallback, useMemo, useState } from 'react'
import Convert from 'ansi-to-html'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

const ansiConverter = new Convert({
  newline: true,
  escapeXML: true,
  colors: {
    0: '#1e1e1e',
    1: '#f44747',
    2: '#6a9955',
    3: '#e8ab53',
    4: '#569cd6',
    5: '#c586c0',
    6: '#4ec9b0',
    7: '#d4d4d4',
    8: '#808080',
    9: '#f44747',
    10: '#6a9955',
    11: '#e8ab53',
    12: '#569cd6',
    13: '#c586c0',
    14: '#4ec9b0',
    15: '#d4d4d4',
  },
})

export interface ConsoleBlockProps {
  command?: string
  output: string
  exitCode?: number
  maxHeight?: string
  className?: string
  variant?: 'default' | 'error'
}

export const ConsoleBlock = memo(function ConsoleBlock({
  command,
  output,
  exitCode,
  maxHeight = '480px',
  className,
  variant = 'default',
}: ConsoleBlockProps) {
  const [copied, setCopied] = useState(false)

  // Convert ANSI escape sequences to HTML
  const outputHtml = useMemo(() => {
    try {
      return ansiConverter.toHtml(output)
    } catch {
      return output
    }
  }, [output])

  // Plain text for copy (strip ANSI codes)
  const plainText = useMemo(() => {
    const combined = command ? `$ ${command}\n${output}` : output
    // Strip ANSI escape sequences
    return combined.replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*[a-zA-Z]/g,
      '',
    )
  }, [command, output])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(plainText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }, [plainText])

  const isError = variant === 'error' || (exitCode !== undefined && exitCode !== 0)

  return (
    <div
      className={cn(
        'group relative rounded-lg bg-muted font-mono text-sm',
        className,
      )}
    >
      {/* Copy button */}
      <Button
        variant="outline"
        size="icon-xs"
        onClick={() => void handleCopy()}
        aria-label="复制"
        className="absolute right-2 top-2 z-10 size-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 [&_svg]:size-3"
      >
        {copied ? <Check /> : <Copy />}
      </Button>

      <div className="overflow-auto p-3" style={{ maxHeight }}>
        {/* Command line */}
        {command && (
          <div className="mb-1 flex items-start gap-2">
            <span className="select-none text-success">$</span>
            <span className="text-foreground">{command}</span>
          </div>
        )}

        {/* Output */}
        <div
          className={cn(
            'whitespace-pre-wrap break-all leading-relaxed',
            isError ? 'text-error' : 'text-muted-foreground',
          )}
          dangerouslySetInnerHTML={{ __html: outputHtml }}
        />

        {/* Exit code */}
        {exitCode !== undefined && exitCode !== 0 && (
          <div className="mt-2 border-t border-border pt-2 text-xs text-error">
            退出代码: {exitCode}
          </div>
        )}
      </div>
    </div>
  )
})
