import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  ServerCog,
  ShieldAlert,
} from 'lucide-react'
import { HTTPError } from 'ky'
import { useAuthToken } from '@/features/execution'
import { useCurrentOrganization } from '@/features/organization/api/organizationQueries'
import { cn } from '@/shared/lib/utils'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'
import {
  usePrivateDeployment,
  useUpdatePrivateDeploymentSettings,
} from '../hooks/usePrivateDeployment'
import {
  canManagePrivateDeployment,
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

const PAGE_DESCRIPTION =
  '管理 SMTP、LLM 代理、证书和离线 License 设置。部署模式由服务端环境决定，这里只做展示和配置同步。'

/** 表单字段：统一 label 与控件的间距、字号 */
function Field({
  htmlFor,
  label,
  className,
  children,
}: {
  htmlFor: string
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-muted" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

/** 元数据小格：统一 label / value 的字号与间距 */
function MetaTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-1.5 break-all text-xs font-medium text-foreground">{value}</div>
    </div>
  )
}

/** 开关卡：Switch 与说明文案的统一排版 */
function ToggleTile({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <Switch checked={checked} aria-label={title} onCheckedChange={onCheckedChange} />
    </div>
  )
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
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <Badge variant={configured ? 'success' : 'secondary'} size="sm">
        {configured ? '已配置受管密钥' : '未配置'}
      </Badge>
    </div>
  )
}

