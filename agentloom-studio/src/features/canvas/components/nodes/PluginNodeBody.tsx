import { memo } from 'react'
import { Puzzle } from 'lucide-react'
import type { PluginNodeData } from '../../types'
import { NodeBadge } from '../shared/NodeBadge'

interface PluginNodeBodyProps {
  data: PluginNodeData
}

export const PluginNodeBody = memo(function PluginNodeBody({ data }: PluginNodeBodyProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <Puzzle className="size-3.5 shrink-0 text-node-plugin" />
        <span className="min-w-0 truncate text-xs font-medium">
          {data.pluginName || '未配置插件'}
        </span>
      </div>
      {data.pluginNodeType && (
        <span className="truncate text-2xs text-muted-foreground">
          {data.pluginNodeType}
        </span>
      )}
      {data.pluginVersion && (
        <NodeBadge variant="status" className="w-fit">
          <span className="truncate">v{data.pluginVersion}</span>
        </NodeBadge>
      )}
    </div>
  )
})
