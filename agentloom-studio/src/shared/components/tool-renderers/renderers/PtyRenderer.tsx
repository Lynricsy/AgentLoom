import { memo, useMemo } from 'react'
import { TerminalSquare } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { ConsoleBlock } from '../primitives/ConsoleBlock'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

// --- Shared parsing helpers ---

function safeParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }
  return (raw ?? fallback) as T
}

function safeString(val: unknown): string {
  if (typeof val === 'string') return val
  if (val == null) return ''
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

// --- Type interfaces for each PTY tool ---

interface PtySpawnArgs {
  command: string
  args?: string[]
  cwd?: string
  title?: string
  cols?: number
  rows?: number
}

interface PtySpawnResult {
  id?: string
  pid?: number
  command?: string
  args?: string[]
  cwd?: string
  status?: string
  cols?: number
  rows?: number
  title?: string
  lineCount?: number
  createdAt?: string
}

interface PtyReadArgs {
  id: string
  offset?: number
  limit?: number
  pattern?: string
  ignoreCase?: boolean
}

interface PtyReadResult {
  lines?: string[]
  totalLines?: number
  hasMore?: boolean
}

interface PtyWriteArgs {
  id: string
  data: string
}

interface PtyKillArgs {
  id: string
  signal?: string
  cleanup?: boolean
}

interface PtySessionInfo {
  id?: string
  pid?: number
  command?: string
  status?: string
  title?: string
  lineCount?: number
}

// --- Escape sequence visualization ---

const CTRL_C = String.fromCharCode(0x03)
const CTRL_D = String.fromCharCode(0x04)
const CTRL_Z = String.fromCharCode(0x1a)

function visualizeEscapes(data: string): string {
  return data
    .replace(/\n/g, '\u21B5')     // ↵
    .replace(/\t/g, '\u21E5')     // ⇥
    .replaceAll(CTRL_C, '^C')
    .replaceAll(CTRL_D, '^D')
    .replaceAll(CTRL_Z, '^Z')
    .replace(/\r/g, '\\r')
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

// --- Summary component ---

const PtySummary = memo(function PtySummary({ toolCall }: ToolSummaryProps) {
  const summary = useMemo(() => {
    switch (toolCall.tool) {
      case 'pty_spawn': {
        const args = safeParse<PtySpawnArgs>(toolCall.args, { command: '' })
        const result = safeParse<PtySpawnResult>(toolCall.result, {})
        const id = result.id ?? ''
        return `PTY Spawn "${truncate(args.command, 40)}"${id ? ` (${id})` : ''}`
      }
      case 'pty_read': {
        const args = safeParse<PtyReadArgs>(toolCall.args, { id: '' })
        const result = safeParse<PtyReadResult>(toolCall.result, {})
        const lineCount = result.lines?.length ?? result.totalLines
        return `PTY Read ${args.id}${lineCount != null ? ` (${lineCount} lines)` : ''}`
      }
      case 'pty_write': {
        const args = safeParse<PtyWriteArgs>(toolCall.args, { id: '', data: '' })
        return `PTY Write ${args.id} "${truncate(visualizeEscapes(args.data), 30)}"`
      }
      case 'pty_list': {
        const result = safeParse<PtySessionInfo[]>(toolCall.result, [])
        const count = Array.isArray(result) ? result.length : 0
        return `PTY List (${count} sessions)`
      }
      case 'pty_kill': {
        const args = safeParse<PtyKillArgs>(toolCall.args, { id: '' })
        const signal = args.signal ?? 'SIGTERM'
        return `PTY Kill ${args.id} (${signal})`
      }
      default:
        return toolCall.tool
    }
  }, [toolCall.tool, toolCall.args, toolCall.result])

  return (
    <span className="truncate font-mono text-xs text-foreground">
      {summary}
    </span>
  )
})

// --- Sub-detail components ---

function PendingState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
      {message}
    </div>
  )
}

function ErrorState({ error }: { error: string }) {
  return (
    <pre className="overflow-auto rounded-md bg-error/10 p-3 font-mono text-xs leading-relaxed text-error">
      {error}
    </pre>
  )
}

function KeyValue({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs text-foreground/90 break-all">
        {String(value)}
      </span>
    </div>
  )
}

