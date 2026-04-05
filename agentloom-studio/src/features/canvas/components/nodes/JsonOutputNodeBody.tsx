import { memo } from 'react'
import { Braces } from 'lucide-react'
import { useNodeExecutionState } from '@/features/execution/stores/executionStore'

interface JsonOutputNodeBodyProps {
  nodeId: string
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export const JsonOutputNodeBody = memo(function JsonOutputNodeBody({
  nodeId,
}: JsonOutputNodeBodyProps) {
  const nodeState = useNodeExecutionState(nodeId)
  const output = nodeState?.output

  if (!output) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
        <Braces className="h-3.5 w-3.5 shrink-0" />
        <span>等待输出</span>
      </div>
    )
  }

  const isStreaming = nodeState?.isStreaming
  const pretty = isStreaming ? output : tryPrettyJson(output)
  const MAX_CHARS = 400
  const truncated = pretty.length > MAX_CHARS
  const displayText = truncated ? pretty.slice(0, MAX_CHARS) + '…' : pretty

  return (
    <div className="flex flex-col gap-1.5">
      {isStreaming && (
        <span className="text-[10px] font-medium text-primary">流式输出中…</span>
      )}
      <pre className="max-h-[7.5rem] overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground">
        {displayText}
      </pre>
      {truncated && (
        <span className="text-[10px] text-muted-foreground">
          仅显示前 {MAX_CHARS} 字符，完整输出见右侧面板
        </span>
      )}
    </div>
  )
})
