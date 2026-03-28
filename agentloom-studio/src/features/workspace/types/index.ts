export interface Workspace {
  id: string
  name: string
  description: string | null
  storageKey: string
  sizeBytes: number | null
  status: 'creating' | 'ready' | 'archived' | 'deleted'
  config: Record<string, unknown> | null
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
}

export interface CreateWorkspacePayload {
  name: string
  description?: string
  createEmpty?: boolean
}
