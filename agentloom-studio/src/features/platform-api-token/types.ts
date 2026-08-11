/** 平台 API Token 的前端类型定义，字段与服务端 `PlatformApiTokenResponse` 对齐 */

/** 列表筛选状态；服务端默认 `active` */
export type PlatformApiTokenStatus = 'active' | 'revoked' | 'all'

export interface PlatformApiToken {
  id: string
  name: string
  /** `al_` + 8 位十六进制，用于在列表中辨认 token */
  tokenPrefix: string
  scopes: string | null
  lastUsedAt: string | null
  expiresAt: string | null
  isRevoked: boolean
  createdAt: string
}

/** 创建响应额外携带明文 token，且**仅此一次**返回 */
export interface CreatedPlatformApiToken extends PlatformApiToken {
  token: string
}

export interface PlatformApiTokenListMeta {
  page: number
  pageSize: number
  total: number
}

export interface PlatformApiTokenListResult {
  data: PlatformApiToken[]
  meta: PlatformApiTokenListMeta
}

export interface ListPlatformApiTokensParams {
  page?: number
  pageSize?: number
  status?: PlatformApiTokenStatus
}

export interface CreatePlatformApiTokenInput {
  name: string
  scopes?: string
  /** ISO 8601 字符串；省略表示永不过期 */
  expiresAt?: string
}