const PtySpawnDetail = memo(function PtySpawnDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<PtySpawnArgs>(toolCall.args, { command: '' })
  const result = safeParse<PtySpawnResult>(toolCall.result, {})

  if (state === 'pending') return <PendingState message="正在启动 PTY..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="space-y-0.5 rounded-lg bg-background p-3">
      <KeyValue label="ID" value={result.id} />
      <KeyValue label="命令" value={[args.command, ...(args.args ?? [])].join(' ')} />
      <KeyValue label="CWD" value={result.cwd ?? args.cwd} />
      <KeyValue label="PID" value={result.pid} />
      <KeyValue label="状态" value={result.status} />
      <KeyValue label="Size" value={result.cols && result.rows ? `${result.cols}x${result.rows}` : undefined} />
      <KeyValue label="Title" value={result.title ?? args.title} />
      <KeyValue label="行数" value={result.lineCount} />
    </div>
  )
})

const PtyReadDetail = memo(function PtyReadDetail({ toolCall, state }: ToolRendererProps) {
  const result = safeParse<PtyReadResult>(toolCall.result, {})

  if (state === 'pending') return <PendingState message="正在读取 PTY 输出..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  const output = Array.isArray(result.lines) ? result.lines.join('\n') : safeString(toolCall.result)

  if (!output) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-background p-6 text-xs text-muted-foreground">
        无输出
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ConsoleBlock output={output} />
      {result.totalLines != null && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Total: {result.totalLines} lines</span>
          {result.hasMore && <span className="text-warning">还有更多</span>}
        </div>
      )}
    </div>
  )
})

const PtyWriteDetail = memo(function PtyWriteDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<PtyWriteArgs>(toolCall.args, { id: '', data: '' })

  if (state === 'pending') return <PendingState message="正在写入 PTY..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="rounded-lg bg-background p-3">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        输入数据
      </div>
      <div className="font-mono text-xs text-foreground/90">
        {visualizeEscapes(args.data)}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Session: {args.id}
      </div>
    </div>
  )
})

const PtyListDetail = memo(function PtyListDetail({ toolCall, state }: ToolRendererProps) {
  const sessions = safeParse<PtySessionInfo[]>(toolCall.result, [])

  if (state === 'pending') return <PendingState message="正在列出 PTY 会话..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  const list = Array.isArray(sessions) ? sessions : []

  if (list.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-background p-6 text-xs text-muted-foreground">
        无活跃的 PTY 会话
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg bg-background">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-1.5 text-left">状态</th>
            <th className="px-3 py-1.5 text-left">ID</th>
            <th className="px-3 py-1.5 text-left">命令</th>
            <th className="px-3 py-1.5 text-right">PID</th>
            <th className="px-3 py-1.5 text-right">行数</th>
          </tr>
        </thead>
        <tbody>
          {list.map((session, i) => (
            <tr key={session.id ?? i} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-1.5">
                <span
                  className={cn(
                    'inline-block size-2 rounded-full',
                    session.status === 'running' ? 'bg-success' :
                    session.status === 'exited' ? 'bg-muted-foreground' : 'bg-warning',
                  )}
                />
              </td>
              <td className="px-3 py-1.5 font-mono text-foreground/80">{session.id ?? '-'}</td>
              <td className="px-3 py-1.5 font-mono text-foreground/80">{session.command ?? '-'}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">{session.pid ?? '-'}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">{session.lineCount ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

const PtyKillDetail = memo(function PtyKillDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<PtyKillArgs>(toolCall.args, { id: '' })

  if (state === 'pending') return <PendingState message="正在终止 PTY 会话..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="rounded-lg bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-foreground/90">
        <span className="text-error">已终止</span>
        <span className="font-mono">{args.id}</span>
        <span className="text-muted-foreground">signal: {args.signal ?? 'SIGTERM'}</span>
      </div>
    </div>
  )
})

// --- Main detail router ---

const PtyDetail = memo(function PtyDetail(props: ToolRendererProps) {
  switch (props.toolCall.tool) {
    case 'pty_spawn':
      return <PtySpawnDetail {...props} />
    case 'pty_read':
      return <PtyReadDetail {...props} />
    case 'pty_write':
      return <PtyWriteDetail {...props} />
    case 'pty_list':
      return <PtyListDetail {...props} />
    case 'pty_kill':
      return <PtyKillDetail {...props} />
    default:
      return <PtySpawnDetail {...props} />
  }
})

export const ptyRendererDefinition: ToolRendererDefinition = {
  Summary: PtySummary,
  Detail: PtyDetail,
  icon: TerminalSquare,
}
