import type { CanvasNodeData } from '@/features/canvas'
import type { AgentGlobalSandboxConfig, AgentRuntimeConfig } from './agent.types'

export interface AgentNodeData extends CanvasNodeData {
  selectedAgentId: string | null
  agentVersionId: string | null
  sandboxOverride?: AgentGlobalSandboxConfig
}

export interface AgentCanvasNodeData extends CanvasNodeData {
  runtimeConfig?: Partial<AgentRuntimeConfig>
  timeoutSeconds?: number
  maxRetries?: number
  requiresIntervention?: boolean
}
