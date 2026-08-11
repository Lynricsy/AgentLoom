import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  Gauge,
  OctagonAlert,
  PauseCircle,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { useAuthToken } from '@/features/execution'
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/DataTable'
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
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'
import {
  useResourceGovernance,
  useTerminateGovernedExecution,
  useUpdateExecutionGovernanceControls,
  useUpdateTenantQuota,
} from '../hooks/useResourceGovernance'
import {
  canManageResourceGovernance,
  getResourceGovernanceOrganizationIdFromToken,
  getResourceGovernanceRoleFromToken,
  getResourceGovernanceTenantIdFromToken,
} from '../lib/resourceGovernancePermissions'
import type {
  ExecutionGovernanceState,
  GovernancePauseState,
  ResourceGovernanceActionResponse,
  ResourceGovernanceState,
  TerminateExecutionResponse,
  UpdateExecutionGovernanceControlsInput,
  UpdateTenantQuotaInput,
} from '../types/resourceGovernance'

const GOVERNANCE_STATUSES: Array<{
  value: ExecutionGovernanceState
  label: string
  description: string
}> = [
  {
    value: 'active',
    label: 'active（放行新执行）',
    description: '允许新的执行继续进入，不影响现有执行的运行状态。',
  },
  {
    value: 'paused',
    label: 'paused（治理暂停）',
    description: '阻止新的执行进入，但不会把已经运行中的执行标记成 paused。',
  },
]

type QuotaDraftKey = keyof UpdateTenantQuotaInput

interface QuotaFieldConfig {
  key: QuotaDraftKey
  label: string
  description: string
  placeholder: string
  required?: boolean
  min?: number
  max?: number
}

const QUOTA_FIELD_CONFIGS: QuotaFieldConfig[] = [
  {
    key: 'maxConcurrentExecutions',
    label: '最大并发执行数',
    description: '限制同一租户可同时进入执行队列的任务数。',
    placeholder: '留空表示不限制',
    min: 1,
  },
  {
    key: 'dailyExecutionLimit',
    label: '每日执行额度',
    description: '限制每天可发起的新执行数量。',
    placeholder: '留空表示不限制',
    min: 1,
  },
  {
    key: 'dailyApiCallLimit',
    label: '每日 API 调用额度',
    description: '限制每天可触发的外部 API 调用总量。',
    placeholder: '留空表示不限制',
    min: 1,
  },
  {
    key: 'storageQuotaMb',
    label: '存储配额（MB）',
    description: '限制租户可用的存储空间。',
    placeholder: '留空表示不限制',
    min: 1,
  },
  {
    key: 'apiRateLimitPerMinute',
    label: 'API 每分钟限流',
    description: '每分钟内允许的 API 请求上限，必须大于 0。',
    placeholder: '例如 120',
    required: true,
    min: 1,
  },
  {
    key: 'maxSandboxCpuPercent',
    label: '沙箱 CPU 上限（%）',
    description: '控制沙箱任务可用的 CPU 百分比，范围为 1 到 100。',
    placeholder: '留空表示不限制',
    min: 1,
    max: 100,
  },
  {
    key: 'maxSandboxMemoryMb',
    label: '沙箱内存上限（MB）',
    description: '限制单次沙箱执行可用的内存上限。',
    placeholder: '留空表示不限制',
    min: 1,
  },
]

interface QuotaDraft {
  maxConcurrentExecutions: string
  dailyExecutionLimit: string
  dailyApiCallLimit: string
  storageQuotaMb: string
  apiRateLimitPerMinute: string
  maxSandboxCpuPercent: string
  maxSandboxMemoryMb: string
}

interface WorkflowControlDraft {
  draftId: string
  targetId: string
  status: ExecutionGovernanceState
  reason: string
}

