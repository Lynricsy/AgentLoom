import { memo, useCallback, useMemo, useState } from 'react'
import Convert from 'ansi-to-html'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

const ansiConverter = new Convert({
  newline: true,
  escapeXML: true,
  // 输出容器是 bg-muted（随主题变化），ANSI 调色板走 token，浅色/深色下都可读
  colors: {
    0: 'var(--color-foreground)',
    1: 'var(--color-error)',
    2: 'var(--color-success)',
    3: 'var(--color-warning)',
    4: 'var(--color-info)',
    5: 'var(--color-node-agent)',
    6: 'var(--color-node-knowledge)',
    7: 'var(--color-muted-foreground)',
    8: 'var(--color-subtle-foreground)',
    9: 'var(--color-error)',
    10: 'var(--color-success)',
    11: 'var(--color-warning)',
    12: 'var(--color-info)',
    13: 'var(--color-node-agent)',
    14: 'var(--color-node-knowledge)',
    15: 'var(--color-muted-foreground)',
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
        className="absolute right-2 top-2 z-10 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {copied ? <Check /> : <Copy />}
      </Button>

      {/* pr-10 给右上角复制按钮留位，首行长内容不从按钮下穿过 */}
      <div className="overflow-auto p-3 pr-10" style={{ maxHeight }}>
        {/* Command line */}
        {command && (
          <div className="mb-1 flex items-start gap-2">
            <span className="select-none text-success">$</span>
            <span className="min-w-0 whitespace-pre-wrap break-all text-foreground">
              {command}
            </span>
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
