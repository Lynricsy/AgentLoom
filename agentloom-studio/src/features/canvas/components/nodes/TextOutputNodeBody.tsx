import { memo } from 'react'
import { FileText } from 'lucide-react'
import { useNodeExecutionState } from '@/features/execution/stores/executionStore'

interface TextOutputNodeBodyProps {
  nodeId: string
}

export const TextOutputNodeBody = memo(function TextOutputNodeBody({
  nodeId,
}: TextOutputNodeBodyProps) {
  const nodeState = useNodeExecutionState(nodeId)
  const output = nodeState?.output

  if (!output) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>等待输出</span>
      </div>
    )
  }

  const isStreaming = nodeState?.isStreaming
  const MAX_CHARS = 300
  const truncated = output.length > MAX_CHARS
  const displayText = truncated ? output.slice(0, MAX_CHARS) + '…' : output

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
