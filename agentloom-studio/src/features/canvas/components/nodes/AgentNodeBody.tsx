import { memo } from 'react'
import { Brain, Braces, Container, Type } from 'lucide-react'
import type { AgentNodeData } from '@/features/agent'
import { NodeBadge } from '../shared/NodeBadge'

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
      <div className="flex min-w-0 items-center gap-1.5">
        <Brain className="size-3.5 shrink-0 text-type-model" />
        <span className="min-w-0 truncate text-xs font-medium">
          {agentName || '未选择 Agent'}
        </span>
      </div>
      {versionLabel && (
        <NodeBadge variant="status" className="w-fit">
          <span className="truncate">{versionLabel}</span>
        </NodeBadge>
      )}
      {hasSandboxOverride && (
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Container className="size-3 shrink-0" />
          <span>Sandbox 已连接</span>
        </div>
      )}
      <div className="flex items-center gap-1 text-2xs">
        {hasSchemaConnection ? (
          <>
            <Braces className="size-3 shrink-0 text-type-json" />
            <span className="font-medium text-type-json">JSON 输出模式</span>
          </>
        ) : (
          <>
            <Type className="size-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">文本输出模式</span>
          </>
        )}
      </div>
    </div>
  )
})
