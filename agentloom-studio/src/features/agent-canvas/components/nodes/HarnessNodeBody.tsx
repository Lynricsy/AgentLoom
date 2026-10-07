import { memo } from 'react'
import { Cpu } from 'lucide-react'
import { useStore } from '@xyflow/react'
import type { CanvasNodeData } from '@/features/canvas'
import {
  HARNESS_PLUGINS_INPUT_HANDLE,
  parseHarnessNodeConfig,
} from '../../lib/harnessNodeConfig'

interface HarnessNodeBodyProps {
  nodeId: string
  data: CanvasNodeData
}

export const HarnessNodeBody = memo(function HarnessNodeBody({
  nodeId,
  data,
}: HarnessNodeBodyProps) {
  // 插件数取自画布连线：runtime-plugin 只经 plugins-in 挂到 harness
  const pluginCount = useStore(
    (state) =>
      state.edges.filter(
        (edge) =>
          edge.target === nodeId &&
          edge.targetHandle === HARNESS_PLUGINS_INPUT_HANDLE,
      ).length,
  )
  const hasProfilePatch =
    parseHarnessNodeConfig(data.config).profilePatch.trim().length > 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-node-tool" />
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
          dsh
        </span>
        <span className="truncate text-xs text-foreground">DeepSeek Harness</span>
      </div>
      <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">
          {pluginCount > 0 ? `${pluginCount} 个插件` : '未挂载插件'}
        </span>
        {hasProfilePatch && (
          <span className="rounded bg-muted px-1.5 py-0.5">profile patch</span>
        )}
      </div>
    </div>
  )
})
