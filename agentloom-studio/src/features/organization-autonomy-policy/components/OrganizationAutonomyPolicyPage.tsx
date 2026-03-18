import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertTriangle, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import type { AutonomyMode } from '@/features/canvas/autonomy.types'
import { useAuthToken } from '@/features/execution'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/select'
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
  getOrganizationIdFromToken,
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

function getForbiddenMessage(authToken?: string, role?: string | null) {
  if (!authToken || !role) {
    return '当前未识别到可管理组织自治策略的租户身份，请使用 owner 角色重新登录。'
  }

  return `当前租户角色为 ${role}，只有 owner 可以管理组织自治策略。`
}

function SummaryStats({
  summary,
  label,
}: {
  summary: OrganizationAutonomyViolationSummary
  label: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/60 bg-background/30 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}工作流</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{summary.workflowCount}</p>
      </div>
      <div className="rounded-xl border border-border/60 bg-background/30 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}节点</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{summary.nodeCount}</p>
      </div>
    </div>
  )
}

function ViolationList({ violations }: { violations: OrganizationAutonomyViolationDetail[] }) {
  if (violations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
        当前预览没有发现需要批量降级的节点。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {violations.map((violation) => (
        <div
          key={`${violation.workflowId}:${violation.nodeId}`}
          className="rounded-xl border border-border/60 bg-background/30 p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">{violation.nodeName}</p>
                <p className="text-xs text-muted-foreground">工作流：{violation.workflowName}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-0.5">
                  当前：{formatAutonomyModeValue(violation.rawMode)}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5">
                  规范值：{getAutonomyModeLabel(violation.canonicalMode)}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-foreground">
                  将降级为：{getAutonomyModeLabel(violation.replacementMode)}
                </span>
              </div>
            </div>

            <div className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              {violation.reasonCode}
            </div>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">{violation.message}</p>
        </div>
      ))}
    </div>
  )
}

function OrganizationAutonomyPolicyForbiddenState({
  authToken,
  role,
}: {
  authToken?: string
  role?: string | null
}) {
  return (
    <div
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="organization-autonomy-policy-forbidden"
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">组织自治策略</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          在组织级别约束 LLM Agent 的自治上限，并在必要时批量降级现有工作流节点。
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-surface-elevated p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">无权访问组织自治策略</h2>
            <p className="text-sm text-muted-foreground">{getForbiddenMessage(authToken, role)}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function OrganizationAutonomyPolicyMissingOrgState() {
  return (
    <div
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="organization-autonomy-policy-missing-org"
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">组织自治策略</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          在组织级别约束 LLM Agent 的自治上限，并在必要时批量降级现有工作流节点。
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
              当前登录令牌里没有可用的 organizationId / orgId / tenantId 信息，暂时无法加载组织自治策略。
            </p>
          </div>
        </div>
      </section>
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
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="organization-autonomy-policy-page">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">组织自治策略</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">加载组织自治策略中…</p>
        </div>
      </div>
    )
  }

  if (isError || !policy) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="organization-autonomy-policy-page">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">组织自治策略</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            在组织级别约束 LLM Agent 的自治上限，并在必要时批量降级现有工作流节点。
          </p>
        </div>

        <div className="rounded-2xl border border-error/40 bg-error/5 p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">加载组织自治策略失败</p>
          <p className="mt-1 text-sm text-error">
            {error instanceof Error ? error.message : '未知错误'}
          </p>
        </div>
      </div>
    )
  }

  const actionsDisabled =
    updateMutation.isPending || previewMutation.isPending || confirmMutation.isPending

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="organization-autonomy-policy-page">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">组织自治策略</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            统一约束组织内 LLM Agent 的自治上限；当策略收紧时，你可以只更新上限，或先预览再确认批量降级现有节点。
          </p>
        </div>
        <div className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          仅 owner 可访问
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <h2 className="text-lg font-semibold">当前组织策略</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              当前自治上限为 <span className="font-medium text-foreground">{getAutonomyModeLabel(policy.autonomyCap)}</span>。
            </p>
             <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
               <span>组织 ID：{policy.organizationId}</span>
               <span>版本：{policy.version}</span>
               <span>更新人：{policy.updatedBy ?? '—'}</span>
               <span>更新时间：{formatTimestamp(policy.updatedAt)}</span>
             </div>
           </div>
          <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
            当前存在 {policy.violationSummary.workflowCount} 个工作流、{policy.violationSummary.nodeCount} 个节点超出组织上限。
          </div>
        </div>

        <div className="mt-5">
          <SummaryStats summary={policy.violationSummary} label="当前超上限" />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">调整自治上限</h2>
          <p className="text-sm text-muted-foreground">
            选择新的组织级自治上限。更严格的上限会阻止更高自治模式继续被采纳。
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <label className="space-y-2 text-sm text-foreground" htmlFor="organization-autonomy-cap-select">
            <span>目标自治上限</span>
            <Select
              id="organization-autonomy-cap-select"
              aria-label="目标自治上限"
              value={draftCap}
              onValueChange={handleDraftCapChange}
            >
              {AUTONOMY_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="text-sm font-medium text-foreground">{getAutonomyModeLabel(draftCap)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{selectedModeDescription}</p>
          </div>
        </div>

        {isTightening ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            这次变更会收紧组织自治上限。你可以直接“仅更新策略”，只阻断后续更高自治建议；也可以先预览，再确认批量降级当前已超上限的节点。
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={handleSavePolicyOnly} disabled={!isDirty || actionsDisabled}>
            {isTightening ? '仅更新策略' : '保存策略'}
          </Button>

          {isTightening ? (
            <Button
              type="button"
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
              variant="outline"
              onClick={handleConfirmDowngrade}
              disabled={actionsDisabled}
            >
              确认批量降级并更新策略
            </Button>
          ) : null}
        </div>
      </section>

      {previewResult ? (
        <section
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
          data-testid="organization-autonomy-policy-preview"
        >
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">批量降级预览</h2>
            <p className="text-sm text-muted-foreground">
              预览目标上限为 {getAutonomyModeLabel(previewResult.autonomyCap)}。确认后，以下节点会被批量调整到允许的自治模式。
            </p>
          </div>

          <div className="mt-5">
            <SummaryStats summary={previewResult.violationSummary} label="预估受影响" />
          </div>

          <div className="mt-5">
            <ViolationList violations={previewResult.violations} />
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function OrganizationAutonomyPolicyPage() {
  const authToken = useAuthToken()
  const currentUserRole = getOrganizationAutonomyPolicyRoleFromToken(authToken)
  const organizationId = getOrganizationIdFromToken(authToken)

  if (!canManageOrganizationAutonomyPolicy(currentUserRole)) {
    return (
      <OrganizationAutonomyPolicyForbiddenState
        authToken={authToken}
        role={currentUserRole}
      />
    )
  }

  if (!organizationId) {
    return <OrganizationAutonomyPolicyMissingOrgState />
  }

  return <OrganizationAutonomyPolicyContent organizationId={organizationId} />
}
