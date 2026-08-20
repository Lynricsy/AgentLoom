/**
 * 平台 API Token 前端类型：实体与请求体全部取自 `@agentloom/api-client`
 * 生成模型（server OpenAPI 的 `PlatformApiToken*SwaggerDto`）。
 */
import type {
  CreatePlatformApiTokenSwaggerDto,
  PlatformApiTokenCreateEnvelopeSwaggerDtoData,
  PlatformApiTokenListResponseSwaggerDtoDataInner,
  PlatformApiTokenListResponseSwaggerDtoMeta,
} from '@agentloom/api-client'

/**
 * 列表筛选状态；服务端默认 `active`。
 * 这是 query 参数取值，不是实体字段 —— 生成模型里没有对应枚举。
 */
export type PlatformApiTokenStatus = 'active' | 'revoked' | 'all'

export type PlatformApiToken = PlatformApiTokenListResponseSwaggerDtoDataInner

/** 创建响应额外携带明文 token，且**仅此一次**返回 */
export type CreatedPlatformApiToken = PlatformApiTokenCreateEnvelopeSwaggerDtoData

export type PlatformApiTokenListMeta = PlatformApiTokenListResponseSwaggerDtoMeta

export interface PlatformApiTokenListResult {
  data: PlatformApiToken[]
  meta: PlatformApiTokenListMeta
}

export interface ListPlatformApiTokensParams {
  page?: number
  pageSize?: number
  status?: PlatformApiTokenStatus
}

export type CreatePlatformApiTokenInput = CreatePlatformApiTokenSwaggerDto
