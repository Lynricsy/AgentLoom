import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { motion } from 'motion/react'
import { HTTPError } from 'ky'
import type { AutonomyMode } from '@/features/canvas/autonomy.types'
import { useAuthToken } from '@/features/execution'
import { useCurrentOrganization } from '@/features/organization/api/organizationQueries'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { staggerList } from '@/shared/lib/motion'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import {
  useConfirmOrganizationAutonomyDowngrade,
  useOrganizationAutonomyPolicy,
  usePreviewOrganizationAutonomyDowngrade,
  useUpdateOrganizationAutonomyPolicy,
} from '../hooks/useOrganizationAutonomyPolicy'
import {
  AUTONOMY_MODE_OPTIONS,
  compareAutonomyModes,
  formatAutonomyModeValue,
  getAutonomyModeDescription,
  getAutonomyModeLabel,
} from '../lib/autonomyModePolicy'
import {
  canManageOrganizationAutonomyPolicy,
  getOrganizationAutonomyPolicyRoleFromToken,
} from '../lib/organizationAutonomyPolicyPermissions'
import type {
  OrganizationAutonomyDowngradePreview,
  OrganizationAutonomyViolationDetail,
  OrganizationAutonomyViolationSummary,
} from '../types/organizationAutonomyPolicy'

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

const PAGE_DESCRIPTION =
  '在组织级别约束 LLM Agent 的自治上限，并在必要时批量降级现有工作流节点。'

function SummaryStats({
  summary,
  label,
}: {
  summary: OrganizationAutonomyViolationSummary
  label: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-card border border-border bg-surface p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          {label}工作流
        </p>
        <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">
          {summary.workflowCount}
        </p>
      </div>
      <div className="rounded-card border border-border bg-surface p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          {label}节点
        </p>
        <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">
          {summary.nodeCount}
        </p>
      </div>
    </div>
  )
}

function ViolationList({ violations }: { violations: OrganizationAutonomyViolationDetail[] }) {
  if (violations.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="当前预览没有发现需要批量降级的节点。"
        description="所有节点的自治模式都已在目标上限之内。"
        tone="var(--color-success)"
        className="py-8"
      />
    )
  }

  return (
    <div className="space-y-2">
      {violations.map((violation, index) => (
        <motion.div
          key={`${violation.workflowId}:${violation.nodeId}`}
          {...staggerList(index)}
          className="rounded-card border border-border bg-surface-elevated p-3"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {violation.nodeName}
                </p>
                <p className="truncate text-[11px] text-muted">
                  工作流：{violation.workflowName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" size="sm">
                  当前：{formatAutonomyModeValue(violation.rawMode)}
                </Badge>
                <Badge variant="secondary" size="sm">
                  规范值：{getAutonomyModeLabel(violation.canonicalMode)}
                </Badge>
                <Badge variant="warning" size="sm">
                  将降级为：{getAutonomyModeLabel(violation.replacementMode)}
                </Badge>
              </div>
            </div>

            <Badge variant="outline" size="sm" className="shrink-0">
              {violation.reasonCode}
            </Badge>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-muted">{violation.message}</p>
        </motion.div>
      ))}
    </div>
  )
}

