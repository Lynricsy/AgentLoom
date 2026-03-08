import { memo } from 'react'
import { Plug } from 'lucide-react'
import type { CanvasNodeData } from '../../types'

interface McpToolNodeBodyProps {
  data: CanvasNodeData
}

export const McpToolNodeBody = memo(function McpToolNodeBody({ data }: McpToolNodeBodyProps) {
  const inputCount = Array.isArray(data.inputPorts) ? data.inputPorts.length : 0
  const outputCount = Array.isArray(data.outputPorts) ? data.outputPorts.length : 0

  return (
    <div className="flex items-center gap-2">
      <Plug className="h-3.5 w-3.5 shrink-0 text-info" />
      <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
        MCP
      </span>
      {data.description && (
        <span className="truncate text-xs text-muted-foreground">{data.description}</span>
      )}
      {(inputCount > 0 || outputCount > 0) && (
        <span className="ml-auto shrink-0 text-[10px] text-muted">
          {inputCount}入 / {outputCount}出
        </span>
      )}
    </div>
  )
})
