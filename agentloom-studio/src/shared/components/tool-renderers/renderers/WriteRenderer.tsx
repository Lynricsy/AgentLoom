import { memo, useMemo } from 'react'
import { FileEdit } from 'lucide-react'
import { CodeViewer } from '../primitives/CodeViewer'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

interface WriteArgs {
  path: string
  content: string
}

function parseArgs(raw: unknown): WriteArgs {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as WriteArgs
    } catch {
      return { path: '', content: '' }
    }
  }
  return (raw ?? { path: '', content: '' }) as WriteArgs
}

const WriteSummary = memo(function WriteSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const byteCount = args.content ? args.content.length : 0

  return (
    <span className="truncate font-mono text-xs text-foreground">
      Write {args.path || '文件'} ({byteCount} 字节)
    </span>
  )
})

const WriteDetail = memo(function WriteDetail({ toolCall, state }: ToolRendererProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])

  if (state === 'pending') {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        正在写入文件...
      </div>
    )
  }

  if (state === 'failed' && toolCall.error) {
    return (
      <pre className="overflow-auto rounded-md bg-red-950/30 p-3 font-mono text-xs leading-relaxed text-red-400">
        {toolCall.error}
      </pre>
    )
  }

  if (!args.content) return null

  return (
    <CodeViewer
      code={args.content}
      fileName={args.path}
    />
  )
})

export const writeRendererDefinition: ToolRendererDefinition = {
  Summary: WriteSummary,
  Detail: WriteDetail,
  icon: FileEdit,
}
