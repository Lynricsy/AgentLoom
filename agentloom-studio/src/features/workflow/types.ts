import type { Viewport } from '@xyflow/react'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/types'

export type WorkflowStatus = 'draft' | 'published' | 'archived'

export interface WorkflowDefinition {
  id: string
  tenantId: string
  name: string
  slug: string
  description: string | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport | null
  version: number
  status: WorkflowStatus
  publishedVersionId: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface UpdateWorkflowPayload {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport | null
  version: number
}

export interface WorkflowVersionSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport | null
  metadata: {
    nodeCount: number
    edgeCount: number
    createdFromVersion: number
  }
}

export interface WorkflowVersion {
  id: string
  workflowDefinitionId: string
  versionNumber: number
  label: string | null
  snapshot: WorkflowVersionSnapshot
  publishedAt: string | null
  archivedAt: string | null
  createdBy: string
  createdAt: string
}

export interface CreateVersionPayload {
  label?: string
}

export interface PublishWorkflowPayload {
  label?: string
  versionId?: string
}

export interface VersionListResponse {
  data: WorkflowVersion[]
  total: number
  page: number
  pageSize: number
}
