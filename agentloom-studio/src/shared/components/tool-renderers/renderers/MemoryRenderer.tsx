import { memo, useMemo } from 'react'
import { Brain } from 'lucide-react'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

// --- Shared helpers ---

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

// --- Arg types ---

interface ReadMemoryArgs { uri: string }
interface CreateMemoryArgs { uri: string; content: string; contentType?: string; metadata?: Record<string, unknown>; disclosureLevel?: number }
interface UpdateMemoryArgs { uri: string; mode: 'append' | 'patch'; appendContent?: string; oldString?: string; newString?: string }
interface DeleteMemoryArgs { uri: string }
interface AddAliasArgs { uri: string; aliasUri: string }
interface ManageTriggersArgs { action: 'add' | 'remove'; keyword: string; uri: string }
interface SearchMemoryArgs { query: string; limit?: number; offset?: number; minDisclosure?: number }

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

function ContentPreview({ content, maxHeight = '320px' }: { content: string; maxHeight?: string }) {
  return (
    <pre
      className="overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-all"
      style={{ maxHeight }}
    >
      {content}
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

// --- Summary component ---

const MemorySummary = memo(function MemorySummary({ toolCall }: ToolSummaryProps) {
  const summary = useMemo(() => {
    switch (toolCall.tool) {
      case 'read_memory': {
        const args = safeParse<ReadMemoryArgs>(toolCall.args, { uri: '' })
        return `Read ${args.uri}`
      }
      case 'create_memory': {
        const args = safeParse<CreateMemoryArgs>(toolCall.args, { uri: '', content: '' })
        return `Create ${args.uri}`
      }
      case 'update_memory': {
        const args = safeParse<UpdateMemoryArgs>(toolCall.args, { uri: '', mode: 'append' })
        return `Update ${args.uri} (${args.mode})`
      }
      case 'delete_memory': {
        const args = safeParse<DeleteMemoryArgs>(toolCall.args, { uri: '' })
        return `Delete ${args.uri}`
      }
      case 'add_alias': {
        const args = safeParse<AddAliasArgs>(toolCall.args, { uri: '', aliasUri: '' })
        return `Alias ${args.aliasUri} \u2192 ${args.uri}`
      }
      case 'manage_triggers': {
        const args = safeParse<ManageTriggersArgs>(toolCall.args, { action: 'add', keyword: '', uri: '' })
        return `Trigger ${args.action} "${args.keyword}"`
      }
      case 'search_memory': {
        const args = safeParse<SearchMemoryArgs>(toolCall.args, { query: '' })
        return `Search "${truncate(args.query, 30)}"`
      }
      default:
        return toolCall.tool
    }
  }, [toolCall.tool, toolCall.args])

  return (
    <span className="truncate font-mono text-xs text-foreground">
      {summary}
    </span>
  )
})

// --- Detail sub-components ---

const ReadMemoryDetail = memo(function ReadMemoryDetail({ toolCall, state }: ToolRendererProps) {
  const content = safeString(toolCall.result)

  if (state === 'pending') return <PendingState message="正在读取记忆..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  if (!content) return null
  return <ContentPreview content={content} />
})

const CreateMemoryDetail = memo(function CreateMemoryDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<CreateMemoryArgs>(toolCall.args, { uri: '', content: '' })

  if (state === 'pending') return <PendingState message="正在创建记忆..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-zinc-900 p-3 space-y-0.5">
        <KeyValue label="URI" value={args.uri} />
        {args.contentType && <KeyValue label="类型" value={args.contentType} />}
        {args.disclosureLevel != null && <KeyValue label="可见性" value={args.disclosureLevel} />}
      </div>
      {args.content && (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            内容
          </div>
          <ContentPreview content={truncate(args.content, 500)} maxHeight="200px" />
        </div>
      )}
    </div>
  )
})