function PrivateDeploymentBlockedState({
  testId,
  icon: Icon,
  title,
  message,
  action,
}: {
  testId: string
  icon: typeof ShieldAlert
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid={testId}>
      <PageHeader icon={ServerCog} title="私有部署设置" description={PAGE_DESCRIPTION} />

      <Card className="border-warning/30">
        <CardContent className="flex items-start gap-3 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-warning/10 text-warning">
            <Icon className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs leading-relaxed text-muted">{message}</p>
            {action ? <div className="pt-1">{action}</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** 组织解析中：只出骨架，避免闪现「无法确定当前组织」的错误态 */
function PrivateDeploymentOrganizationLoadingState() {
  return (
    <div
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="private-deployment-organization-loading"
    >
      <PageHeader icon={ServerCog} title="私有部署设置" description={PAGE_DESCRIPTION} />

      <p className="flex items-center gap-2 text-xs text-muted">
        <Spinner size="sm" />
        正在确认当前组织…
      </p>

      <div className="space-y-3">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-44 rounded-card" />
      </div>
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
        <PageHeader icon={ServerCog} title="私有部署设置" description="加载私有部署设置中…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  }

  if (isError || !settings) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-page">
        <PageHeader icon={ServerCog} title="私有部署设置" description={PAGE_DESCRIPTION} />

        <Card className="border-error/40">
          <CardContent className="space-y-1 p-5">
            <p className="text-sm font-medium text-foreground">加载私有部署设置失败</p>
            <p className="text-xs font-medium text-error">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const actionsDisabled = updateMutation.isPending
  const resolvedTenantId = tenantClaimId ?? settings.tenantId ?? '—'

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="private-deployment-page">
      <PageHeader
        icon={ServerCog}
        title="私有部署设置"
        description="统一维护 SMTP 投递、LLM 代理、TLS 证书与离线 License 状态。部署模式由服务端环境决定，这里只展示当前模式并同步组织级配置。"
        actions={<Badge variant="secondary">仅 owner / admin 可访问</Badge>}
      />

      <Card data-testid="private-deployment-metadata">
        <CardHeader>
          <CardTitle>当前部署模式</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            `deploymentMode` 来自服务端环境，不在前端页面中直接编辑。其余配置项会按分组独立提交。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-elevated p-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="text-xs font-semibold text-foreground">相关操作</h3>
              <p className="text-[11px] leading-relaxed text-muted">
                私有部署配置通常需要联动查看资源治理、运行监控与审计日志，便于统一排查企业运维问题。
              </p>
            </div>

            <nav aria-label="私有部署相关操作" className="flex flex-wrap items-center gap-3">
              {PRIVATE_DEPLOYMENT_RELATED_OPERATIONS.map((operation) => (
                <a
                  key={operation.href}
                  href={operation.href}
                  className="rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {operation.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetaTile label="部署模式" value={DEPLOYMENT_MODE_LABELS[settings.deploymentMode]} />
            <MetaTile label="组织 ID" value={settings.organizationId} />
            <MetaTile label="租户 ID" value={resolvedTenantId} />
            <MetaTile label="配置版本" value={settings.version} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>创建人：{formatNullableValue(settings.createdBy)}</span>
            <span>创建时间：{formatTimestamp(settings.createdAt)}</span>
            <span>更新人：{formatNullableValue(settings.updatedBy)}</span>
            <span>更新时间：{formatTimestamp(settings.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="private-deployment-smtp-form">
        <CardHeader>
          <CardTitle>SMTP</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            维护邮件投递通道。页面只展示是否存在受管密码，不会回显任何明文或 secret ref 内容。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field htmlFor="private-deployment-smtp-host" label="SMTP 主机">
              <Input
                id="private-deployment-smtp-host"
                value={smtpDraft.host}
                aria-label="SMTP 主机"
                onChange={(event) =>
                  setSmtpDraft((current) => ({ ...current, host: event.target.value }))
                }
                placeholder="例如 smtp.internal.ling.plus"
              />
            </Field>

            <Field htmlFor="private-deployment-smtp-port" label="SMTP 端口">
              <Input
                id="private-deployment-smtp-port"
                value={smtpDraft.port}
                aria-label="SMTP 端口"
                onChange={(event) =>
                  setSmtpDraft((current) => ({ ...current, port: event.target.value }))
                }
                placeholder="例如 587"
              />
            </Field>

            <Field htmlFor="private-deployment-smtp-username" label="SMTP 用户名">
              <Input
                id="private-deployment-smtp-username"
                value={smtpDraft.username}
                aria-label="SMTP 用户名"
                onChange={(event) =>
                  setSmtpDraft((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="例如 mailer"
              />
            </Field>

            <Field htmlFor="private-deployment-smtp-from-email" label="发件地址">
              <Input
                id="private-deployment-smtp-from-email"
                value={smtpDraft.fromEmail}
                aria-label="发件地址"
                onChange={(event) =>
                  setSmtpDraft((current) => ({ ...current, fromEmail: event.target.value }))
                }
                placeholder="例如 noreply@ling.plus"
              />
            </Field>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Field htmlFor="private-deployment-smtp-password" label="SMTP 密码（仅替换时填写）">
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
            </Field>

            <ToggleTile
              title="启用 TLS"
              description="推荐在 SMTP 通道中开启 TLS，以保护邮件传输链路。"
              checked={smtpDraft.useTls}
              onCheckedChange={(checked) =>
                setSmtpDraft((current) => ({ ...current, useTls: checked }))
              }
            />
          </div>

          <SecretStatusBlock
            title="SMTP 受管密码"
            configured={Boolean(settings.smtp.passwordSecretRef)}
            description="若需轮换密码，请在上方填写一次性新值后保存；若需移除，则使用清除动作。"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitSmtp}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {updateMutation.isPending ? <Spinner size="sm" /> : null}
              保存 SMTP 设置
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClearSmtpSecret}
              disabled={actionsDisabled || !settings.smtp.passwordSecretRef}
            >
              清除当前 SMTP 密码
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="private-deployment-llm-proxy-form">
        <CardHeader>
          <CardTitle>LLM 代理</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            管理 `llmProxy` 模式、代理基地址和受管 API Key。不要在页面中展示或回填任何已保存的 Key 明文。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <Field htmlFor="private-deployment-llm-proxy-mode" label="代理模式">
              <Select
                value={llmProxyDraft.mode}
                onValueChange={(value) =>
                  setLlmProxyDraft((current) => ({
                    ...current,
                    mode: value as PrivateDeploymentLlmProxyMode,
                  }))
                }
              >
                <SelectTrigger id="private-deployment-llm-proxy-mode" aria-label="代理模式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROXY_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <p className="self-end rounded-card border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
              {
                LLM_PROXY_MODE_OPTIONS.find((option) => option.value === llmProxyDraft.mode)
                  ?.description
              }
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Field htmlFor="private-deployment-llm-proxy-base-url" label="代理基地址">
              <Input
                id="private-deployment-llm-proxy-base-url"
                value={llmProxyDraft.baseUrl}
                aria-label="代理基地址"
                onChange={(event) =>
                  setLlmProxyDraft((current) => ({ ...current, baseUrl: event.target.value }))
                }
                placeholder="OpenAI 兼容的推理端点地址，例如 https://llm.internal/v1"
              />
            </Field>

            <ToggleTile
              title="允许外部网络出口"
              description="enterprise_proxy 模式必须开启该选项，以匹配后端校验约束。"
              checked={llmProxyDraft.allowExternalEgress}
              onCheckedChange={(checked) =>
                setLlmProxyDraft((current) => ({ ...current, allowExternalEgress: checked }))
              }
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              htmlFor="private-deployment-llm-proxy-api-key"
              label="代理 API Key（仅替换时填写）"
            >
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
            </Field>

            <SecretStatusBlock
              title="LLM 代理受管 API Key"
              configured={Boolean(settings.llmProxy.apiKeySecretRef)}
              description="如果当前代理需要凭证，请填写新的 API Key 进行替换；页面不会回显任何历史值。"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitLlmProxy}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {updateMutation.isPending ? <Spinner size="sm" /> : null}
              保存 LLM 代理设置
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClearLlmProxySecret}
              disabled={actionsDisabled || !settings.llmProxy.apiKeySecretRef}
            >
              清除当前代理 API Key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="private-deployment-certificates-form">
        <CardHeader>
          <CardTitle>证书管理</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            维护 `certificates` 来源、TLS secret 引用和可选过期时间。已上传的证书材料不会在页面中重新显示。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <Field htmlFor="private-deployment-certificates-source" label="证书来源">
              <Select
                value={certificatesDraft.source}
                onValueChange={(value) =>
                  setCertificatesDraft((current) => ({
                    ...current,
                    source: value as PrivateDeploymentCertificateSource,
                  }))
                }
              >
                <SelectTrigger id="private-deployment-certificates-source" aria-label="证书来源">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CERTIFICATE_SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <p className="self-end rounded-card border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
              {
                CERTIFICATE_SOURCE_OPTIONS.find(
                  (option) => option.value === certificatesDraft.source,
                )?.description
              }
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              htmlFor="private-deployment-certificates-expires-at"
              label="证书过期时间（可选）"
            >
              <Input
                id="private-deployment-certificates-expires-at"
                type="datetime-local"
                value={certificatesDraft.expiresAt}
                aria-label="证书过期时间（可选）"
                onChange={(event) =>
                  setCertificatesDraft((current) => ({ ...current, expiresAt: event.target.value }))
                }
              />
            </Field>

            <p className="self-end rounded-card border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
              当前服务端记录的证书到期时间：{formatTimestamp(settings.certificates.expiresAt)}
            </p>
          </div>

          {certificatesDraft.source === 'secretRef' ? (
            <Field
              htmlFor="private-deployment-certificates-tls-secret-ref"
              label="TLS Secret 引用"
            >
              <Input
                id="private-deployment-certificates-tls-secret-ref"
                value={certificatesDraft.tlsSecretRef}
                aria-label="TLS Secret 引用"
                onChange={(event) =>
                  setCertificatesDraft((current) => ({
                    ...current,
                    tlsSecretRef: event.target.value,
                  }))
                }
                placeholder="例如 k8s://secrets/namespace/tls-secret"
              />
            </Field>
          ) : null}

          {certificatesDraft.source === 'uploaded' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Field
                htmlFor="private-deployment-certificates-certificate-pem"
                label="证书 PEM（仅替换时填写）"
              >
                <Textarea
                  id="private-deployment-certificates-certificate-pem"
                  value={certificatesDraft.certificatePem}
                  rows={8}
                  aria-label="证书 PEM（仅替换时填写）"
                  className="resize-y font-mono"
                  onChange={(event) =>
                    setCertificatesDraft((current) => ({
                      ...current,
                      certificatePem: event.target.value,
                    }))
                  }
                  placeholder="粘贴新的证书 PEM 内容"
                />
              </Field>

              <Field
                htmlFor="private-deployment-certificates-private-key-pem"
                label="私钥 PEM（仅替换时填写）"
              >
                <Textarea
                  id="private-deployment-certificates-private-key-pem"
                  value={certificatesDraft.privateKeyPem}
                  rows={8}
                  aria-label="私钥 PEM（仅替换时填写）"
                  className="resize-y font-mono"
                  onChange={(event) =>
                    setCertificatesDraft((current) => ({
                      ...current,
                      privateKeyPem: event.target.value,
                    }))
                  }
                  placeholder="粘贴新的私钥 PEM 内容"
                />
              </Field>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitCertificates}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {updateMutation.isPending ? <Spinner size="sm" /> : null}
              保存证书设置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="private-deployment-license-form">
        <CardHeader>
          <CardTitle>License 管理</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            这里只展示 License 校验状态和元数据。新的 License Key 只会一次性提交，不会回显历史内容。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetaTile label="状态" value={LICENSE_STATUS_LABELS[settings.license.status]} />
            <MetaTile label="指纹" value={formatNullableValue(settings.license.fingerprint)} />
            <MetaTile label="到期时间" value={formatTimestamp(settings.license.expiresAt)} />
            <MetaTile label="最近校验" value={formatTimestamp(settings.license.lastVerifiedAt)} />
          </div>

          <Field htmlFor="private-deployment-license-key" label="新的 License Key">
            <Textarea
              id="private-deployment-license-key"
              value={licenseDraft.licenseKey}
              rows={6}
              aria-label="新的 License Key"
              className="resize-y font-mono"
              onChange={(event) => setLicenseDraft({ licenseKey: event.target.value })}
              placeholder="粘贴新的离线 License Key。提交后页面仅显示状态、指纹和校验时间。"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitLicense}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {updateMutation.isPending ? <Spinner size="sm" /> : null}
              保存 License 设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function PrivateDeploymentPage() {
  const authToken = useAuthToken()
  // 角色与租户 id 仍然从令牌里读（tenant_role / tenant_id claim 真实存在），
  // 只有组织 id 改由服务端解析
  const currentUserRole = getPrivateDeploymentRoleFromToken(authToken)
  const tenantClaimId = getPrivateDeploymentTenantIdFromToken(authToken)
  const canManage = canManagePrivateDeployment(currentUserRole)
  const {
    data: currentOrganization,
    isLoading: isOrganizationLoading,
    error: organizationError,
    refetch: refetchOrganization,
  } = useCurrentOrganization({ enabled: canManage })
  const organizationId = currentOrganization?.id

  if (!canManage) {
    return (
      <PrivateDeploymentBlockedState
        testId="private-deployment-forbidden"
        icon={ShieldAlert}
        title="无权访问私有部署设置"
        message={
          !authToken || !currentUserRole
            ? '当前未识别到可管理私有部署设置的租户身份，请使用 owner 或 admin 角色重新登录。'
            : `当前租户角色为 ${currentUserRole}，只有 owner 或 admin 可以管理私有部署设置。`
        }
      />
    )
  }

  if (isOrganizationLoading) {
    return <PrivateDeploymentOrganizationLoadingState />
  }

  if (!organizationId) {
    return (
      <PrivateDeploymentBlockedState
        testId="private-deployment-missing-org"
        icon={AlertTriangle}
        title="无法确定当前组织"
        message={
          organizationError instanceof HTTPError && organizationError.response.status === 404
            ? '当前租户还没有关联组织，或当前账号不是该组织成员，因此无法加载私有部署设置。'
            : '获取当前组织信息失败，暂时无法加载私有部署设置，请稍后重试。'
        }
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void refetchOrganization()}
          >
            重试
          </Button>
        }
      />
    )
  }

  return <PrivateDeploymentContent organizationId={organizationId} tenantClaimId={tenantClaimId} />
}
