/**
 * 开发者公钥状态，与服务端 `plugin_developer_key_status` 枚举一一对应。
 * 撤销后密钥仍保留在列表中，仅状态变为 `revoked`。
 */
export type DeveloperKeyStatus = 'active' | 'revoked'

/** 开发者公钥。服务端返回整行，此处只声明前端消费的字段。 */
export interface DeveloperKey {
  id: string
  /** 用户填写的备注标签，可为空 */
  label: string | null
  /** PEM 格式 SPKI 公钥原文 */
  publicKey: string
  /** SHA-256 指纹（64 位十六进制），插件签名校验时的唯一定位依据 */
  keyFingerprint: string
  status: DeveloperKeyStatus
  createdAt: string
  updatedAt: string
  revokedAt: string | null
}

export interface DeveloperKeyListParams {
  status?: DeveloperKeyStatus
  page?: number
  pageSize?: number
}

export interface RegisterDeveloperKeyPayload {
  publicKey: string
  label?: string
}
