import type {
  CreateMemoryInstanceDto,
  UpdateMemoryInstanceDto,
} from '@agentloom/api-client'

export interface MemoryInstance {
  id: string
  name: string
  description: string | null
  config: Record<string, unknown> | null
  validDomains: string[]
  coreMemoryUris: string[]
  systemPromptOverride: string | null
  status: 'active' | 'archived' | 'deleted'
  nodeCount?: number
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

/**
 * POST /memory-instances 请求体（生成模型）。
 * `config` 收窄为 `Record<string, unknown>`：生成产物在这里是无约束索引签名。
 */
export type CreateMemoryInstancePayload = Omit<CreateMemoryInstanceDto, 'config'> & {
  config?: Record<string, unknown>
}

/**
 * PATCH /memory-instances/:id 请求体（生成模型）。
 * `status` 只接受 `active` / `archived` —— server 的 update schema 里没有
 * `deleted`（那是实体状态、不是可提交值），原手写类型多给了一个 server 会拒绝的取值。
 */
export type UpdateMemoryInstancePayload = Omit<UpdateMemoryInstanceDto, 'config'> & {
  config?: Record<string, unknown>
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
