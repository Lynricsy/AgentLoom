import { memo } from 'react'
import { Brain, Braces, Container, Type } from 'lucide-react'
import type { AgentNodeData } from '@/features/agent/types'

interface AgentNodeBodyProps {
  data: AgentNodeData
  hasSchemaConnection?: boolean
}

export const AgentNodeBody = memo(function AgentNodeBody({ data, hasSchemaConnection = false }: AgentNodeBodyProps) {
  const agentName = typeof data.config?.agentName === 'string'
    ? data.config.agentName
    : null
  const versionLabel = typeof data.config?.versionLabel === 'string'
    ? data.config.versionLabel
    : null
  const hasSandboxOverride = !!data.sandboxOverride

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5 text-type-model" />
        <span className="text-xs font-medium truncate">
          {agentName || '未选择 Agent'}
        </span>
      </div>
      {versionLabel && (
        <span className="inline-flex w-fit items-center rounded-full border border-border/60 bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {versionLabel}
        </span>
      )}
      {hasSandboxOverride && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Container className="h-3 w-3" />
          <span>Sandbox 已连接</span>
        </div>
      )}
      <div className="flex items-center gap-1 text-[10px]">
        {hasSchemaConnection ? (
          <>
            <Braces className="h-3 w-3 text-type-json" />
            <span className="font-medium text-type-json">JSON 输出模式</span>
          </>
        ) : (
          <>
            <Type className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">文本输出模式</span>
          </>
        )}
      </div>
    </div>
  )
})