interface ActionSummaryCardProps {
  testId: string
  title: string
  action: ResourceGovernanceActionResponse | TerminateExecutionResponse
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PAGE_DESCRIPTION =
  '管理租户的执行配额、治理暂停与异常执行终止。这里的治理暂停只会阻止新的执行进入，不等同于执行中的 paused 状态。'

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

function getGovernanceStatusLabel(status: ExecutionGovernanceState): string {
  return status === 'paused' ? '治理暂停' : '治理放行'
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `resource-governance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatNullableNumber(value: number | null): string {
  return value == null ? '' : String(value)
}

function createQuotaDraft(state: ResourceGovernanceState): QuotaDraft {
  return {
    maxConcurrentExecutions: formatNullableNumber(state.quota.maxConcurrentExecutions),
    dailyExecutionLimit: formatNullableNumber(state.quota.dailyExecutionLimit),
    dailyApiCallLimit: formatNullableNumber(state.quota.dailyApiCallLimit),
    storageQuotaMb: formatNullableNumber(state.quota.storageQuotaMb),
    apiRateLimitPerMinute: String(state.quota.apiRateLimitPerMinute),
    maxSandboxCpuPercent: formatNullableNumber(state.quota.maxSandboxCpuPercent),
    maxSandboxMemoryMb: formatNullableNumber(state.quota.maxSandboxMemoryMb),
  }
}

function createWorkflowControlDraft(control?: GovernancePauseState): WorkflowControlDraft {
  return {
    draftId: createDraftId(),
    targetId: control?.targetId ?? '',
    status: control?.status ?? 'active',
    reason: control?.reason ?? '',
  }
}

function normalizeReason(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function validateIntegerValue(
  rawValue: string,
  label: string,
  options: { required?: boolean; min?: number; max?: number },
): number | null {
  const trimmed = rawValue.trim()

  if (trimmed.length === 0) {
    if (options.required) {
      throw new Error(`${label}不能为空。`)
    }

    return null
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label}必须填写整数。`)
  }

  const value = Number(trimmed)

  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label}超出允许范围。`)
  }

  if (options.min != null && value < options.min) {
    throw new Error(`${label}不能小于 ${options.min}。`)
  }

  if (options.max != null && value > options.max) {
    throw new Error(`${label}不能大于 ${options.max}。`)
  }

  return value
}

function GovernanceStatusBadge({ status }: { status: ExecutionGovernanceState }) {
  return (
    <Badge variant={status === 'paused' ? 'warning' : 'success'} size="sm">
      {getGovernanceStatusLabel(status)}
    </Badge>
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

function ActionSummaryCard({ testId, title, action }: ActionSummaryCardProps) {
  return (
    <div
      className="rounded-card border border-border bg-surface-elevated p-4"
      data-testid={testId}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-[11px] text-muted">
            操作人：{action.operator ?? '—'} · 生效时间：{formatTimestamp(action.effectedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" size="sm">
            动作：{action.action}
          </Badge>
          <Badge variant="secondary" size="sm">
            范围：{action.scope}
          </Badge>
          <Badge variant="secondary" size="sm">
            影响：{action.affectedSummary.affected}
          </Badge>
        </div>
      </div>

      {action.reason ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">原因：{action.reason}</p>
      ) : null}

      {'execution' in action ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetaTile label="执行 ID" value={action.execution.id} />
          <MetaTile label="工作流 ID" value={action.execution.workflowId} />
          <MetaTile label="最终状态" value={action.execution.status} />
          <MetaTile
            label="时间线链接"
            value={<span className="text-muted">{action.execution.timelineUrl}</span>}
          />
        </div>
      ) : null}
    </div>
  )
}

function ResourceGovernanceBlockedState({
  testId,
  icon: Icon,
  title,
  message,
}: {
  testId: string
  icon: typeof ShieldAlert
  title: string
  message: string
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid={testId}>
      <PageHeader icon={Gauge} title="资源治理" description={PAGE_DESCRIPTION} />

      <Card className="border-warning/30">
        <CardContent className="flex items-start gap-3 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-warning/10 text-warning">
            <Icon className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs leading-relaxed text-muted">{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ResourceGovernanceContent({
  organizationId,
  tenantClaimId,
}: {
  organizationId: string
  tenantClaimId: string | null
}) {
  const { notify } = useToast()
  const {
    data: state,
    isLoading,
    isError,
    error,
  } = useResourceGovernance(organizationId)
  const quotaMutation = useUpdateTenantQuota(organizationId)
  const controlsMutation = useUpdateExecutionGovernanceControls(organizationId)
  const terminateMutation = useTerminateGovernedExecution(organizationId)

  const [quotaDraft, setQuotaDraft] = useState<QuotaDraft>({
    maxConcurrentExecutions: '',
    dailyExecutionLimit: '',
    dailyApiCallLimit: '',
    storageQuotaMb: '',
    apiRateLimitPerMinute: '',
    maxSandboxCpuPercent: '',
    maxSandboxMemoryMb: '',
  })
  const [tenantStatus, setTenantStatus] = useState<ExecutionGovernanceState>('active')
  const [tenantReason, setTenantReason] = useState('')
  const [workflowDrafts, setWorkflowDrafts] = useState<WorkflowControlDraft[]>([])
  const [executionId, setExecutionId] = useState('')
  const [terminationReason, setTerminationReason] = useState('')
  const [governanceActionResult, setGovernanceActionResult] =
    useState<ResourceGovernanceActionResponse | null>(null)
  const [terminationResult, setTerminationResult] =
    useState<TerminateExecutionResponse | null>(null)
  const lastStateSyncRef = useRef<string | null>(null)

  useEffect(() => {
    if (!state) {
      return
    }

    const nextSyncKey = [
      state.organizationId,
      state.quota.version,
      state.governance.version,
      state.governance.tenantControl.updatedAt ?? 'none',
    ].join(':')

    if (lastStateSyncRef.current === nextSyncKey) {
      return
    }

    lastStateSyncRef.current = nextSyncKey
    setQuotaDraft(createQuotaDraft(state))
    setTenantStatus(state.governance.tenantControl.status)
    setTenantReason(state.governance.tenantControl.reason ?? '')
    setWorkflowDrafts(
      state.governance.workflowControls.length > 0
        ? state.governance.workflowControls.map((control) => createWorkflowControlDraft(control))
        : [createWorkflowControlDraft()],
    )
  }, [state])

  const resolvedTenantId = tenantClaimId ?? state?.quota.tenantId ?? '—'
  const actionsDisabled =
    quotaMutation.isPending || controlsMutation.isPending || terminateMutation.isPending

  const workflowControlCount = state?.governance.workflowControls.length ?? 0
  const pausedWorkflowCount =
    state?.governance.workflowControls.filter((control) => control.status === 'paused').length ?? 0

  const tenantStatusDescription = useMemo(
    () => GOVERNANCE_STATUSES.find((option) => option.value === tenantStatus)?.description ?? '',
    [tenantStatus],
  )

  const quotaColumns = useMemo<DataTableColumn<QuotaFieldConfig>[]>(
    () => [
      {
        key: 'label',
        header: '配额项',
        className: 'align-top',
        cell: (field) => (
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-foreground">{field.label}</p>
            <p className="text-[11px] leading-relaxed text-muted">{field.description}</p>
          </div>
        ),
      },
      {
        key: 'current',
        header: '当前值',
        className: 'w-24 align-top',
        hideBelow: 'sm',
        cell: (field) => {
          const current = state?.quota[field.key] ?? null

          return (
            <span className="text-xs tabular-nums text-muted">
              {current == null ? '未限制' : current}
            </span>
          )
        },
      },
      {
        key: 'draft',
        header: '新值',
        className: 'w-[12rem] align-top',
        cell: (field) => (
          <Input
            id={`resource-governance-quota-${field.key}`}
            type="number"
            min={field.min}
            max={field.max}
            step="1"
            value={quotaDraft[field.key]}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setQuotaDraft((current) => ({ ...current, [field.key]: event.target.value }))
            }
            aria-label={field.label}
            placeholder={field.placeholder}
          />
        ),
      },
    ],
    [quotaDraft, state],
  )

  function handleAddWorkflowDraft() {
    setWorkflowDrafts((current) => [...current, createWorkflowControlDraft()])
  }

  function handleRemoveWorkflowDraft(draftId: string) {
    setWorkflowDrafts((current) => {
      const nextDrafts = current.filter((draft) => draft.draftId !== draftId)
      return nextDrafts.length > 0 ? nextDrafts : [createWorkflowControlDraft()]
    })
  }

  function handleUpdateWorkflowDraft(
    draftId: string,
    field: keyof Omit<WorkflowControlDraft, 'draftId'>,
    value: string,
  ) {
    setWorkflowDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId ? { ...draft, [field]: value } : draft,
      ),
    )
  }

  function handleSubmitQuota() {
    try {
      const nextQuota: UpdateTenantQuotaInput = {
        maxConcurrentExecutions: validateIntegerValue(
          quotaDraft.maxConcurrentExecutions,
          '最大并发执行数',
          { min: 1 },
        ),
        dailyExecutionLimit: validateIntegerValue(quotaDraft.dailyExecutionLimit, '每日执行额度', {
          min: 1,
        }),
        dailyApiCallLimit: validateIntegerValue(
          quotaDraft.dailyApiCallLimit,
          '每日 API 调用额度',
          { min: 1 },
        ),
        storageQuotaMb: validateIntegerValue(quotaDraft.storageQuotaMb, '存储配额（MB）', {
          min: 1,
        }),
        apiRateLimitPerMinute:
          validateIntegerValue(quotaDraft.apiRateLimitPerMinute, 'API 每分钟限流', {
            required: true,
            min: 1,
          }) ?? undefined,
        maxSandboxCpuPercent: validateIntegerValue(
          quotaDraft.maxSandboxCpuPercent,
          '沙箱 CPU 上限（%）',
          { min: 1, max: 100 },
        ),
        maxSandboxMemoryMb: validateIntegerValue(quotaDraft.maxSandboxMemoryMb, '沙箱内存上限（MB）', {
          min: 1,
        }),
      }

      quotaMutation.mutate(nextQuota, {
        onSuccess: (nextQuotaState) => {
          setQuotaDraft((current) => ({
            ...current,
            maxConcurrentExecutions: formatNullableNumber(nextQuotaState.maxConcurrentExecutions),
            dailyExecutionLimit: formatNullableNumber(nextQuotaState.dailyExecutionLimit),
            dailyApiCallLimit: formatNullableNumber(nextQuotaState.dailyApiCallLimit),
            storageQuotaMb: formatNullableNumber(nextQuotaState.storageQuotaMb),
            apiRateLimitPerMinute: String(nextQuotaState.apiRateLimitPerMinute),
            maxSandboxCpuPercent: formatNullableNumber(nextQuotaState.maxSandboxCpuPercent),
            maxSandboxMemoryMb: formatNullableNumber(nextQuotaState.maxSandboxMemoryMb),
          }))
          notify({
            title: '资源配额已更新',
            description: '新的资源配额已提交，并会在详情查询刷新后反映到当前页面。',
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '更新资源配额失败',
            description: '请检查输入值后重试。',
            variant: 'error',
          })
        },
      })
    } catch (validationError) {
      notify({
        title: '配额参数不合法',
        description:
          validationError instanceof Error ? validationError.message : '请输入合法的整数配额。',
        variant: 'warning',
      })
    }
  }

  function buildControlsPayload(): UpdateExecutionGovernanceControlsInput {
    const normalizedWorkflowControls = workflowDrafts
      .map((draft) => ({
        scope: 'workflow' as const,
        targetId: draft.targetId.trim(),
        status: draft.status,
        reason: normalizeReason(draft.reason),
      }))
      .filter((draft) => draft.targetId.length > 0)

    for (const draft of normalizedWorkflowControls) {
      if (!UUID_PATTERN.test(draft.targetId)) {
        throw new Error(`工作流目标 ID ${draft.targetId} 不是合法的 UUID。`)
      }
    }

    return {
      tenantControl: {
        status: tenantStatus,
        reason: normalizeReason(tenantReason),
      },
      workflowControls: normalizedWorkflowControls,
    }
  }

  function handleSubmitControls() {
    try {
      const payload = buildControlsPayload()

      controlsMutation.mutate(payload, {
        onSuccess: (result) => {
          setGovernanceActionResult(result)
          notify({
            title: '治理控制已更新',
            description: `当前共影响 ${result.affectedSummary.affected} 个治理目标。`,
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '更新治理控制失败',
            description: '请确认工作流目标 ID 和治理原因后重试。',
            variant: 'error',
          })
        },
      })
    } catch (validationError) {
      notify({
        title: '治理控制参数不合法',
        description:
          validationError instanceof Error
            ? validationError.message
            : '请检查工作流目标 ID 是否合法。',
        variant: 'warning',
      })
    }
  }

  function handleTerminateExecution() {
    const normalizedExecutionId = executionId.trim()
    const normalizedReason = terminationReason.trim()

    if (!normalizedExecutionId) {
      notify({
        title: '缺少执行 ID',
        description: '请输入需要终止的异常执行 ID。',
        variant: 'warning',
      })
      return
    }

    if (!normalizedReason) {
      notify({
        title: '缺少终止原因',
        description: '请填写终止异常执行的原因。',
        variant: 'warning',
      })
      return
    }

    terminateMutation.mutate(
      {
        executionId: normalizedExecutionId,
        reason: normalizedReason,
      },
      {
        onSuccess: (result) => {
          setTerminationResult(result)
          setExecutionId('')
          setTerminationReason('')
          notify({
            title: '异常执行已终止',
            description: `执行 ${result.execution.id} 已进入 ${result.execution.status}。`,
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '终止异常执行失败',
            description: '请确认 execution ID 与终止原因后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="resource-governance-page">
        <PageHeader icon={Gauge} title="资源治理" description="加载资源治理设置中…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-card" />
      </div>
    )
  }

  if (isError || !state) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="resource-governance-page">
        <PageHeader icon={Gauge} title="资源治理" description={PAGE_DESCRIPTION} />

        <Card className="border-error/40">
          <CardContent className="space-y-1 p-5">
            <p className="text-sm font-medium text-foreground">加载资源治理设置失败</p>
            <p className="text-xs font-medium text-error">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="resource-governance-page">
      <PageHeader
        icon={Gauge}
        title="资源治理"
        description="统一查看并调整组织的执行配额、治理暂停控制和异常执行终止能力。治理暂停只会阻止新的执行进入，不会把已在运行中的执行改成 paused。"
        actions={<Badge variant="secondary">仅 owner / admin 可访问</Badge>}
      />

      <Card data-testid="resource-governance-metadata">
        <CardHeader>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <PauseCircle className="h-4 w-4" />
                <CardTitle>当前组织状态</CardTitle>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                这里展示后端返回的当前资源治理状态。租户级治理状态为{' '}
                <span className="font-medium text-foreground">
                  {getGovernanceStatusLabel(state.governance.tenantControl.status)}
                </span>
                。
              </p>
            </div>
            <GovernanceStatusBadge status={state.governance.tenantControl.status} />
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetaTile label="组织 ID" value={state.organizationId} />
            <MetaTile label="租户 ID" value={resolvedTenantId} />
            <MetaTile label="配额版本" value={state.quota.version} />
            <MetaTile label="治理版本" value={state.governance.version} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>配额更新人：{state.quota.updatedBy ?? '—'}</span>
            <span>配额更新时间：{formatTimestamp(state.quota.updatedAt)}</span>
            <span>治理更新人：{state.governance.tenantControl.updatedBy ?? '—'}</span>
            <span>治理更新时间：{formatTimestamp(state.governance.tenantControl.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="resource-governance-quota-form">
        <CardHeader>
          <CardTitle>资源配额</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            配额会直接影响新的执行请求、API 调用和沙箱容量。除 API 每分钟限流外，其余字段留空表示不设置额外上限。
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <DataTable
            columns={quotaColumns}
            data={QUOTA_FIELD_CONFIGS}
            rowKey={(field) => field.key}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitQuota}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {quotaMutation.isPending ? <Spinner size="sm" /> : null}
              保存配额
            </Button>
            <span className="text-xs text-muted">
              当前 API 每分钟限流：{state.quota.apiRateLimitPerMinute}，沙箱 CPU 上限：
              {state.quota.maxSandboxCpuPercent ?? '未限制'}。
            </span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="resource-governance-controls-form">
        <CardHeader>
          <CardTitle>治理暂停控制</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            治理暂停只会阻止新的执行进入，不会把已经运行中的执行改成 paused。若需要解除某个治理暂停，请把状态切回 active。
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-card border border-border bg-surface-elevated p-4">
              <p className="text-xs font-semibold text-foreground">当前租户总控</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <GovernanceStatusBadge status={state.governance.tenantControl.status} />
                <span className="text-[11px] text-muted">
                  更新时间：{formatTimestamp(state.governance.tenantControl.updatedAt)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                原因：{state.governance.tenantControl.reason ?? '未填写治理原因'}
              </p>
            </div>

            <div className="rounded-card border border-border bg-surface-elevated p-4">
              <p className="text-xs font-semibold text-foreground">工作流级治理目标</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" size="sm">
                  总数：{workflowControlCount}
                </Badge>
                <Badge variant="warning" size="sm">
                  治理暂停：{pausedWorkflowCount}
                </Badge>
                <Badge variant="success" size="sm">
                  治理放行：{workflowControlCount - pausedWorkflowCount}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                当前租户治理状态不影响已在运行中的执行，只决定新执行是否允许进入。
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="rounded-card border border-border bg-surface-elevated p-4">
              <p className="text-xs font-semibold text-foreground">租户总控编辑</p>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-medium text-muted"
                    htmlFor="resource-governance-tenant-status"
                  >
                    租户治理状态
                  </label>
                  <Select
                    value={tenantStatus}
                    onValueChange={(value) => setTenantStatus(value as ExecutionGovernanceState)}
                  >
                    <SelectTrigger
                      id="resource-governance-tenant-status"
                      aria-label="租户治理状态"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOVERNANCE_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <p className="rounded-card border border-border bg-surface p-2.5 text-[11px] leading-relaxed text-muted">
                  {tenantStatusDescription}
                </p>

                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-medium text-muted"
                    htmlFor="resource-governance-tenant-reason"
                  >
                    租户治理原因
                  </label>
                  <Textarea
                    id="resource-governance-tenant-reason"
                    value={tenantReason}
                    rows={5}
                    maxLength={500}
                    aria-label="租户治理原因"
                    onChange={(event) => setTenantReason(event.target.value)}
                    placeholder="例如：为缓解高峰期资源抢占，临时阻止新的执行进入。"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-card border border-border bg-surface-elevated p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">工作流治理目标</p>
                  <p className="mt-1 text-[11px] text-muted">
                    可以逐个指定工作流目标的治理状态；新增空白行后填写 UUID 即可提交。
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddWorkflowDraft}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  新增工作流目标
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {workflowDrafts.map((draft, index) => (
                  <div
                    key={draft.draftId}
                    className="rounded-card border border-border bg-surface p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">
                        工作流目标 {index + 1}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveWorkflowDraft(draft.draftId)}
                        aria-label={`移除工作流治理目标 ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
                      <div className="space-y-1.5">
                        <label
                          className="block text-xs font-medium text-muted"
                          htmlFor={`resource-governance-workflow-target-${draft.draftId}`}
                        >
                          工作流目标 ID
                        </label>
                        <Input
                          id={`resource-governance-workflow-target-${draft.draftId}`}
                          value={draft.targetId}
                          aria-label={`工作流目标 ID ${index + 1}`}
                          onChange={(event) =>
                            handleUpdateWorkflowDraft(draft.draftId, 'targetId', event.target.value)
                          }
                          placeholder="填写 workflow UUID"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          className="block text-xs font-medium text-muted"
                          htmlFor={`resource-governance-workflow-status-${draft.draftId}`}
                        >
                          治理状态
                        </label>
                        <Select
                          value={draft.status}
                          onValueChange={(value) =>
                            handleUpdateWorkflowDraft(draft.draftId, 'status', value)
                          }
                        >
                          <SelectTrigger
                            id={`resource-governance-workflow-status-${draft.draftId}`}
                            aria-label={`工作流治理状态 ${index + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GOVERNANCE_STATUSES.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <label
                        className="block text-xs font-medium text-muted"
                        htmlFor={`resource-governance-workflow-reason-${draft.draftId}`}
                      >
                        治理原因
                      </label>
                      <Textarea
                        id={`resource-governance-workflow-reason-${draft.draftId}`}
                        value={draft.reason}
                        rows={3}
                        maxLength={500}
                        aria-label={`工作流治理原因 ${index + 1}`}
                        onChange={(event) =>
                          handleUpdateWorkflowDraft(draft.draftId, 'reason', event.target.value)
                        }
                        placeholder="例如：该工作流近期出现异常流量，先阻止新的执行进入。"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmitControls}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {controlsMutation.isPending ? <Spinner size="sm" /> : null}
              更新治理控制
            </Button>
            <span className="text-xs text-muted">
              若要解除某个治理暂停，请把该目标状态改回 active 并重新提交。
            </span>
          </div>

          {governanceActionResult ? (
            <ActionSummaryCard
              testId="resource-governance-governance-action"
              title="最近一次治理控制更新"
              action={governanceActionResult}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card data-testid="resource-governance-terminate-form">
        <CardHeader>
          <div className="flex items-center gap-2 text-foreground">
            <OctagonAlert className="h-4 w-4" />
            <CardTitle>终止异常执行</CardTitle>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            仅在确认执行异常且需要立即止损时使用。这个动作会直接终止指定执行，不会把治理暂停误写成执行 paused。
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <label
                className="block text-xs font-medium text-muted"
                htmlFor="resource-governance-execution-id"
              >
                异常执行 ID
              </label>
              <Input
                id="resource-governance-execution-id"
                value={executionId}
                aria-label="异常执行 ID"
                onChange={(event) => setExecutionId(event.target.value)}
                placeholder="填写 execution UUID"
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-xs font-medium text-muted"
                htmlFor="resource-governance-termination-reason"
              >
                终止原因
              </label>
              <Textarea
                id="resource-governance-termination-reason"
                value={terminationReason}
                rows={4}
                maxLength={500}
                aria-label="终止原因"
                onChange={(event) => setTerminationReason(event.target.value)}
                placeholder="例如：检测到异常循环调用，先终止该执行以避免继续消耗资源。"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={handleTerminateExecution}
              disabled={actionsDisabled}
              className="gap-2"
            >
              {terminateMutation.isPending ? <Spinner size="sm" /> : null}
              终止异常执行
            </Button>
            <span className="text-xs text-muted">
              建议在填写明确原因后再执行终止，以便后续审计和回溯。
            </span>
          </div>

          {terminationResult ? (
            <ActionSummaryCard
              testId="resource-governance-termination-action"
              title="最近一次异常执行终止结果"
              action={terminationResult}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export function ResourceGovernancePage() {
  const authToken = useAuthToken()
  const currentUserRole = getResourceGovernanceRoleFromToken(authToken)
  const organizationId = getResourceGovernanceOrganizationIdFromToken(authToken)
  const tenantClaimId = getResourceGovernanceTenantIdFromToken(authToken)

  if (!canManageResourceGovernance(currentUserRole)) {
    return (
      <ResourceGovernanceBlockedState
        testId="resource-governance-forbidden"
        icon={ShieldAlert}
        title="无权访问资源治理"
        message={
          !authToken || !currentUserRole
            ? '当前未识别到可管理资源治理的租户身份，请使用 owner 或 admin 角色重新登录。'
            : `当前租户角色为 ${currentUserRole}，只有 owner 或 admin 可以管理资源治理设置。`
        }
      />
    )
  }

  if (!organizationId) {
    return (
      <ResourceGovernanceBlockedState
        testId="resource-governance-missing-org"
        icon={AlertTriangle}
        title="无法识别当前组织"
        message="当前登录令牌里没有可用的 organizationId / orgId / tenantId 信息，暂时无法加载资源治理设置。"
      />
    )
  }

  return <ResourceGovernanceContent organizationId={organizationId} tenantClaimId={tenantClaimId} />
}
