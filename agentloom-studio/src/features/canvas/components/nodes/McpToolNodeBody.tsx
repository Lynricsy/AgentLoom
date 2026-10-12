import { memo } from 'react'
import { Plug } from 'lucide-react'
import type { CanvasNodeData } from '../../types'
import { NodeBadge } from '../shared/NodeBadge'

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
      <div className="flex items-center gap-2 text-xs italic text-subtle-foreground">
        <Plug className="h-3.5 w-3.5 shrink-0" />
        <span>选择 MCP Server</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Plug className="h-3.5 w-3.5 shrink-0 text-info" />
      <NodeBadge variant="status" color="info" className="shrink-0">
        MCP
      </NodeBadge>
      <span className="min-w-0 truncate text-xs font-medium">{serverName || serverConfigId}</span>
      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
        {enabledToolCount} 个工具
      </span>
    </div>
  )
})
