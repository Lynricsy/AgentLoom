import {
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { useAuthToken } from '@/features/execution'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { useToast } from '@/shared/ui/toast'
import {
  usePrivateDeployment,
  useUpdatePrivateDeploymentSettings,
} from '../hooks/usePrivateDeployment'
import {
  canManagePrivateDeployment,
  getPrivateDeploymentOrganizationIdFromToken,
  getPrivateDeploymentRoleFromToken,
  getPrivateDeploymentTenantIdFromToken,
} from '../lib/privateDeploymentPermissions'
import type {
  DeploymentMode,
  PrivateDeploymentCertificateSource,
  PrivateDeploymentLlmProxyMode,
  PrivateDeploymentLicenseStatus,
  PrivateDeploymentSettings,
  UpdatePrivateDeploymentCertificatesInput,
  UpdatePrivateDeploymentLlmProxyInput,
  UpdatePrivateDeploymentSettingsInput,
  UpdatePrivateDeploymentSmtpInput,
} from '../types/privateDeployment'

const LLM_PROXY_MODE_OPTIONS: Array<{
  value: PrivateDeploymentLlmProxyMode
  label: string
  description: string
}> = [
  {
    value: 'direct',
    label: 'direct（平台直连）',
    description: '由平台直接访问默认模型出口，不需要额外的代理地址。',
  },
  {
    value: 'private_cloud',
    label: 'private_cloud（私有云代理）',
    description: '通过 OpenAI 兼容的推理端点访问私有云模型，例如 vLLM、Ollama 或 LocalAI。',
  },
  {
    value: 'enterprise_proxy',
    label: 'enterprise_proxy（企业代理）',
    description: '通过企业统一出口代理访问模型，并显式允许外部网络出口。',
  },
]

const CERTIFICATE_SOURCE_OPTIONS: Array<{
  value: PrivateDeploymentCertificateSource
  label: string
  description: string
}> = [
  {
    value: 'ingress-managed',
    label: 'ingress-managed（由入口统一管理）',
    description: '证书由部署入口或 Ingress 统一维护，Studio 仅记录状态信息。',
  },
  {
    value: 'secretRef',
    label: 'secretRef（引用现有密钥）',
    description: '引用平台外部或集群中已经存在的 TLS secret。',
  },
  {
    value: 'uploaded',
    label: 'uploaded（上传新的 PEM 材料）',
    description: '重新提交证书 PEM 与私钥 PEM。已上传的旧材料不会再次回显。',
  },
]

const DEPLOYMENT_MODE_LABELS: Record<DeploymentMode, string> = {
  saas: 'SaaS 托管',
  private: '私有部署',
}

const LICENSE_STATUS_LABELS: Record<PrivateDeploymentLicenseStatus, string> = {
  missing: '缺失',
  valid: '有效',
  invalid: '无效',
  expired: '已过期',
}

const PRIVATE_DEPLOYMENT_RELATED_OPERATIONS = [
  {
    href: '/settings/resource-quotas',
    label: '资源治理设置',
  },
  {
    href: '/settings/monitoring',
    label: '运行监控',
  },
  {
    href: '/settings/audit-logs',
    label: '审计日志',
  },
] as const

interface SmtpDraft {
  host: string
  port: string
  username: string
  password: string
  fromEmail: string
  useTls: boolean
}

interface LlmProxyDraft {
  mode: PrivateDeploymentLlmProxyMode
  baseUrl: string
  apiKey: string
  allowExternalEgress: boolean
}

interface CertificatesDraft {
  source: PrivateDeploymentCertificateSource
  tlsSecretRef: string
  expiresAt: string
  certificatePem: string
  privateKeyPem: string
}

interface LicenseDraft {
  licenseKey: string
}

function formatTimestamp(value?: string | null): string {
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

function formatNullableValue(value?: string | null): string {
  const normalized = value?.trim()
  return normalized ? normalized : '—'
}

function formatNullableNumber(value: number | null): string {
  return value == null ? '' : String(value)
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

function getSyncKey(settings: PrivateDeploymentSettings): string {
  return [
    settings.organizationId,
    settings.version,
    settings.updatedAt ?? 'none',
  ].join(':')
}

function createSmtpDraft(settings: PrivateDeploymentSettings): SmtpDraft {
  return {
    host: settings.smtp.host ?? '',
    port: formatNullableNumber(settings.smtp.port),
    username: settings.smtp.username ?? '',
    password: '',
    fromEmail: settings.smtp.fromEmail ?? '',
    useTls: settings.smtp.useTls,
  }
}

function createLlmProxyDraft(settings: PrivateDeploymentSettings): LlmProxyDraft {
  return {
    mode: settings.llmProxy.mode,
    baseUrl: settings.llmProxy.baseUrl ?? '',
    apiKey: '',
    allowExternalEgress: settings.llmProxy.allowExternalEgress,
  }
}

function createCertificatesDraft(settings: PrivateDeploymentSettings): CertificatesDraft {
  return {
    source: settings.certificates.source,
    tlsSecretRef: settings.certificates.tlsSecretRef ?? '',
    expiresAt: toDateTimeLocalValue(settings.certificates.expiresAt),
    certificatePem: '',
    privateKeyPem: '',
  }
}

function createLicenseDraft(): LicenseDraft {
  return {
    licenseKey: '',
  }
}

function getForbiddenMessage(authToken?: string, role?: string | null) {
  if (!authToken || !role) {
    return '当前未识别到可管理私有部署设置的租户身份，请使用 owner 或 admin 角色重新登录。'
  }

  return `当前租户角色为 ${role}，只有 owner 或 admin 可以管理私有部署设置。`
}

function SecretStatusBlock({
  title,
  configured,
  description,
}: {
  title: string
  configured: boolean
  description: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {configured ? '已配置受管密钥' : '未配置'}
        </span>
      </div>
    </div>
  )
}

function PrivateDeploymentForbiddenState({
  authToken,
  role,
}: {
  authToken?: string
  role?: string | null
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-forbidden">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">私有部署设置</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          管理 SMTP、LLM 代理、证书和离线 License 设置。部署模式由服务端环境决定，这里只做展示和配置同步。
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-surface-elevated p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">无权访问私有部署设置</h2>
            <p className="text-sm text-muted-foreground">{getForbiddenMessage(authToken, role)}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function PrivateDeploymentMissingOrgState() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-missing-org">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">私有部署设置</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          管理 SMTP、LLM 代理、证书和离线 License 设置。部署模式由服务端环境决定，这里只做展示和配置同步。
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-surface-elevated p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">无法识别当前组织</h2>
            <p className="text-sm text-muted-foreground">
              当前登录令牌里没有可用的 organizationId / orgId / tenantId 信息，暂时无法加载私有部署设置。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function PrivateDeploymentContent({
  organizationId,
  tenantClaimId,
}: {
  organizationId: string
  tenantClaimId: string | null
}) {
  const { notify } = useToast()
  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = usePrivateDeployment(organizationId)
  const updateMutation = useUpdatePrivateDeploymentSettings(organizationId)

  const [smtpDraft, setSmtpDraft] = useState<SmtpDraft>({
    host: '',
    port: '',
    username: '',
    password: '',
    fromEmail: '',
    useTls: false,
  })
  const [llmProxyDraft, setLlmProxyDraft] = useState<LlmProxyDraft>({
    mode: 'direct',
    baseUrl: '',
    apiKey: '',
    allowExternalEgress: false,
  })
  const [certificatesDraft, setCertificatesDraft] = useState<CertificatesDraft>({
    source: 'ingress-managed',
    tlsSecretRef: '',
    expiresAt: '',
    certificatePem: '',
    privateKeyPem: '',
  })
  const [licenseDraft, setLicenseDraft] = useState<LicenseDraft>(createLicenseDraft())
  const lastSyncRef = useRef<string | null>(null)

  useEffect(() => {
    if (!settings) {
      return
    }

    const nextSyncKey = getSyncKey(settings)

    if (lastSyncRef.current === nextSyncKey) {
      return
    }

    lastSyncRef.current = nextSyncKey
    setSmtpDraft(createSmtpDraft(settings))
    setLlmProxyDraft(createLlmProxyDraft(settings))
    setCertificatesDraft(createCertificatesDraft(settings))
    setLicenseDraft(createLicenseDraft())
  }, [settings])

  function syncDrafts(nextSettings: PrivateDeploymentSettings) {
    lastSyncRef.current = getSyncKey(nextSettings)
    setSmtpDraft(createSmtpDraft(nextSettings))
    setLlmProxyDraft(createLlmProxyDraft(nextSettings))
    setCertificatesDraft(createCertificatesDraft(nextSettings))
    setLicenseDraft(createLicenseDraft())
  }

  function submitUpdate(
    payload: UpdatePrivateDeploymentSettingsInput,
    options: {
      successTitle: string
      successDescription: string
      errorTitle: string
      errorDescription: string
    },
  ) {
    updateMutation.mutate(payload, {
      onSuccess: (nextSettings) => {
        syncDrafts(nextSettings)
        notify({
          title: options.successTitle,
          description: options.successDescription,
          variant: 'success',
        })
      },
      onError: () => {
        notify({
          title: options.errorTitle,
          description: options.errorDescription,
          variant: 'error',
        })
      },
    })
  }

  function buildSmtpPayload(clearSecret = false): UpdatePrivateDeploymentSmtpInput {
    const payload: UpdatePrivateDeploymentSmtpInput = {
      host: normalizeNullableString(smtpDraft.host),
      port: parseNullablePort(smtpDraft.port),
      username: normalizeNullableString(smtpDraft.username),
      fromEmail: normalizeNullableString(smtpDraft.fromEmail),
      useTls: smtpDraft.useTls,
    }

    const password = smtpDraft.password.trim()

    if (clearSecret) {
      payload.passwordSecretRef = null
    } else if (password.length > 0) {
      payload.password = password
    }

    return payload
  }

  function handleSubmitSmtp() {
    try {
      submitUpdate(
        { smtp: buildSmtpPayload() },
        {
          successTitle: 'SMTP 设置已更新',
          successDescription: '新的 SMTP 配置已保存，受管密码不会在页面中回显。',
          errorTitle: '更新 SMTP 设置失败',
          errorDescription: '请检查 SMTP 主机、端口和发件配置后重试。',
        },
      )
    } catch (validationError) {
      notify({
        title: 'SMTP 配置不合法',
        description:
          validationError instanceof Error ? validationError.message : '请检查 SMTP 表单后重试。',
        variant: 'warning',
      })
    }
  }

  function handleClearSmtpSecret() {
    try {
      submitUpdate(
        { smtp: buildSmtpPayload(true) },
        {
          successTitle: 'SMTP 密码已清除',
          successDescription: '当前 SMTP 受管密码已移除。',
          errorTitle: '清除 SMTP 密码失败',
          errorDescription: '请稍后重试，或检查当前组织权限。',
        },
      )
    } catch (validationError) {
      notify({
        title: 'SMTP 配置不合法',
        description:
          validationError instanceof Error ? validationError.message : '请检查 SMTP 表单后重试。',
        variant: 'warning',
      })
    }
  }

  function buildLlmProxyPayload(clearSecret = false): UpdatePrivateDeploymentLlmProxyInput {
    const normalizedBaseUrl = normalizeNullableString(llmProxyDraft.baseUrl)

    if (
      (llmProxyDraft.mode === 'private_cloud' || llmProxyDraft.mode === 'enterprise_proxy') &&
      !normalizedBaseUrl
    ) {
      throw new Error('当前 LLM 代理模式需要填写代理基地址。')
    }

    if (llmProxyDraft.mode === 'enterprise_proxy' && !llmProxyDraft.allowExternalEgress) {
      throw new Error('enterprise_proxy 模式必须显式允许外部网络出口。')
    }

    const payload: UpdatePrivateDeploymentLlmProxyInput = {
      mode: llmProxyDraft.mode,
      baseUrl: normalizedBaseUrl,
      allowExternalEgress: llmProxyDraft.allowExternalEgress,
    }

    const apiKey = llmProxyDraft.apiKey.trim()

    if (clearSecret) {
      payload.apiKeySecretRef = null
    } else if (apiKey.length > 0) {
      payload.apiKey = apiKey
    }

    return payload
  }

  function handleSubmitLlmProxy() {
    try {
      submitUpdate(
        { llmProxy: buildLlmProxyPayload() },
        {
          successTitle: 'LLM 代理设置已更新',
          successDescription: '代理模式、地址和受管 API Key 状态已同步。',
          errorTitle: '更新 LLM 代理设置失败',
          errorDescription: '请检查代理模式、基地址和出口开关后重试。',
        },
      )
    } catch (validationError) {
      notify({
        title: 'LLM 代理配置不合法',
        description:
          validationError instanceof Error ? validationError.message : '请检查 LLM 代理表单后重试。',
        variant: 'warning',
      })
    }
  }

  function handleClearLlmProxySecret() {
    try {
      submitUpdate(
        { llmProxy: buildLlmProxyPayload(true) },
        {
          successTitle: '代理 API Key 已清除',
          successDescription: '当前 LLM 代理的受管 API Key 已移除。',
          errorTitle: '清除代理 API Key 失败',
          errorDescription: '请稍后重试，或检查当前组织权限。',
        },
      )
    } catch (validationError) {
      notify({
        title: 'LLM 代理配置不合法',
        description:
          validationError instanceof Error ? validationError.message : '请检查 LLM 代理表单后重试。',
        variant: 'warning',
      })
    }
  }

  function buildCertificatesPayload(): UpdatePrivateDeploymentCertificatesInput {
    const payload: UpdatePrivateDeploymentCertificatesInput = {
      source: certificatesDraft.source,
      tlsSecretRef: normalizeNullableString(certificatesDraft.tlsSecretRef),
      expiresAt: toIsoDateTime(certificatesDraft.expiresAt),
    }

    if (certificatesDraft.source === 'secretRef' && !payload.tlsSecretRef) {
      throw new Error('当证书来源为 secretRef 时，必须填写 TLS secret 引用。')
    }

    if (certificatesDraft.source === 'uploaded') {
      const certificatePem = certificatesDraft.certificatePem.trim()
      const privateKeyPem = certificatesDraft.privateKeyPem.trim()

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

  function handleSubmitCertificates() {
    try {
      submitUpdate(
        { certificates: buildCertificatesPayload() },
        {
          successTitle: '证书设置已更新',
          successDescription: '证书来源、引用和过期时间信息已同步。',
          errorTitle: '更新证书设置失败',
          errorDescription: '请检查证书来源与对应字段后重试。',
        },
      )
    } catch (validationError) {
      notify({
        title: '证书配置不合法',
        description:
          validationError instanceof Error ? validationError.message : '请检查证书表单后重试。',
        variant: 'warning',
      })
    }
  }

  function handleSubmitLicense() {
    const licenseKey = licenseDraft.licenseKey.trim()

    if (!licenseKey) {
      notify({
        title: '缺少 License Key',
        description: '请输入新的 License Key 后再提交。',
        variant: 'warning',
      })
      return
    }

    submitUpdate(
      {
        license: {
          licenseKey,
        },
      },
      {
        successTitle: 'License 设置已更新',
        successDescription: '新的 License Key 已提交，页面仅展示校验结果与元数据。',
        errorTitle: '更新 License 设置失败',
        errorDescription: '请确认 License Key 内容正确后重试。',
      },
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-page">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">私有部署设置</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">加载私有部署设置中…</p>
        </div>
      </div>
    )
  }

  if (isError || !settings) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-page">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">私有部署设置</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            管理 SMTP、LLM 代理、证书和离线 License 设置。部署模式由服务端环境决定，这里只做展示和配置同步。
          </p>
        </div>

        <div className="rounded-2xl border border-error/40 bg-error/5 p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">加载私有部署设置失败</p>
          <p className="mt-1 text-sm text-error">{error instanceof Error ? error.message : '未知错误'}</p>
        </div>
      </div>
    )
  }

  const actionsDisabled = updateMutation.isPending
  const resolvedTenantId = tenantClaimId ?? settings.tenantId ?? '—'

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-page">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">私有部署设置</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            统一维护 SMTP 投递、LLM 代理、TLS 证书与离线 License 状态。部署模式由服务端环境决定，这里只展示当前模式并同步组织级配置。
          </p>
        </div>
        <div className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          仅 owner / admin 可访问
        </div>
      </div>

      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="private-deployment-metadata"
      >
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">当前部署模式</h2>
          <p className="text-sm text-muted-foreground">
            `deploymentMode` 来自服务端环境，不在前端页面中直接编辑。其余配置项会按分组独立提交。
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-border/60 bg-background/30 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">相关操作</h3>
              <p className="text-sm text-muted-foreground">
                私有部署配置通常需要联动查看资源治理、运行监控与审计日志，便于统一排查企业运维问题。
              </p>
            </div>

            <nav aria-label="私有部署相关操作" className="flex flex-col items-start gap-2">
              {PRIVATE_DEPLOYMENT_RELATED_OPERATIONS.map((operation) => (
                <a
                  key={operation.href}
                  href={operation.href}
                  className="text-sm font-medium text-primary transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {operation.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">部署模式</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {DEPLOYMENT_MODE_LABELS[settings.deploymentMode]}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">组织 ID</p>
            <p className="mt-2 break-all text-sm font-medium text-foreground">{settings.organizationId}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">租户 ID</p>
            <p className="mt-2 break-all text-sm font-medium text-foreground">{resolvedTenantId}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">配置版本</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{settings.version}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>创建人：{formatNullableValue(settings.createdBy)}</span>
          <span>创建时间：{formatTimestamp(settings.createdAt)}</span>
          <span>更新人：{formatNullableValue(settings.updatedBy)}</span>
          <span>更新时间：{formatTimestamp(settings.updatedAt)}</span>
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="private-deployment-smtp-form"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">SMTP</h2>
          <p className="text-sm text-muted-foreground">
            维护邮件投递通道。页面只展示是否存在受管密码，不会回显任何明文或 secret ref 内容。
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm text-foreground" htmlFor="private-deployment-smtp-host">
            <span>SMTP 主机</span>
            <Input
              id="private-deployment-smtp-host"
              value={smtpDraft.host}
              aria-label="SMTP 主机"
              onChange={(event) => setSmtpDraft((current) => ({ ...current, host: event.target.value }))}
              placeholder="例如 smtp.internal.ling.plus"
            />
          </label>

          <label className="space-y-2 text-sm text-foreground" htmlFor="private-deployment-smtp-port">
            <span>SMTP 端口</span>
            <Input
              id="private-deployment-smtp-port"
              value={smtpDraft.port}
              aria-label="SMTP 端口"
              onChange={(event) => setSmtpDraft((current) => ({ ...current, port: event.target.value }))}
              placeholder="例如 587"
            />
          </label>

          <label className="space-y-2 text-sm text-foreground" htmlFor="private-deployment-smtp-username">
            <span>SMTP 用户名</span>
            <Input
              id="private-deployment-smtp-username"
              value={smtpDraft.username}
              aria-label="SMTP 用户名"
              onChange={(event) =>
                setSmtpDraft((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="例如 mailer"
            />
          </label>

          <label className="space-y-2 text-sm text-foreground" htmlFor="private-deployment-smtp-from-email">
            <span>发件地址</span>
            <Input
              id="private-deployment-smtp-from-email"
              value={smtpDraft.fromEmail}
              aria-label="发件地址"
              onChange={(event) =>
                setSmtpDraft((current) => ({ ...current, fromEmail: event.target.value }))
              }
              placeholder="例如 noreply@ling.plus"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <label className="space-y-2 text-sm text-foreground" htmlFor="private-deployment-smtp-password">
            <span>SMTP 密码（仅替换时填写）</span>
            <Input
              id="private-deployment-smtp-password"
              type="password"
              value={smtpDraft.password}
              aria-label="SMTP 密码（仅替换时填写）"
              onChange={(event) =>
                setSmtpDraft((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="仅在需要替换受管密码时填写"
            />
          </label>

          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">启用 TLS</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  推荐在 SMTP 通道中开启 TLS，以保护邮件传输链路。
                </p>
              </div>
              <Switch
                checked={smtpDraft.useTls}
                aria-label="启用 TLS"
                onCheckedChange={(checked) =>
                  setSmtpDraft((current) => ({ ...current, useTls: checked }))
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <SecretStatusBlock
            title="SMTP 受管密码"
            configured={Boolean(settings.smtp.passwordSecretRef)}
            description="若需轮换密码，请在上方填写一次性新值后保存；若需移除，则使用清除动作。"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmitSmtp} disabled={actionsDisabled} className="gap-2">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存 SMTP 设置
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClearSmtpSecret}
            disabled={actionsDisabled || !settings.smtp.passwordSecretRef}
          >
            清除当前 SMTP 密码
          </Button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="private-deployment-llm-proxy-form"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">LLM 代理</h2>
          <p className="text-sm text-muted-foreground">
            管理 `llmProxy` 模式、代理基地址和受管 API Key。不要在页面中展示或回填任何已保存的 Key 明文。
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <label
            className="space-y-2 text-sm text-foreground"
            htmlFor="private-deployment-llm-proxy-mode"
          >
            <span>代理模式</span>
            <Select
              id="private-deployment-llm-proxy-mode"
              value={llmProxyDraft.mode}
              aria-label="代理模式"
              onValueChange={(value) =>
                setLlmProxyDraft((current) => ({
                  ...current,
                  mode: value as PrivateDeploymentLlmProxyMode,
                }))
              }
            >
              {LLM_PROXY_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="rounded-xl border border-border/60 bg-background/30 p-4 text-xs leading-5 text-muted-foreground">
            {LLM_PROXY_MODE_OPTIONS.find((option) => option.value === llmProxyDraft.mode)?.description}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <label
            className="space-y-2 text-sm text-foreground"
            htmlFor="private-deployment-llm-proxy-base-url"
          >
            <span>代理基地址</span>
            <Input
              id="private-deployment-llm-proxy-base-url"
              value={llmProxyDraft.baseUrl}
              aria-label="代理基地址"
              onChange={(event) =>
                setLlmProxyDraft((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="OpenAI 兼容的推理端点地址，例如 https://llm.internal/v1"
            />
          </label>

          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">允许外部网络出口</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  enterprise_proxy 模式必须开启该选项，以匹配后端校验约束。
                </p>
              </div>
              <Switch
                checked={llmProxyDraft.allowExternalEgress}
                aria-label="允许外部网络出口"
                onCheckedChange={(checked) =>
                  setLlmProxyDraft((current) => ({ ...current, allowExternalEgress: checked }))
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label
            className="space-y-2 text-sm text-foreground"
            htmlFor="private-deployment-llm-proxy-api-key"
          >
            <span>代理 API Key（仅替换时填写）</span>
            <Input
              id="private-deployment-llm-proxy-api-key"
              type="password"
              value={llmProxyDraft.apiKey}
              aria-label="代理 API Key（仅替换时填写）"
              onChange={(event) =>
                setLlmProxyDraft((current) => ({ ...current, apiKey: event.target.value }))
              }
              placeholder="仅在需要替换受管 API Key 时填写"
            />
          </label>

          <SecretStatusBlock
            title="LLM 代理受管 API Key"
            configured={Boolean(settings.llmProxy.apiKeySecretRef)}
            description="如果当前代理需要凭证，请填写新的 API Key 进行替换；页面不会回显任何历史值。"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmitLlmProxy} disabled={actionsDisabled} className="gap-2">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存 LLM 代理设置
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClearLlmProxySecret}
            disabled={actionsDisabled || !settings.llmProxy.apiKeySecretRef}
          >
            清除当前代理 API Key
          </Button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="private-deployment-certificates-form"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">证书管理</h2>
          <p className="text-sm text-muted-foreground">
            维护 `certificates` 来源、TLS secret 引用和可选过期时间。已上传的证书材料不会在页面中重新显示。
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <label
            className="space-y-2 text-sm text-foreground"
            htmlFor="private-deployment-certificates-source"
          >
            <span>证书来源</span>
            <Select
              id="private-deployment-certificates-source"
              value={certificatesDraft.source}
              aria-label="证书来源"
              onValueChange={(value) =>
                setCertificatesDraft((current) => ({
                  ...current,
                  source: value as PrivateDeploymentCertificateSource,
                }))
              }
            >
              {CERTIFICATE_SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="rounded-xl border border-border/60 bg-background/30 p-4 text-xs leading-5 text-muted-foreground">
            {CERTIFICATE_SOURCE_OPTIONS.find((option) => option.value === certificatesDraft.source)?.description}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label
            className="space-y-2 text-sm text-foreground"
            htmlFor="private-deployment-certificates-expires-at"
          >
            <span>证书过期时间（可选）</span>
            <Input
              id="private-deployment-certificates-expires-at"
              type="datetime-local"
              value={certificatesDraft.expiresAt}
              aria-label="证书过期时间（可选）"
              onChange={(event) =>
                setCertificatesDraft((current) => ({ ...current, expiresAt: event.target.value }))
              }
            />
          </label>

          <div className="rounded-xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
            当前服务端记录的证书到期时间：{formatTimestamp(settings.certificates.expiresAt)}
          </div>
        </div>

        {certificatesDraft.source === 'secretRef' ? (
          <label
            className="mt-4 block space-y-2 text-sm text-foreground"
            htmlFor="private-deployment-certificates-tls-secret-ref"
          >
            <span>TLS Secret 引用</span>
            <Input
              id="private-deployment-certificates-tls-secret-ref"
              value={certificatesDraft.tlsSecretRef}
              aria-label="TLS Secret 引用"
              onChange={(event) =>
                setCertificatesDraft((current) => ({ ...current, tlsSecretRef: event.target.value }))
              }
              placeholder="例如 k8s://secrets/namespace/tls-secret"
            />
          </label>
        ) : null}

        {certificatesDraft.source === 'uploaded' ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label
              className="space-y-2 text-sm text-foreground"
              htmlFor="private-deployment-certificates-certificate-pem"
            >
              <span>证书 PEM（仅替换时填写）</span>
              <textarea
                id="private-deployment-certificates-certificate-pem"
                value={certificatesDraft.certificatePem}
                rows={8}
                aria-label="证书 PEM（仅替换时填写）"
                onChange={(event) =>
                  setCertificatesDraft((current) => ({
                    ...current,
                    certificatePem: event.target.value,
                  }))
                }
                placeholder="粘贴新的证书 PEM 内容"
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label
              className="space-y-2 text-sm text-foreground"
              htmlFor="private-deployment-certificates-private-key-pem"
            >
              <span>私钥 PEM（仅替换时填写）</span>
              <textarea
                id="private-deployment-certificates-private-key-pem"
                value={certificatesDraft.privateKeyPem}
                rows={8}
                aria-label="私钥 PEM（仅替换时填写）"
                onChange={(event) =>
                  setCertificatesDraft((current) => ({
                    ...current,
                    privateKeyPem: event.target.value,
                  }))
                }
                placeholder="粘贴新的私钥 PEM 内容"
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleSubmitCertificates}
            disabled={actionsDisabled}
            className="gap-2"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存证书设置
          </Button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="private-deployment-license-form"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">License 管理</h2>
          <p className="text-sm text-muted-foreground">
            这里只展示 License 校验状态和元数据。新的 License Key 只会一次性提交，不会回显历史内容。
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">状态</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {LICENSE_STATUS_LABELS[settings.license.status]}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">指纹</p>
            <p className="mt-2 break-all text-sm font-medium text-foreground">
              {formatNullableValue(settings.license.fingerprint)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">到期时间</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatTimestamp(settings.license.expiresAt)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">最近校验</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatTimestamp(settings.license.lastVerifiedAt)}
            </p>
          </div>
        </div>

        <label className="mt-4 block space-y-2 text-sm text-foreground" htmlFor="private-deployment-license-key">
          <span>新的 License Key</span>
          <textarea
            id="private-deployment-license-key"
            value={licenseDraft.licenseKey}
            rows={6}
            aria-label="新的 License Key"
            onChange={(event) => setLicenseDraft({ licenseKey: event.target.value })}
            placeholder="粘贴新的离线 License Key。提交后页面仅显示状态、指纹和校验时间。"
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmitLicense} disabled={actionsDisabled} className="gap-2">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存 License 设置
          </Button>
        </div>
      </section>
    </div>
  )
}

export function PrivateDeploymentPage() {
  const authToken = useAuthToken()
  const currentUserRole = getPrivateDeploymentRoleFromToken(authToken)
  const organizationId = getPrivateDeploymentOrganizationIdFromToken(authToken)
  const tenantClaimId = getPrivateDeploymentTenantIdFromToken(authToken)

  if (!canManagePrivateDeployment(currentUserRole)) {
    return <PrivateDeploymentForbiddenState authToken={authToken} role={currentUserRole} />
  }

  if (!organizationId) {
    return <PrivateDeploymentMissingOrgState />
  }

  return <PrivateDeploymentContent organizationId={organizationId} tenantClaimId={tenantClaimId} />
}