const UpdateMemoryDetail = memo(function UpdateMemoryDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<UpdateMemoryArgs>(toolCall.args, { uri: '', mode: 'append' })

  if (state === 'pending') return <PendingState message="正在更新记忆..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  if (args.mode === 'append' && args.appendContent) {
    return (
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          追加的内容
        </div>
        <ContentPreview content={args.appendContent} maxHeight="200px" />
      </div>
    )
  }

  if (args.mode === 'patch' && (args.oldString || args.newString)) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            原始内容
          </div>
          <pre className="overflow-auto rounded-md bg-red-950/20 p-2 font-mono text-xs text-red-400 leading-relaxed whitespace-pre-wrap break-all max-h-[200px]">
            {args.oldString || '\u00A0'}
          </pre>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            修改后
          </div>
          <pre className="overflow-auto rounded-md bg-emerald-950/20 p-2 font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap break-all max-h-[200px]">
            {args.newString || '\u00A0'}
          </pre>
        </div>
      </div>
    )
  }

  const result = safeString(toolCall.result)
  if (result) return <ContentPreview content={result} />
  return null
})

const DeleteMemoryDetail = memo(function DeleteMemoryDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<DeleteMemoryArgs>(toolCall.args, { uri: '' })

  if (state === 'pending') return <PendingState message="正在删除记忆..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="rounded-lg bg-zinc-900 p-3 text-xs text-foreground/90">
      <span className="text-red-400">已删除:</span>{' '}
      <span className="font-mono">{args.uri}</span>
    </div>
  )
})

const AddAliasDetail = memo(function AddAliasDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<AddAliasArgs>(toolCall.args, { uri: '', aliasUri: '' })

  if (state === 'pending') return <PendingState message="正在添加别名..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="rounded-lg bg-zinc-900 p-3 space-y-0.5">
      <KeyValue label="目标" value={args.uri} />
      <KeyValue label="别名" value={args.aliasUri} />
    </div>
  )
})

const ManageTriggersDetail = memo(function ManageTriggersDetail({ toolCall, state }: ToolRendererProps) {
  const args = safeParse<ManageTriggersArgs>(toolCall.args, { action: 'add', keyword: '', uri: '' })

  if (state === 'pending') return <PendingState message="正在管理触发器..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  return (
    <div className="rounded-lg bg-zinc-900 p-3 space-y-0.5">
      <KeyValue label="操作" value={args.action} />
      <KeyValue label="关键词" value={args.keyword} />
      <KeyValue label="URI" value={args.uri} />
    </div>
  )
})

interface SearchResultEntry {
  nodeId?: string
  content?: string
  uri?: string
  score?: number
  paths?: Array<{ uri?: string }>
}

const SearchMemoryDetail = memo(function SearchMemoryDetail({ toolCall, state }: ToolRendererProps) {
  const results = safeParse<SearchResultEntry[]>(toolCall.result, [])
  const list = Array.isArray(results) ? results : []

  if (state === 'pending') return <PendingState message="正在搜索记忆..." />
  if (state === 'failed' && toolCall.error) return <ErrorState error={toolCall.error} />

  if (list.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 p-6 text-xs text-muted-foreground">
        <Brain className="size-4 opacity-40" />
        未找到结果
      </div>
    )
  }

  return (
    <div className="max-h-[480px] space-y-2 overflow-auto">
      {list.map((entry, i) => {
        const uri = entry.uri ?? entry.paths?.[0]?.uri ?? `node:${entry.nodeId ?? i}`
        return (
          <div key={`${uri}-${i}`} className="rounded-lg bg-zinc-900 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-info truncate">{uri}</span>
              {entry.score != null && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  score: {typeof entry.score === 'number' ? entry.score.toFixed(2) : entry.score}
                </span>
              )}
            </div>
            {entry.content && (
              <p className="text-xs text-foreground/80 line-clamp-3">
                {entry.content}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
})

// --- Main detail router ---

const MemoryDetail = memo(function MemoryDetail(props: ToolRendererProps) {
  switch (props.toolCall.tool) {
    case 'read_memory':
      return <ReadMemoryDetail {...props} />
    case 'create_memory':
      return <CreateMemoryDetail {...props} />
    case 'update_memory':
      return <UpdateMemoryDetail {...props} />
    case 'delete_memory':
      return <DeleteMemoryDetail {...props} />
    case 'add_alias':
      return <AddAliasDetail {...props} />
    case 'manage_triggers':
      return <ManageTriggersDetail {...props} />
    case 'search_memory':
      return <SearchMemoryDetail {...props} />
    default:
      return <ReadMemoryDetail {...props} />
  }
})

export const memoryRendererDefinition: ToolRendererDefinition = {
  Summary: MemorySummary,
  Detail: MemoryDetail,
  icon: Brain,
}
