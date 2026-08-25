import { HTTPError } from 'ky'

import type { ApiError } from '@/shared/types/api'
import type { DeveloperKeyStatus } from '../types'

export const PEM_PUBLIC_KEY_BEGIN = '-----BEGIN PUBLIC KEY-----'
export const PEM_PUBLIC_KEY_END = '-----END PUBLIC KEY-----'

/**
 * 前端只做形状校验：拦住私钥、证书、缺尾等明显错误，
 * 真正的密钥有效性由服务端 `validatePublicKey` 判定。
 * 返回 null 表示通过，否则返回可直接展示的中文提示。
 */
export function validatePublicKeyPem(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed) {
    return '请粘贴 PEM 格式的公钥内容。'
  }

  if (trimmed.includes('PRIVATE KEY')) {
    return '这看起来是私钥，请只粘贴公钥（-----BEGIN PUBLIC KEY----- 开头）。'
  }

  if (!trimmed.startsWith(PEM_PUBLIC_KEY_BEGIN)) {
    return `公钥需以 ${PEM_PUBLIC_KEY_BEGIN} 开头，请确认粘贴的是 SPKI 格式公钥。`
  }

  if (!trimmed.endsWith(PEM_PUBLIC_KEY_END)) {
    return `公钥缺少 ${PEM_PUBLIC_KEY_END} 结束标记，请粘贴完整内容。`
  }

  return null
}

/** 指纹是 64 位十六进制，列表里只展示首尾片段，完整值在详情与注册结果中给出。 */
export function shortenFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 20) {
    return fingerprint
  }

  return `${fingerprint.slice(0, 12)}…${fingerprint.slice(-8)}`
}

export const DEVELOPER_KEY_STATUS_LABEL: Record<DeveloperKeyStatus, string> = {
  active: '有效',
  revoked: '已撤销',
}

type ApiProblemDetails = ApiError & {
  message?: string | string[]
  errors?: Array<{ field?: string; message?: string }>
}

/** 服务端以 RFC7807 返回错误，取 detail 作为 toast 文案，兜底用调用方的 fallback。 */
export async function resolveDeveloperConsoleErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!(error instanceof HTTPError)) {
    return fallback
  }

  try {
    const payload = (await error.response
      .clone()
      .json()) as ApiProblemDetails
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message

    return payload.detail ?? payload.errors?.[0]?.message ?? message ?? fallback
  } catch {
    return fallback
  }
}
