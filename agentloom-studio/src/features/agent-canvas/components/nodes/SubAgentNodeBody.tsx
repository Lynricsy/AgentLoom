import { memo } from 'react'
import { Bot } from 'lucide-react'
import type { CanvasNodeData } from '@/features/canvas'
import { Badge } from '@/shared/ui/badge'

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
      <div className="flex items-center gap-2 text-xs italic text-subtle-foreground">
        <Bot className="size-3.5 shrink-0" />
        <span>选择子 Agent</span>
      </div>
    )
  }

  const displayName = agentName || agentDefinitionId

  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Bot className="size-3.5 shrink-0 text-primary/80" />
        <span className="truncate text-xs font-medium text-foreground">
          {displayName}
        </span>
      </div>
      {(alias || versionLabel) && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {alias && (
            <Badge variant="secondary" size="sm" title={`@${alias}`}>
              <span className="truncate">@{alias}</span>
            </Badge>
          )}
          {versionLabel && (
            <Badge variant="secondary" size="sm" title={versionLabel}>
              <span className="truncate">{versionLabel}</span>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
})
