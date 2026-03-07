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
