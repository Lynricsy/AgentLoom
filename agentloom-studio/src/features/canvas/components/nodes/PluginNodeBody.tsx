import { memo } from 'react'
import { Puzzle } from 'lucide-react'
import type { PluginNodeData } from '../../types'

interface PluginNodeBodyProps {
  data: PluginNodeData
}

export const PluginNodeBody = memo(function PluginNodeBody({ data }: PluginNodeBodyProps) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <div className="flex items-center gap-1.5">
        <Puzzle className="h-3.5 w-3.5 text-purple-500" />
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
        <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 w-fit">
          v{data.pluginVersion}
        </span>
      )}
    </div>
  )
})
