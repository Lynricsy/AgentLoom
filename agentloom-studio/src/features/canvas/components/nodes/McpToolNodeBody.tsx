import { memo } from 'react'
import { Plug } from 'lucide-react'
import type { CanvasNodeData } from '../../types'

interface McpToolNodeBodyProps {
  data: CanvasNodeData
}

export const McpToolNodeBody = memo(function McpToolNodeBody({ data }: McpToolNodeBodyProps) {
  const serverConfigId =
    typeof data.config?.mcpServerConfigId === 'string' && data.config.mcpServerConfigId.length > 0
      ? data.config.mcpServerConfigId
      : ''
  const serverName =
    typeof data.config?.mcpServerName === 'string' ? data.config.mcpServerName : ''
  const enabledToolCount = Array.isArray(data.config?.enabledToolIds)
    ? data.config.enabledToolIds.length
    : 0

  if (!serverConfigId) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <Plug className="h-3.5 w-3.5 shrink-0" />
        <span>选择 MCP Server</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Plug className="h-3.5 w-3.5 shrink-0 text-info" />
      <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
        MCP
      </span>
      <span className="min-w-0 truncate text-xs font-medium">{serverName || serverConfigId}</span>
      <span className="ml-auto shrink-0 text-[10px] text-muted">
        {enabledToolCount} 个工具
      </span>
    </div>
  )
})