function AutonomyPolicyBlockedState({
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
      <PageHeader
        icon={SlidersHorizontal}
        title="组织自治策略"
        description={PAGE_DESCRIPTION}
      />

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
function AutonomyPolicyOrganizationLoadingState() {
  return (
    <div
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="organization-autonomy-policy-organization-loading"
    >
      <PageHeader
        icon={SlidersHorizontal}
        title="组织自治策略"
        description={PAGE_DESCRIPTION}
      />

      <p className="text-xs text-muted">正在确认当前组织…</p>

      <div className="space-y-3">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-44 rounded-card" />
      </div>
    </div>
  )
}

function OrganizationAutonomyPolicyContent({
  organizationId,
}: {
  organizationId: string
}) {
  const { notify } = useToast()
  const {
    data: policy,
    isLoading,
    isError,
    error,
  } = useOrganizationAutonomyPolicy(organizationId)
  const updateMutation = useUpdateOrganizationAutonomyPolicy(organizationId)
  const previewMutation = usePreviewOrganizationAutonomyDowngrade(organizationId)
  const confirmMutation = useConfirmOrganizationAutonomyDowngrade(organizationId)

  const [draftCap, setDraftCap] = useState<AutonomyMode>('MANUAL_CONFIRM')
  const [previewResult, setPreviewResult] = useState<OrganizationAutonomyDowngradePreview | null>(null)
  const lastPolicySyncRef = useRef<string | null>(null)

  useEffect(() => {
    if (!policy) {
      return
    }

    const nextSyncKey = `${policy.organizationId}:${policy.version}:${policy.autonomyCap}`
    if (lastPolicySyncRef.current === nextSyncKey) {
      return
    }

    lastPolicySyncRef.current = nextSyncKey
    setDraftCap(policy.autonomyCap)
    setPreviewResult(null)
  }, [policy])

  const currentCap = policy?.autonomyCap ?? null
  const isDirty = currentCap != null && draftCap !== currentCap
  const isTightening =
    currentCap != null ? compareAutonomyModes(draftCap, currentCap) < 0 : false
  const previewMatchesDraft = previewResult?.autonomyCap === draftCap
  const selectedModeDescription = useMemo(
    () => getAutonomyModeDescription(draftCap),
    [draftCap],
  )

  function handleDraftCapChange(nextCap: string) {
    setDraftCap(nextCap as AutonomyMode)
    setPreviewResult(null)
  }

  function handleSavePolicyOnly() {
    updateMutation.mutate(
      { autonomyCap: draftCap },
      {
        onSuccess: (nextPolicy) => {
          setDraftCap(nextPolicy.autonomyCap)
          setPreviewResult(null)
          notify({
            title: '组织自治策略已更新',
            description: `当前自治上限已更新为 ${getAutonomyModeLabel(nextPolicy.autonomyCap)}。`,
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '更新组织自治策略失败',
            description: '请刷新页面后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  function handlePreviewDowngrade() {
    previewMutation.mutate(
      { autonomyCap: draftCap },
      {
        onSuccess: (nextPreview) => {
          setPreviewResult(nextPreview)
          notify({
            title: '已生成降级预览',
            description: `发现 ${nextPreview.violationSummary.nodeCount} 个节点可能需要降级。`,
            variant: 'info',
          })
        },
        onError: () => {
          notify({
            title: '生成降级预览失败',
            description: '请刷新页面后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  function handleConfirmDowngrade() {
    confirmMutation.mutate(
      { autonomyCap: draftCap },
      {
        onSuccess: (result) => {
          setDraftCap(result.policy.autonomyCap)
          setPreviewResult(null)
          notify({
            title: '已确认批量降级',
            description: `已将组织自治上限更新为 ${getAutonomyModeLabel(result.autonomyCap)}，并处理 ${result.downgradedSummary.nodeCount} 个节点。`,
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '确认批量降级失败',
            description: '请刷新页面后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div
        className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
        data-testid="organization-autonomy-policy-page"
      >
        <PageHeader
          icon={SlidersHorizontal}
          title="组织自治策略"
          description="加载组织自治策略中…"
        />
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    )
  }

  if (isError || !policy) {
    return (
      <div
        className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
        data-testid="organization-autonomy-policy-page"
      >
        <PageHeader
          icon={SlidersHorizontal}
          title="组织自治策略"
          description={PAGE_DESCRIPTION}
        />

        <Card className="border-error/40">
          <CardContent className="space-y-1 p-5">
            <p className="text-sm font-medium text-foreground">加载组织自治策略失败</p>
            <p className="text-xs font-medium text-error">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const actionsDisabled =
    updateMutation.isPending || previewMutation.isPending || confirmMutation.isPending

  return (
    <div
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="organization-autonomy-policy-page"
    >
      <PageHeader
        icon={SlidersHorizontal}
        title="组织自治策略"
        description="统一约束组织内 LLM Agent 的自治上限；当策略收紧时，你可以只更新上限，或先预览再确认批量降级现有节点。"
        actions={<Badge variant="secondary">仅 owner 可访问</Badge>}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 text-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                <CardTitle>当前组织策略</CardTitle>
              </div>
              <p className="text-xs text-muted">
                当前自治上限为{' '}
                <span className="font-medium text-foreground">
                  {getAutonomyModeLabel(policy.autonomyCap)}
                </span>
                。
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                <span>组织 ID：{policy.organizationId}</span>
                <span>版本：{policy.version}</span>
                <span>更新人：{policy.updatedBy ?? '—'}</span>
                <span>更新时间：{formatTimestamp(policy.updatedAt)}</span>
              </div>
            </div>

            <p className="shrink-0 rounded-card border border-border bg-surface-elevated px-3 py-2 text-[11px] leading-relaxed text-muted">
              当前存在 {policy.violationSummary.workflowCount} 个工作流、
              {policy.violationSummary.nodeCount} 个节点超出组织上限。
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <SummaryStats summary={policy.violationSummary} label="当前超上限" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>调整自治上限</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            选择新的组织级自治上限。更严格的上限会阻止更高自治模式继续被采纳。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <label
                className="block text-xs font-medium text-muted"
                htmlFor="organization-autonomy-cap-select"
              >
                目标自治上限
              </label>
              <Select value={draftCap} onValueChange={handleDraftCapChange}>
                <SelectTrigger
                  id="organization-autonomy-cap-select"
                  aria-label="目标自治上限"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTONOMY_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-card border border-border bg-surface-elevated p-3">
              <p className="text-xs font-medium text-foreground">
                {getAutonomyModeLabel(draftCap)}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {selectedModeDescription}
              </p>
            </div>
          </div>

          {isTightening ? (
            <p className="rounded-card border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
              这次变更会收紧组织自治上限。你可以直接“仅更新策略”，只阻断后续更高自治建议；也可以先预览，再确认批量降级当前已超上限的节点。
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSavePolicyOnly}
              disabled={!isDirty || actionsDisabled}
            >
              {isTightening ? '仅更新策略' : '保存策略'}
            </Button>

            {isTightening ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handlePreviewDowngrade}
                disabled={!isDirty || actionsDisabled}
              >
                {previewMatchesDraft ? '重新预览批量降级影响' : '预览批量降级影响'}
              </Button>
            ) : null}

            {previewMatchesDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleConfirmDowngrade}
                disabled={actionsDisabled}
              >
                确认批量降级并更新策略
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {previewResult ? (
        <Card data-testid="organization-autonomy-policy-preview">
          <CardHeader>
            <CardTitle>批量降级预览</CardTitle>
            <p className="text-xs leading-relaxed text-muted">
              预览目标上限为 {getAutonomyModeLabel(previewResult.autonomyCap)}
              。确认后，以下节点会被批量调整到允许的自治模式。
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            <SummaryStats summary={previewResult.violationSummary} label="预估受影响" />
            <ViolationList violations={previewResult.violations} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function OrganizationAutonomyPolicyPage() {
  const authToken = useAuthToken()
  // 角色仍然从令牌里读（tenant_role claim 真实存在），只有组织 id 改由服务端解析
  const currentUserRole = getOrganizationAutonomyPolicyRoleFromToken(authToken)
  const canManage = canManageOrganizationAutonomyPolicy(currentUserRole)
  const {
    data: currentOrganization,
    isLoading: isOrganizationLoading,
    error: organizationError,
    refetch: refetchOrganization,
  } = useCurrentOrganization({ enabled: canManage })
  const organizationId = currentOrganization?.id

  if (!canManage) {
    return (
      <AutonomyPolicyBlockedState
        testId="organization-autonomy-policy-forbidden"
        icon={ShieldAlert}
        title="无权访问组织自治策略"
        message={
          !authToken || !currentUserRole
            ? '当前未识别到可管理组织自治策略的租户身份，请使用 owner 角色重新登录。'
            : `当前租户角色为 ${currentUserRole}，只有 owner 可以管理组织自治策略。`
        }
      />
    )
  }

  if (isOrganizationLoading) {
    return <AutonomyPolicyOrganizationLoadingState />
  }

  if (!organizationId) {
    return (
      <AutonomyPolicyBlockedState
        testId="organization-autonomy-policy-missing-org"
        icon={AlertTriangle}
        title="无法确定当前组织"
        message={
          organizationError instanceof HTTPError && organizationError.response.status === 404
            ? '当前租户还没有关联组织，或当前账号不是该组织成员，因此无法加载组织自治策略。'
            : '获取当前组织信息失败，暂时无法加载组织自治策略，请稍后重试。'
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

  return <OrganizationAutonomyPolicyContent organizationId={organizationId} />
}
