import type {
  PrivateDeploymentCertificateSource,
  PrivateDeploymentLlmProxyMode,
  PrivateDeploymentSettings,
  UpdatePrivateDeploymentCertificatesInput,
  UpdatePrivateDeploymentLlmProxyInput,
  UpdatePrivateDeploymentSmtpInput,
} from '../types/privateDeployment'

export interface SmtpDraft {
  host: string
  port: string
  username: string
  password: string
  fromEmail: string
  useTls: boolean
}

export interface LlmProxyDraft {
  mode: PrivateDeploymentLlmProxyMode
  baseUrl: string
  apiKey: string
  allowExternalEgress: boolean
}

export interface CertificatesDraft {
  source: PrivateDeploymentCertificateSource
  tlsSecretRef: string
  expiresAt: string
  certificatePem: string
  privateKeyPem: string
}

export interface LicenseDraft {
  licenseKey: string
}

function normalizeNullableString(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function parseNullablePort(value: string): number | null {
  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error('SMTP 端口必须填写整数。')
  }

  const parsed = Number(normalized)

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('SMTP 端口必须位于 1 到 65535 之间。')
  }

  return parsed
}

/** ISO 时间戳 → `datetime-local` 控件可用的本地时间字符串 */
function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function toIsoDateTime(value: string): string | null {
  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) {
    throw new Error('证书过期时间格式不正确。')
  }

  return date.toISOString()
}

/** 服务端配置身份：组织 + 版本 + 更新时间，用于判断草稿是否需要重新同步 */
export function getSyncKey(settings: PrivateDeploymentSettings): string {
  return [
    settings.organizationId,
    settings.version,
    settings.updatedAt ?? 'none',
  ].join(':')
}

export function createSmtpDraft(settings: PrivateDeploymentSettings): SmtpDraft {
  return {
    host: settings.smtp.host ?? '',
    port: settings.smtp.port == null ? '' : String(settings.smtp.port),
    username: settings.smtp.username ?? '',
    password: '',
    fromEmail: settings.smtp.fromEmail ?? '',
    useTls: settings.smtp.useTls,
  }
}

export function createLlmProxyDraft(
  settings: PrivateDeploymentSettings,
): LlmProxyDraft {
  return {
    mode: settings.llmProxy.mode,
    baseUrl: settings.llmProxy.baseUrl ?? '',
    apiKey: '',
    allowExternalEgress: settings.llmProxy.allowExternalEgress,
  }
}

export function createCertificatesDraft(
  settings: PrivateDeploymentSettings,
): CertificatesDraft {
  return {
    source: settings.certificates.source,
    tlsSecretRef: settings.certificates.tlsSecretRef ?? '',
    expiresAt: toDateTimeLocalValue(settings.certificates.expiresAt),
    certificatePem: '',
    privateKeyPem: '',
  }
}

export function createLicenseDraft(): LicenseDraft {
  return {
    licenseKey: '',
  }
}

/**
 * 受管密码只在两种情况下出现在 payload 里：填写了新值（替换）或显式清除（`passwordSecretRef: null`）。
 * 其余情况完全不带 secret 字段，避免把空串写成「清空」。
 */
export function buildSmtpPayload(
  draft: SmtpDraft,
  clearSecret = false,
): UpdatePrivateDeploymentSmtpInput {
  const payload: UpdatePrivateDeploymentSmtpInput = {
    host: normalizeNullableString(draft.host),
    port: parseNullablePort(draft.port),
    username: normalizeNullableString(draft.username),
    fromEmail: normalizeNullableString(draft.fromEmail),
    useTls: draft.useTls,
  }

  const password = draft.password.trim()

  if (clearSecret) {
    payload.passwordSecretRef = null
  } else if (password.length > 0) {
    payload.password = password
  }

  return payload
}

export function buildLlmProxyPayload(
  draft: LlmProxyDraft,
  clearSecret = false,
): UpdatePrivateDeploymentLlmProxyInput {
  const normalizedBaseUrl = normalizeNullableString(draft.baseUrl)

  if (
    (draft.mode === 'private_cloud' || draft.mode === 'enterprise_proxy') &&
    !normalizedBaseUrl
  ) {
    throw new Error('当前 LLM 代理模式需要填写代理基地址。')
  }

  if (draft.mode === 'enterprise_proxy' && !draft.allowExternalEgress) {
    throw new Error('enterprise_proxy 模式必须显式允许外部网络出口。')
  }

  const payload: UpdatePrivateDeploymentLlmProxyInput = {
    mode: draft.mode,
    baseUrl: normalizedBaseUrl,
    allowExternalEgress: draft.allowExternalEgress,
  }

  const apiKey = draft.apiKey.trim()

  if (clearSecret) {
    payload.apiKeySecretRef = null
  } else if (apiKey.length > 0) {
    payload.apiKey = apiKey
  }

  return payload
}

export function buildCertificatesPayload(
  draft: CertificatesDraft,
): UpdatePrivateDeploymentCertificatesInput {
  const payload: UpdatePrivateDeploymentCertificatesInput = {
    source: draft.source,
    tlsSecretRef: normalizeNullableString(draft.tlsSecretRef),
    expiresAt: toIsoDateTime(draft.expiresAt),
  }

  if (draft.source === 'secretRef' && !payload.tlsSecretRef) {
    throw new Error('当证书来源为 secretRef 时，必须填写 TLS secret 引用。')
  }

  if (draft.source === 'uploaded') {
    const certificatePem = draft.certificatePem.trim()
    const privateKeyPem = draft.privateKeyPem.trim()

    if ((certificatePem && !privateKeyPem) || (!certificatePem && privateKeyPem)) {
      throw new Error('上传 PEM 证书时，证书内容和私钥内容需要同时提供。')
    }

    if (certificatePem && privateKeyPem) {
      payload.certificatePem = certificatePem
      payload.privateKeyPem = privateKeyPem
    }
  }

  return payload
}

/** 服务端时间戳的中文短格式；无值或不可解析时保留原样 / 占位符 */
export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatNullableValue(value?: string | null): string {
  const normalized = value?.trim()
  return normalized ? normalized : '—'
}
