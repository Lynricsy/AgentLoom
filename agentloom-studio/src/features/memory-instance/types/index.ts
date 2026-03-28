export interface MemoryInstance {
  id: string
  name: string
  description: string | null
  config: Record<string, unknown> | null
  validDomains: string[]
  coreMemoryUris: string[]
  systemPromptOverride: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  updatedAt: string
}

export interface MemoryInstanceDetail extends MemoryInstance {
  stats: {
    nodeCount: number
    edgeCount: number
    latestActivity: string | null
  }
}

export interface MemoryInstanceListResponse {
  data: MemoryInstance[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface MemoryInstanceListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
}

export interface CreateMemoryInstancePayload {
  name: string
  description?: string | null
  config?: Record<string, unknown> | null
  systemPromptOverride?: string | null
  validDomains?: string[]
  coreMemoryUris?: string[]
}

export interface UpdateMemoryInstancePayload {
  name?: string
  description?: string | null
  config?: Record<string, unknown> | null
  systemPromptOverride?: string | null
  validDomains?: string[]
  coreMemoryUris?: string[]
  status?: 'active' | 'archived' | 'deleted'
}
