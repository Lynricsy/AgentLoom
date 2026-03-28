import { memo } from 'react'
import { Bot } from 'lucide-react'
import type { CanvasNodeData } from '@/features/canvas/types'

interface SubAgentNodeBodyProps {
  data: CanvasNodeData
}

export const SubAgentNodeBody = memo(function SubAgentNodeBody({
  data,
}: SubAgentNodeBodyProps) {
  const config = data.config ?? {}

  const agentDefinitionId =
    typeof config.agentDefinitionId === 'string'
      ? config.agentDefinitionId
      : ''
  const agentName =
    typeof config._agentName === 'string' ? config._agentName : ''
  const alias = typeof config.alias === 'string' ? config.alias : ''
  const versionLabel =
    typeof config._versionLabel === 'string' ? config._versionLabel : ''

  if (!agentDefinitionId) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span>选择子 Agent</span>
      </div>
    )
  }

  const displayName = agentName || agentDefinitionId

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate text-xs font-medium text-foreground">
          {displayName}
        </span>
      </div>
      {(alias || versionLabel) && (
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {alias && (
            <span className="rounded bg-muted px-1.5 py-0.5">@{alias}</span>
          )}
          {versionLabel && (
            <span className="rounded bg-muted px-1.5 py-0.5">
              {versionLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
})
