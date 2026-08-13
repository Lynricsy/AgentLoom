import { memo } from 'react'
import { Puzzle } from 'lucide-react'
import type { PluginNodeData } from '../../types'

interface PluginNodeBodyProps {
  data: PluginNodeData
}

export const PluginNodeBody = memo(function PluginNodeBody({ data }: PluginNodeBodyProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Puzzle className="h-3.5 w-3.5 text-node-plugin" />
        <span className="text-xs font-medium truncate">
          {data.pluginName || '未配置插件'}
        </span>
      </div>
      {data.pluginNodeType && (
        <span className="text-[10px] text-muted-foreground truncate">
          {data.pluginNodeType}
        </span>
      )}
      {data.pluginVersion && (
        <span className="inline-flex w-fit items-center rounded-full border border-border/60 bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          v{data.pluginVersion}
        </span>
      )}
    </div>
  )
})
