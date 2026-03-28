export interface SandboxSessionConfig {
  name?: string
  cpu: number
  memory: number
  disk: number
  timeout: number
  lifecycleMode?: 'session' | 'persistent'
  restoreWorkspaceId?: string
}

export interface SandboxSession {
  id: string
  executionId: string | null
  agentConversationId: string | null
  sandboxNodeId: string | null
  containerId: string | null
  status: 'creating' | 'ready' | 'busy' | 'stopping' | 'stopped' | 'failed'
  config: SandboxSessionConfig
  workspacePath: string | null
  startedAt: string | null
  stoppedAt: string | null
  createdAt: string
}

export type SandboxStatus = SandboxSession['status']

export interface SandboxStats {
  cpuPercent: number
  memoryUsageMb: number
  memoryLimitMb: number
  diskUsage?: number
  diskTotal?: number
}

export interface SandboxListParams {
  page?: number
  pageSize?: number
  status?: SandboxStatus | ''
  lifecycleMode?: 'session' | 'persistent' | ''
  search?: string
}

export interface SandboxListResponse {
  data: SandboxSession[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface CreateSandboxPayload {
  name: string
  cpu: number
  memory: number
  disk: number
}
