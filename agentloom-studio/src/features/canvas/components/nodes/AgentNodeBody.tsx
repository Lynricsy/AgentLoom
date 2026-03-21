import { memo } from 'react'
import { Brain, Container } from 'lucide-react'
import type { AgentNodeData } from '@/features/agent/types'

interface AgentNodeBodyProps {
  data: AgentNodeData
}

export const AgentNodeBody = memo(function AgentNodeBody({ data }: AgentNodeBodyProps) {
  const agentName = typeof data.config?.agentName === 'string'
    ? data.config.agentName
    : null
  const versionLabel = typeof data.config?.versionLabel === 'string'
    ? data.config.versionLabel
    : null
  const hasSandboxOverride = !!data.sandboxOverride

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <div className="flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5 text-type-model" />
        <span className="text-xs font-medium truncate">
          {agentName || '未选择 Agent'}
        </span>
      </div>
      {versionLabel && (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 w-fit">
          {versionLabel}
        </span>
      )}
      {hasSandboxOverride && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Container className="h-3 w-3" />
          <span>Sandbox 已连接</span>
        </div>
      )}
    </div>
  )
})
