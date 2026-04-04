export type ShareResourceType = 'workflow' | 'agent'
export type SharePermission = 'read_only' | 'copyable'

export interface ShareRecord {
  id: string
  resourceType?: ShareResourceType
  resourceId?: string
  workflowDefinitionId?: string
  agentDefinitionId?: string
  title: string
  description: string | null
  shareToken: string
  shareType: SharePermission
  shareUrl: string
  viewCount: number
  copyCount: number
  isRevoked: boolean
  expiresAt: string | null
  createdAt: string
  createdBy: string
}

export interface CreateWorkflowSharePayload {
  workflowDefinitionId: string
  shareType: SharePermission
  expiresAt?: string
}

export interface CreateAgentSharePayload {
  agentDefinitionId: string
  shareType: SharePermission
  expiresAt?: string
}

export type CreateSharePayload =
  | CreateWorkflowSharePayload
  | CreateAgentSharePayload

export interface ListSharesParams {
  resourceType: ShareResourceType
  resourceId: string
  page?: number
  pageSize?: number
}

export interface ShareListResponse {
  data: ShareRecord[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface PublicShareAuthor {
  displayName: string
  email: string | null
  avatarUrl: string | null
}

export interface PublicShareDefinition {
  nodes: unknown[]
  edges: unknown[]
  viewport: { x: number; y: number; zoom: number }
}

interface BasePublicShareData {
  token: string
  resourceType: ShareResourceType
  title: string
  description: string | null
  shareType: SharePermission
  author: PublicShareAuthor
  definition: PublicShareDefinition
  nodeCount: number
  edgeCount: number
  createdAt: string
  expiresAt: string | null
}

export interface PublicWorkflowShareData extends BasePublicShareData {
  resourceType: 'workflow'
  workflowDefinitionId: string
  workflowName: string
  workflowDescription: string | null
}

export interface PublicAgentShareData extends BasePublicShareData {
  resourceType: 'agent'
  agentDefinitionId: string
  agentName: string
  agentDescription: string | null
  runtimeMode: 'sandbox' | 'no_sandbox'
  inputSchema: Record<string, unknown> | null
  sandboxLifecycle: 'session' | 'persistent' | null
}

export type PublicShareData = PublicWorkflowShareData | PublicAgentShareData

export type AgentShareImportReportOutcome =
  | 'cloned'
  | 'cleared'
  | 'needs_rebind'
  | 'skipped_ephemeral'

export interface AgentShareImportReportItem {
  resourceType:
    | 'agent_definition'
    | 'knowledge_base'
    | 'memory_instance'
    | 'mcp_server_config'
    | 'skill'
    | 'workspace'
  sourceResourceId?: string | null
  targetResourceId?: string | null
  title: string
  outcome: AgentShareImportReportOutcome
  message: string
}

export interface ImportAgentShareResponse {
  agentDefinitionId: string
  name: string
  publishedVersionId: string | null
  report: AgentShareImportReportItem[]
  summary: {
    cloned: number
    cleared: number
    needsRebind: number
    skippedEphemeral: number
  }
}
