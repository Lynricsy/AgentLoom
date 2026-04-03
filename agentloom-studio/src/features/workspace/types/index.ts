export interface Workspace {
  id: string
  name: string
  description: string | null
  storageKey: string
  sizeBytes: number | null
  status: 'creating' | 'ready' | 'archived' | 'deleted'
  config: Record<string, unknown> | null
  sourceKind?: 'manual' | 'sandbox_snapshot' | 'execution_archive'
  isAutoArchived?: boolean
  createdAt: string
  updatedAt: string
}

export interface WorkspaceListResponse {
  data: Workspace[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface WorkspaceListParams {
  page?: number
  pageSize?: number
  search?: string
  includeAutoArchived?: boolean
}

export interface CreateWorkspacePayload {
  name: string
  description?: string
  createEmpty?: boolean
}
