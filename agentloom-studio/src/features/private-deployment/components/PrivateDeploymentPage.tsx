import type { ReactNode } from 'react'
import { AlertTriangle, ServerCog, ShieldAlert } from 'lucide-react'
import { HTTPError } from 'ky'
import { useAuthToken } from '@/features/execution'
import { useCurrentOrganization } from '@/features/organization/api/organizationQueries'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { MetaTile } from './PrivateDeploymentFormPrimitives'
import { PrivateDeploymentCertificatesCard } from './PrivateDeploymentCertificatesCard'
import { PrivateDeploymentLicenseCard } from './PrivateDeploymentLicenseCard'
import { PrivateDeploymentLlmProxyCard } from './PrivateDeploymentLlmProxyCard'
import { PrivateDeploymentSmtpCard } from './PrivateDeploymentSmtpCard'
import { usePrivateDeployment } from '../hooks/usePrivateDeployment'
import { usePrivateDeploymentDrafts } from '../hooks/usePrivateDeploymentDrafts'
import {
  formatNullableValue,
  formatTimestamp,
} from '../lib/privateDeploymentPayloads'
import {
  canManagePrivateDeployment,
  getPrivateDeploymentRoleFromToken,
  getPrivateDeploymentTenantIdFromToken,
} from '../lib/privateDeploymentPermissions'
import type { DeploymentMode } from '../types/privateDeployment'

const DEPLOYMENT_MODE_LABELS: Record<DeploymentMode, string> = {
  saas: 'SaaS 托管',
  private: '私有部署',
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

const PAGE_DESCRIPTION =
  '管理 SMTP、LLM 代理、证书和离线 License 设置。部署模式由服务端环境决定，这里只做展示和配置同步。'

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
  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = usePrivateDeployment(organizationId)
  const drafts = usePrivateDeploymentDrafts({ organizationId, settings })

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

      <PrivateDeploymentSmtpCard
        draft={drafts.smtpDraft}
        setDraft={drafts.setSmtpDraft}
        hasManagedPassword={Boolean(settings.smtp.passwordSecretRef)}
        isSubmitting={drafts.isSubmitting}
        onSubmit={drafts.submitSmtp}
        onClearSecret={drafts.clearSmtpSecret}
      />

      <PrivateDeploymentLlmProxyCard
        draft={drafts.llmProxyDraft}
        setDraft={drafts.setLlmProxyDraft}
        hasManagedApiKey={Boolean(settings.llmProxy.apiKeySecretRef)}
        isSubmitting={drafts.isSubmitting}
        onSubmit={drafts.submitLlmProxy}
        onClearSecret={drafts.clearLlmProxySecret}
      />

      <PrivateDeploymentCertificatesCard
        draft={drafts.certificatesDraft}
        setDraft={drafts.setCertificatesDraft}
        serverExpiresAt={settings.certificates.expiresAt}
        isSubmitting={drafts.isSubmitting}
        onSubmit={drafts.submitCertificates}
      />

      <PrivateDeploymentLicenseCard
        draft={drafts.licenseDraft}
        setDraft={drafts.setLicenseDraft}
        license={settings.license}
        isSubmitting={drafts.isSubmitting}
        onSubmit={drafts.submitLicense}
      />
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
