import type { Viewport } from '@xyflow/react'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/types'
import type { PaginatedResponse } from '@/shared/types/api'

export type WorkflowStatus = 'draft' | 'published' | 'archived'

export type WorkflowInputCollectionMode = 'form' | 'conversation' | 'hybrid'

export type WorkflowInputFieldType = 'text' | 'number' | 'single_select' | 'multi_select'

export interface WorkflowInputFieldValidation {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
}

export interface WorkflowInputFieldVisibility {
  fieldId: string
  equals: string | number
}

export interface ConversationPlan {
  systemPrompt: string
  maxTurns: number
}

export interface WorkflowInputFieldDefinition {
  id: string
  type: WorkflowInputFieldType
  label: string
  description?: string
  collectionHint?: string
  required: boolean
  validation?: WorkflowInputFieldValidation
  options?: string[]
  default?: unknown
  visibility?: WorkflowInputFieldVisibility
}

export interface WorkflowInputSchema {
  version: number
  collectionMode: WorkflowInputCollectionMode
  conversationPlan?: ConversationPlan
  fields: WorkflowInputFieldDefinition[]
}

export interface WorkflowDefinition {
  id: string
  tenantId: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport | null
  inputSchema: WorkflowInputSchema | null
  version: number
  status: WorkflowStatus
  publishedVersionId: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface UpdateWorkflowPayload {
  version: number
  name?: string
  description?: string | null
  icon?: string | null
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
  viewport?: Viewport | null
  inputSchema?: WorkflowInputSchema
}

export interface WorkflowVersionSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport | null
  inputSchema?: WorkflowInputSchema | null
  metadata: {
    nodeCount: number
    edgeCount: number
    createdFromVersion: number
    releaseNotes?: string | null
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
  releaseNotes?: string
  versionId?: string
}

export interface PublishWarningPort {
  name: string
  dataType: string
}

export interface PublishWarning {
  code: string
  sourceNodeId: string
  targetNodeId: string
  sourcePort: PublishWarningPort
  targetPort: PublishWarningPort
  message: string
}

export interface CreateWorkflowPayload {
  name: string
  description?: string
  icon?: string | null
  templateSlug?: string
  shareToken?: string
}

export type VersionListResponse = PaginatedResponse<WorkflowVersion>

export interface WorkflowExportEnvelope {
  schemaVersion: string
  exportedAt: string
  workflow: {
    name: string
    description: string | null
    definition: {
      nodes: unknown[]
      edges: unknown[]
      viewport: { x: number; y: number; zoom: number }
    }
    inputSchema?: unknown
  }
}

export interface WorkflowImportFileContent {
  schemaVersion?: string
  schema_version?: string
  exportedAt?: string
  exported_at?: string
  workflow: {
    name: string
    description: string | null
    definition: {
      nodes: unknown[]
      edges: unknown[]
      viewport: { x: number; y: number; zoom: number }
    }
    inputSchema?: unknown
    input_schema?: unknown
  }
}

export interface ImportValidationResult {
  valid: boolean
  errors: string[]
  nodeCount?: number
  edgeCount?: number
}

export interface WorkflowImportPayload {
  name: string
  description?: string
  fileContent: WorkflowImportFileContent
}

export interface ImportWorkflowResult {
  id: string
  name: string
  slug: string
}

export interface ListWorkflowsParams {
  page?: number
  pageSize?: number
  status?: string
  search?: string
}

export type WorkflowListResponse = PaginatedResponse<WorkflowDefinition>
