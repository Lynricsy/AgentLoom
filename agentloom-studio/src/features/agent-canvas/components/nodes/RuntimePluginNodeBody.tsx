import { memo } from 'react'
import { Puzzle } from 'lucide-react'
import type { CanvasNodeData } from '@/features/canvas'
import {
  formatRuntimePluginLabel,
  parseRuntimePluginNodeConfig,
} from '../../lib/harnessNodeConfig'

interface RuntimePluginNodeBodyProps {
  data: CanvasNodeData
}

export const RuntimePluginNodeBody = memo(function RuntimePluginNodeBody({
  data,
}: RuntimePluginNodeBodyProps) {
  const config = parseRuntimePluginNodeConfig(data.config)
  const label = formatRuntimePluginLabel(config)

  if (!label) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <Puzzle className="h-3.5 w-3.5 shrink-0" />
        <span>{config.source === 'npm' ? '填写 npm 包' : '选择 runtime 插件'}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Puzzle className="h-3.5 w-3.5 shrink-0 text-node-plugin" />
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 text-2xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">
          {config.source === 'npm' ? 'npm' : '插件包'}
        </span>
        {!config.enabled && (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">已停用</span>
        )}
      </div>
    </div>
  )
})
