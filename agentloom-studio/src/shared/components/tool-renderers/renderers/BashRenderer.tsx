import { memo, useMemo } from 'react'
import { Terminal } from 'lucide-react'
import { ConsoleBlock } from '../primitives/ConsoleBlock'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface BashArgs {
  command: string
  timeout?: number
}

function parseArgs(raw: unknown): BashArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BashArgs
    } catch {
      return { command: raw }
    }
  }
  return (raw ?? { command: '' }) as BashArgs
}

function resultToString(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw == null) return ''
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
}

function extractExitCode(output: string): number | undefined {
  const match = /[Ee]xit\s+code[:\s]+(\d+)/i.exec(output)
  if (match?.[1]) {
    const code = parseInt(match[1], 10)
    return Number.isFinite(code) ? code : undefined
  }
  return undefined
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

const BashSummary = memo(function BashSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])

  return (
    <span className="truncate font-mono text-xs text-foreground">
      $ {truncate(args.command || '', 80)}
    </span>
  )
})

const BashDetail = memo(function BashDetail({ toolCall, state }: ToolRendererProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const output = useMemo(() => resultToString(toolCall.result), [toolCall.result])
  const exitCode = useMemo(
    () => (toolCall.error ? 1 : extractExitCode(output)),
    [toolCall.error, output],
  )

  if (state === 'pending' || (state === 'streaming' && !toolCall.result && !toolCall.error)) {
    return (
      <div className="rounded-lg bg-zinc-900 p-3 font-mono text-sm">
        <div className="flex items-center gap-2">
          <span className="select-none text-emerald-400">$</span>
          <span className="text-zinc-100">{args.command}</span>
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    )
  }

  if (state === 'failed' && toolCall.error && !output) {
    return (
      <ConsoleBlock
        command={args.command}
        output={toolCall.error}
        exitCode={1}
        variant="error"
      />
    )
  }

  return (
    <ConsoleBlock
      command={args.command}
      output={output || toolCall.error || ''}
      exitCode={exitCode}
      variant={state === 'failed' ? 'error' : 'default'}
    />
  )
})

export const bashRendererDefinition: ToolRendererDefinition = {
  Summary: BashSummary,
  Detail: BashDetail,
  icon: Terminal,
}
