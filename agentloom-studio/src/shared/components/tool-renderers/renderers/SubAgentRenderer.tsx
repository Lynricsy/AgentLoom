import { createContext, memo, useContext, useMemo } from 'react'
import { Bot, ExternalLink } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

// --- SubAgent navigation context ---

export interface SubAgentNavigationContextValue {
  onDrillIn?: (handle: string) => void
}

export const SubAgentNavContext = createContext<SubAgentNavigationContextValue>({})
const useSubAgentNav = () => useContext(SubAgentNavContext)

// --- Arg types ---

interface CallSubAgentArgs {
  alias?: string
  agentId?: string
  ref?: string
  input?: string
  message?: string
}

interface WaitArgs {
  handles?: string[]
  handle?: string
}

interface StatusArgs {
  handle?: string
}

// --- Helpers ---

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

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function extractHandle(toolCall: { args?: unknown; result?: unknown }): string | undefined {
  const args = safeParse<Record<string, unknown>>(toolCall.args, {})
  const result = safeParse<Record<string, unknown>>(toolCall.result, {})
  return (
    (typeof result.handle === 'string' ? result.handle : undefined) ??
    (typeof args.handle === 'string' ? args.handle : undefined)
  )
}

function extractAlias(toolCall: { args?: unknown; result?: unknown }): string {
  const args = safeParse<CallSubAgentArgs>(toolCall.args, {})
  return args.alias ?? args.agentId ?? args.ref ?? 'subagent'
}

// --- Shared sub-components ---

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
    <pre className="overflow-auto rounded-md bg-red-950/30 p-3 font-mono text-xs leading-relaxed text-red-400">
      {error}
    </pre>
  )
}

function DrillInButton({ handle }: { handle: string }) {
  const { onDrillIn } = useSubAgentNav()
  if (!onDrillIn) return null

  return (
    <button
      type="button"
      onClick={() => onDrillIn(handle)}
      className="mt-2 flex items-center gap-1.5 rounded-md border border-info/30 px-3 py-1.5 text-xs text-info transition-colors hover:bg-info/10"
    >
      <ExternalLink className="size-3" />
      进入子代理视图
    </button>
  )
}

// --- Summary ---

const SubAgentSummary = memo(function SubAgentSummary({ toolCall }: ToolSummaryProps) {
  const summary = useMemo(() => {
    switch (toolCall.tool) {
      case 'call_subagent': {
        const alias = extractAlias(toolCall)
        return `Call "${alias}"`
      }
      case 'spawn_subagent': {
        const alias = extractAlias(toolCall)
        const handle = extractHandle(toolCall)
        return `Spawn "${alias}"${handle ? ` (${handle})` : ''}`
      }
      case 'wait_for_subagents': {
        const args = safeParse<WaitArgs>(toolCall.args, {})
        const handles = args.handles ?? (args.handle ? [args.handle] : [])
        return `Wait for ${handles.length} subagent${handles.length !== 1 ? 's' : ''}`
      }
      case 'get_subagent_status': {
        const args = safeParse<StatusArgs>(toolCall.args, {})
        return `Status ${args.handle ?? ''}`
      }
      default:
        return toolCall.tool
    }
  }, [toolCall])

  return (
    <span className="truncate font-mono text-xs text-foreground">
      {summary}
    </span>
  )
})

// --- Detail sub-components ---

const CallDetail = memo(function CallDetail({ toolCall, state }: ToolRendererProps) {
  const alias = extractAlias(toolCall)
  const handle = extractHandle(toolCall)
  const output = safeString(toolCall.result)

  if (state === 'pending') return <PendingState message={`Calling ${alias}...`} />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-zinc-900 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-purple-400" />
          <span className="text-xs font-medium text-foreground">{alias}</span>
          {handle && (
            <span className="text-[10px] font-mono text-muted-foreground/50">{handle}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
              state === 'completed'
                ? 'bg-success/15 text-success'
                : state === 'failed'
                  ? 'bg-error/15 text-error'
                  : 'bg-info/15 text-info',
            )}
          >
            {state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'running'}
          </span>
        </div>
      </div>

      {state === 'completed' && output && (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Output
          </div>
          <pre className="max-h-[200px] overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
            {truncate(output, 500)}
          </pre>
        </div>
      )}

      {handle && <DrillInButton handle={handle} />}
    </div>
  )
})

const WaitDetail = memo(function WaitDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<WaitArgs>(toolCall.args, {})
  const handles = args.handles ?? (args.handle ? [args.handle] : [])
  const resultStr = safeString(toolCall.result)

  if (state === 'pending') return <PendingState message="Waiting for subagents..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="space-y-1.5">
      {handles.map((h) => (
        <div
          key={h}
          className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Bot className="size-3.5 text-purple-400" />
            <span className="font-mono text-xs text-foreground">{h}</span>
          </div>
          <DrillInButton handle={h} />
        </div>
      ))}
      {state === 'completed' && resultStr && (
        <pre className="max-h-[200px] overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
          {truncate(resultStr, 300)}
        </pre>
      )}
    </div>
  )
})

const StatusDetail = memo(function StatusDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<StatusArgs>(toolCall.args, {})
  const resultStr = safeString(toolCall.result)

  if (state === 'pending') return <PendingState message="Querying status..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-zinc-900 p-3">
        {args.handle && (
          <div className="flex items-center gap-2">
            <Bot className="size-3.5 text-purple-400" />
            <span className="font-mono text-xs text-foreground">{args.handle}</span>
          </div>
        )}
        {resultStr && (
          <pre className="mt-2 overflow-auto font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
            {resultStr}
          </pre>
        )}
      </div>
      {args.handle && <DrillInButton handle={args.handle} />}
    </div>
  )
})

// --- Main detail router ---

const SubAgentDetail = memo(function SubAgentDetail(props: ToolRendererProps) {
  switch (props.toolCall.tool) {
    case 'call_subagent':
    case 'spawn_subagent':
      return <CallDetail {...props} />
    case 'wait_for_subagents':
      return <WaitDetail {...props} />
    case 'get_subagent_status':
      return <StatusDetail {...props} />
    default:
      return <CallDetail {...props} />
  }
})

export const subAgentRendererDefinition: ToolRendererDefinition = {
  Summary: SubAgentSummary,
  Detail: SubAgentDetail,
  icon: Bot,
}
