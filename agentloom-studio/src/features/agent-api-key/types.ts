/**
 * Agent API Key 前端类型：实体取自 `@agentloom/api-client` 生成模型
 * （server OpenAPI 的 `AgentApiKey*SwaggerDto`）。
 */
import type {
  AgentApiKeyCreateEnvelopeSwaggerDtoData,
  AgentApiKeyListResponseSwaggerDtoDataInner,
  AgentApiKeyListResponseSwaggerDtoMeta,
  CreateAgentApiKeySwaggerDto,
} from '@agentloom/api-client'

/** 列表筛选状态；服务端默认 `active`。这是 query 参数取值，不是实体字段 */
export type AgentApiKeyStatusFilter = 'active' | 'revoked' | 'all'

export type AgentApiKey = AgentApiKeyListResponseSwaggerDtoDataInner

/** 创建响应额外携带明文 `key`，且**仅此一次**返回 */
export type CreatedAgentApiKey = AgentApiKeyCreateEnvelopeSwaggerDtoData

export type AgentApiKeyListMeta = AgentApiKeyListResponseSwaggerDtoMeta

export interface AgentApiKeyListResult {
  data: AgentApiKey[]
  meta: AgentApiKeyListMeta
}

export interface ListAgentApiKeysParams {
  page?: number
  pageSize?: number
  status?: AgentApiKeyStatusFilter
}

/** 创建请求（camelCase）；发送前经 `toSnakeBody` 转为服务端要求的 snake_case */
export type CreateAgentApiKeyInput = CreateAgentApiKeySwaggerDto

/** Studio 中针对 Agent API Key 的操作权限，对齐服务端 @Roles */
export type AgentApiKeyAccess = 'manage' | 'read' | 'none'
