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

// --- Browser types ---

export interface MemoryNode {
  id: string
  nodeUuid: string
  name: string
  path: string
  domain: string
  content: string | null
  contentType: string | null
  priority: number
  disclosure: string | null
  isVirtual: boolean
  aliases: string[]
  glossaryKeywords: string[]
  glossaryMatches: Array<{
    keyword: string
    nodes: Array<{ uri: string; nodeUuid: string; contentSnippet?: string }>
  }>
  approxChildrenCount: number
  contentSnippet?: string
  versionCount: number
  latestVersion: number
  createdAt: string
  updatedAt: string
}

export interface MemoryNodeVersion {
  id: string
  versionNumber: number
  content: string | null
  priority: number
  disclosure: string | null
  mode: string
  createdAt: string
  createdBy: string | null
}

export interface BrowseData {
  node: MemoryNode | null
  children: MemoryNode[]
  breadcrumbs: Array<{ path: string; label: string }>
}

export interface MemoryDomain {
  domain: string
  rootCount: number
}
