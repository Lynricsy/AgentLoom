import type {
  DeveloperKeyResponseDto,
  DeveloperKeyResponseDtoStatusEnum,
  RegisterDeveloperKeyDto,
} from '@agentloom/api-client'

/**
 * 开发者公钥状态，与服务端 `plugin_developer_key_status` 枚举一一对应。
 * 撤销后密钥仍保留在列表中，仅状态变为 `revoked`。
 */
export type DeveloperKeyStatus = DeveloperKeyResponseDtoStatusEnum

/**
 * 开发者公钥（生成模型 `DeveloperKeyResponseDto`）。
 *
 * 唯一偏离：`label` 放宽为 `string | null | undefined`。
 * server 的 `DeveloperKeyResponseSchema` 复用了请求 schema 的
 * `label: z.string().optional()`，但 controller 直接返回 drizzle 行，
 * 而 `plugin_developer_key_keys.label` 列可为 NULL —— 实际 wire 值会是 null。
 * 生成模型只声明了 optional、漏掉了 nullable，这里按真实响应取二者并集。
 */
export type DeveloperKey = Omit<DeveloperKeyResponseDto, 'label'> & {
  label?: string | null
}

export interface DeveloperKeyListParams {
  status?: DeveloperKeyStatus
  page?: number
  pageSize?: number
}

/** POST /plugin-developer-keys 请求体（生成模型） */
export type RegisterDeveloperKeyPayload = RegisterDeveloperKeyDto
