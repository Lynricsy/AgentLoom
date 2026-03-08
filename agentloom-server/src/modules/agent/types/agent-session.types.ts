import type { ContentBlock } from './content-block.types'

export interface McpServerConfig {
  readonly transport: 'stdio' | 'sse' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Readonly<Record<string, string>>
}

export type SessionMode = 'workflow' | 'conversation'

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error'

export interface SessionContext {
  readonly history: readonly ContentBlock[]
  readonly cwd?: string
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>
  readonly workflowState?: Readonly<Record<string, unknown>>
}

export interface AgentSession {
  readonly id: string
  readonly agentId: string
  readonly mode: SessionMode
  readonly context: SessionContext
  readonly status: SessionStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateSessionParams {
  readonly agentId: string
  readonly mode: SessionMode
  readonly cwd?: string
  readonly mcpServers?: Record<string, McpServerConfig>
  readonly context?: Record<string, unknown>
}
