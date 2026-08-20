import type {
  CreateVersionDto,
  CreateWorkflowDefinitionDto,
  PublishWorkflowDto,
  WorkflowDefinitionDetailResponseSwaggerDtoData,
  WorkflowDefinitionListResponseSwaggerDto,
  WorkflowDefinitionListResponseSwaggerDtoDataInner,
} from '@agentloom/api-client'
import type { WorkflowGraphViewport } from '@agentloom/contracts'
import type { CanvasEdge, CanvasNode } from '@/features/canvas'
import type { ResourceSourceKind } from '@/shared/lib/resourceSource'
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

/** 列表接口的 wire 行类型；图结构只存在于详情响应。 */
export type WorkflowDefinitionSummary =
  WorkflowDefinitionListResponseSwaggerDtoDataInner

/**
 * 详情 wire 类型上的 Studio 图编辑视图。
 *
 * 除 nodes/edges/viewport 外全部来自生成的详情 wire 类型（单一事实源）。
 * 这三个图字段用 Omit 摘掉后换成画布领域类型——OpenAPI 3.0 无法无损表达
 * React Flow 的动态 data/style 字典与 extent 元组，生成模型在这些位置退化为
 * `{}`/`any`，不能反向充当画布的编辑态模型。inputSchema 结构可精确建模，
 * 因此直接使用生成类型。
 */
export type WorkflowDefinition = Omit<
  WorkflowDefinitionDetailResponseSwaggerDtoData,
  'nodes' | 'edges' | 'viewport'
> & {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: WorkflowGraphViewport | null
}

export interface UpdateWorkflowPayload {
  version: number
  name?: string
  description?: string | null
  icon?: string | null
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
  viewport?: WorkflowGraphViewport | null
  inputSchema?: WorkflowInputSchema
}

export interface WorkflowVersionSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: WorkflowGraphViewport | null
  inputSchema?: WorkflowInputSchema | null
  metadata: {
    nodeCount: number
    edgeCount: number
    createdFromVersion: number
    releaseNotes?: string | null
    releaseNumber?: number | null
  }
}

export interface WorkflowVersion {
  id: string
  workflowDefinitionId: string
  versionNumber: number
  releaseNumber?: number | null
  label: string | null
  snapshot: WorkflowVersionSnapshot
  publishedAt: string | null
  archivedAt: string | null
  createdBy: string
  createdAt: string
}

/** POST /workflow-definitions/:id/versions 请求体（生成模型） */
export type CreateVersionPayload = CreateVersionDto

/** POST /workflow-definitions/:id/publish 请求体（生成模型） */
export type PublishWorkflowPayload = PublishWorkflowDto

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

/**
 * POST /workflow-definitions 请求体（生成模型）。
 * 相比原手写类型：补回了漏掉的 `marketplaceListingId`，
 * 并把 `icon` 收紧为 `string | undefined`（server 是 `z.string().optional()`，不接受 null）。
 * 请求发出前由 `toSnakeBody` 转成 server 期望的 snake_case。
 */
export type CreateWorkflowPayload = CreateWorkflowDefinitionDto

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
  sourceKind?: ResourceSourceKind
}

export type WorkflowListResponse = WorkflowDefinitionListResponseSwaggerDto
