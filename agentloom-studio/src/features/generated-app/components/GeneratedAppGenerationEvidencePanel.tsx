import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/select'
import {
  useGeneratedAppGateRuns,
  useGeneratedAppGenerationRuns,
  useGeneratedAppRepairAttempts,
} from '../api'
import {
  GENERATED_APP_GATE_STATUS_LABELS,
  GENERATED_APP_GENERATION_RUN_STATUS_LABELS,
  GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS,
  GENERATED_APP_REPAIR_ATTEMPT_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppGateStatusBadgeClass,
  getGeneratedAppGenerationRunStatusBadgeClass,
  getGeneratedAppRepairAttemptStatusBadgeClass,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRun,
  GeneratedAppGateRunStatus,
  GeneratedAppGenerationRun,
  GeneratedAppGenerationRunStatus,
  GeneratedAppRepairAttempt,
  GeneratedAppRepairAttemptStatus,
} from '../types'

const PAGE_SIZE = 8
const STATUS_FILTER_ALL = 'all'
const EMPTY_GENERATION_RUNS: GeneratedAppGenerationRun[] = []
const EMPTY_REPAIR_ATTEMPTS: GeneratedAppRepairAttempt[] = []
const EMPTY_GATE_RUNS: GeneratedAppGateRun[] = []

type GenerationRunStatusFilter =
  | typeof STATUS_FILTER_ALL
  | GeneratedAppGenerationRunStatus

const GENERATION_RUN_STATUS_OPTIONS: Array<{
  value: GenerationRunStatusFilter
  label: string
}> = [
  { value: STATUS_FILTER_ALL, label: '全部运行状态' },
  { value: 'queued', label: GENERATED_APP_GENERATION_RUN_STATUS_LABELS.queued },
  {
    value: 'running',
    label: GENERATED_APP_GENERATION_RUN_STATUS_LABELS.running,
  },
  {
    value: 'repairing',
    label: GENERATED_APP_GENERATION_RUN_STATUS_LABELS.repairing,
  },
  { value: 'passed', label: GENERATED_APP_GENERATION_RUN_STATUS_LABELS.passed },
  { value: 'failed', label: GENERATED_APP_GENERATION_RUN_STATUS_LABELS.failed },
  {
    value: 'cancelled',
    label: GENERATED_APP_GENERATION_RUN_STATUS_LABELS.cancelled,
  },
]

interface GeneratedAppGenerationEvidencePanelProps {
  appId: string
}

function InlineErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="break-words text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          重新加载
        </Button>
      </div>
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

function GenerationRunStatusBadge({
  status,
}: {
  status: GeneratedAppGenerationRunStatus
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        getGeneratedAppGenerationRunStatusBadgeClass(status),
      )}
    >
      {GENERATED_APP_GENERATION_RUN_STATUS_LABELS[status]}
    </span>
  )
}

function RepairAttemptStatusBadge({
  status,
}: {
  status: GeneratedAppRepairAttemptStatus
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        getGeneratedAppRepairAttemptStatusBadgeClass(status),
      )}
    >
      {GENERATED_APP_REPAIR_ATTEMPT_STATUS_LABELS[status]}
    </span>
  )
}

function GateRunStatusBadge({ status }: { status: GeneratedAppGateRunStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        getGeneratedAppGateStatusBadgeClass(status),
      )}
    >
      {GENERATED_APP_GATE_STATUS_LABELS[status]}
    </span>
  )
}

function SummaryText({ children }: { children: string }) {
  return (
    <span className="line-clamp-2 min-w-0 break-words text-xs text-muted-foreground">
      {children}
    </span>
  )
}

function isAutomaticNoPatchRepairAttempt(
  attempt: GeneratedAppRepairAttempt,
): boolean {
  const summaryText = [
    attempt.failureSummary,
    attempt.changeSummary,
    attempt.verificationSummary,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    attempt.status === 'failed' &&
    summaryText.includes('同步 runner') &&
    summaryText.includes('未应用') &&
    summaryText.includes('补丁')
  )
}

function AutomaticRepairAttemptNotice({
  attempt,
}: {
  attempt: GeneratedAppRepairAttempt
}) {
  if (!isAutomaticNoPatchRepairAttempt(attempt)) {
    return null
  }

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <p className="font-medium text-amber-200">已定位失败 Gate，尚未应用补丁</p>
      <p className="mt-1 break-words text-muted-foreground">
        自动修复循环已把 {attempt.targetGateId}{' '}
        标记为下一轮修复目标；当前同步 runner 未修改源码、Workflow
        或插件，重新运行前仍需要完成对应修复。
      </p>
    </div>
  )
}

function EvidenceSummaryList({
  evidence,
}: {
  evidence: GeneratedAppGateEvidence[]
}) {
  if (evidence.length === 0) {
    return <span className="text-xs text-muted-foreground">暂无证据</span>
  }

  const visibleEvidence = evidence.slice(0, 3)
  const hiddenCount = evidence.length - visibleEvidence.length

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium text-foreground">
        {evidence.length} 条证据
      </p>
      <ul className="space-y-1">
        {visibleEvidence.map((item, index) => (
          <li key={`${item.id}-${index}`} className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {item.kind}
              </code>
              <span className="break-words text-xs font-medium text-foreground">
                {item.label}
              </span>
            </div>
            <p className="line-clamp-2 break-words text-xs text-muted-foreground">
              {item.summary}
            </p>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          另有 {hiddenCount} 条证据摘要未展开
        </p>
      ) : null}
    </div>
  )
}

function FailureSummary({ gateRun }: { gateRun: GeneratedAppGateRun }) {
  if (!gateRun.failure && !gateRun.repairInstructions) {
    return <SummaryText>暂无</SummaryText>
  }

  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
      {gateRun.failure ? (
        <p className="break-words">
          {gateRun.failure.code ? `${gateRun.failure.code}: ` : ''}
          {gateRun.failure.message}
        </p>
      ) : null}
      {gateRun.repairInstructions ? (
        <p className="break-words">修复建议：{gateRun.repairInstructions}</p>
      ) : null}
    </div>
  )
}

function formatBudget(run: GeneratedAppGenerationRun): string {
  return `${run.maxRepairAttempts} 次修复 / ${run.maxRuntimeSeconds}s`
}

export function GeneratedAppGenerationEvidencePanel({
  appId,
}: GeneratedAppGenerationEvidencePanelProps) {
  const [runPage, setRunPage] = useState(1)
  const [repairPage, setRepairPage] = useState(1)
  const [gatePage, setGatePage] = useState(1)
  const [runStatusFilter, setRunStatusFilter] =
    useState<GenerationRunStatusFilter>(STATUS_FILTER_ALL)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRepairAttemptId, setSelectedRepairAttemptId] = useState<
    string | null
  >(null)

  const generationRunParams = useMemo(
    () => ({
      page: runPage,
      pageSize: PAGE_SIZE,
      status:
        runStatusFilter === STATUS_FILTER_ALL
          ? undefined
          : (runStatusFilter as GeneratedAppGenerationRunStatus),
    }),
    [runPage, runStatusFilter],
  )

  const repairAttemptParams = useMemo(
    () => ({
      page: repairPage,
      pageSize: PAGE_SIZE,
    }),
    [repairPage],
  )

  const gateRunParams = useMemo(
    () => ({
      page: gatePage,
      pageSize: PAGE_SIZE,
      generationRunId: selectedRunId ?? undefined,
      repairAttemptId: selectedRepairAttemptId ?? undefined,
    }),
    [gatePage, selectedRepairAttemptId, selectedRunId],
  )

  const generationRunsQuery = useGeneratedAppGenerationRuns(
    appId,
    generationRunParams,
  )
  const repairAttemptsQuery = useGeneratedAppRepairAttempts(
    selectedRunId ? appId : undefined,
    selectedRunId ?? undefined,
    repairAttemptParams,
  )
  const gateRunsQuery = useGeneratedAppGateRuns(
    selectedRunId ? appId : undefined,
    gateRunParams,
  )

  const generationRuns = generationRunsQuery.data?.data ?? EMPTY_GENERATION_RUNS
  const rawRepairAttempts =
    repairAttemptsQuery.data?.data ?? EMPTY_REPAIR_ATTEMPTS
  const repairAttempts = selectedRunId
    ? rawRepairAttempts.filter(
        (attempt) => attempt.generationRunId === selectedRunId,
      )
    : EMPTY_REPAIR_ATTEMPTS
  const rawGateRuns = gateRunsQuery.data?.data ?? EMPTY_GATE_RUNS
  const gateRuns = selectedRunId
    ? rawGateRuns.filter((gateRun) => {
        if (gateRun.generationRunId !== selectedRunId) {
          return false
        }

        if (selectedRepairAttemptId) {
          return gateRun.repairAttemptId === selectedRepairAttemptId
        }

        return true
      })
    : EMPTY_GATE_RUNS
  const generationRunMeta = generationRunsQuery.data?.meta
  const repairAttemptMeta = repairAttemptsQuery.data?.meta
  const gateRunMeta = gateRunsQuery.data?.meta

  const selectedRun = useMemo(
    () => generationRuns.find((run) => run.id === selectedRunId) ?? null,
    [generationRuns, selectedRunId],
  )
  const selectedRepairAttempt = useMemo(
    () =>
      repairAttempts.find(
        (attempt) => attempt.id === selectedRepairAttemptId,
      ) ?? null,
    [repairAttempts, selectedRepairAttemptId],
  )

  useEffect(() => {
    if (generationRuns.length === 0) {
      if (selectedRunId !== null) {
        setSelectedRunId(null)
      }
      if (selectedRepairAttemptId !== null) {
        setSelectedRepairAttemptId(null)
      }
      return
    }

    const selectedRunStillVisible =
      selectedRunId !== null &&
      generationRuns.some((run) => run.id === selectedRunId)

    if (selectedRunId !== null && !selectedRunStillVisible) {
      setSelectedRunId(null)
      setSelectedRepairAttemptId(null)
      setRepairPage(1)
      setGatePage(1)
    }
  }, [generationRuns, selectedRepairAttemptId, selectedRunId])

  useEffect(() => {
    if (!selectedRepairAttemptId) return

    const repairAttemptStillVisible = repairAttempts.some(
      (attempt) => attempt.id === selectedRepairAttemptId,
    )

    if (!repairAttemptStillVisible) {
      setSelectedRepairAttemptId(null)
      setGatePage(1)
    }
  }, [repairAttempts, selectedRepairAttemptId])

  const handleRunStatusFilterChange = useCallback((value: string) => {
    setRunStatusFilter(value as GenerationRunStatusFilter)
    setRunPage(1)
    setRepairPage(1)
    setGatePage(1)
    setSelectedRunId(null)
    setSelectedRepairAttemptId(null)
  }, [])

  const handleSelectRun = useCallback((runId: string) => {
    setSelectedRunId(runId)
    setSelectedRepairAttemptId(null)
    setRepairPage(1)
    setGatePage(1)
  }, [])

  const handleSelectRepairAttempt = useCallback((repairAttemptId: string) => {
    setSelectedRepairAttemptId((current) =>
      current === repairAttemptId ? null : repairAttemptId,
    )
    setGatePage(1)
  }, [])

  const gateScopeText = selectedRepairAttempt
    ? `已按 Run #${selectedRun?.runNumber ?? '-'} / Repair #${
        selectedRepairAttempt.attemptNumber
      } 自动过滤`
    : selectedRun
      ? `已按 Run #${selectedRun.runNumber} 自动过滤`
      : '选择 generation run 后查看对应 Gate run 证据'

  return (
    <div
      className="space-y-6"
      data-testid="generated-app-generation-evidence-panel"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              共 {generationRunMeta?.total ?? generationRuns.length} 次生成运行
            </p>
            <p className="text-xs text-muted-foreground">
              运行记录只展示创建者侧自动开发、预算、失败摘要和时间线；公开 token
              不在此处展示。
            </p>
          </div>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>运行状态</span>
            <Select
              value={runStatusFilter}
              onValueChange={handleRunStatusFilterChange}
              aria-label="生成运行状态筛选"
              className="min-w-44"
            >
              {GENERATION_RUN_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {generationRunsQuery.isLoading ? (
          <LoadingState label="正在加载生成运行记录..." />
        ) : generationRunsQuery.isError ? (
          <InlineErrorState
            title="生成运行记录加载失败"
            description="请稍后重试，或刷新页面后重新查看。"
            onRetry={() => void generationRunsQuery.refetch()}
          />
        ) : generationRuns.length === 0 ? (
          <EmptyState
            title="暂无生成运行记录"
            description="自动开发测试循环写入 generation run 后，会在这里展示运行状态、预算、摘要和失败原因。"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Run
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      状态
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      触发来源
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      预算
                    </th>
                    <th className="min-w-72 px-3 py-2 font-medium">摘要</th>
                    <th className="min-w-56 px-3 py-2 font-medium">失败原因</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Started
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Completed
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {generationRuns.map((run) => (
                    <tr
                      key={run.id}
                      className={cn(
                        'align-top',
                        selectedRunId === run.id
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30',
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Run #{run.runNumber}
                          </p>
                          <code className="text-xs text-muted-foreground">
                            {run.id}
                          </code>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <GenerationRunStatusBadge status={run.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {
                          GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS[
                            run.triggerSource
                          ]
                        }
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {formatBudget(run)}
                      </td>
                      <td className="px-3 py-3">
                        <SummaryText>{run.summary}</SummaryText>
                      </td>
                      <td className="px-3 py-3">
                        <SummaryText>
                          {run.failureReason?.trim() || '暂无'}
                        </SummaryText>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {formatGeneratedAppDateTime(run.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {formatGeneratedAppDateTime(run.completedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-pressed={selectedRunId === run.id}
                          onClick={() => handleSelectRun(run.id)}
                        >
                          {selectedRunId === run.id
                            ? `当前 Run #${run.runNumber}`
                            : `选择 Run #${run.runNumber}`}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {generationRunMeta && generationRunMeta.totalPages > 1 ? (
              <Pagination
                page={runPage}
                totalPages={generationRunMeta.totalPages}
                onPageChange={setRunPage}
                isLoading={generationRunsQuery.isFetching}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-3 flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Repair attempts
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedRun
                ? `当前选中 Run #${selectedRun.runNumber}，共 ${
                    repairAttemptMeta?.total ?? repairAttempts.length
                  } 次修复尝试。`
                : '选择 generation run 后查看对应修复尝试。'}
            </p>
          </div>
        </div>

        {!selectedRun ? (
          <p className="text-sm text-muted-foreground">
            尚未选中 generation run。
          </p>
        ) : repairAttemptsQuery.isLoading ? (
          <LoadingState label="正在加载修复尝试..." />
        ) : repairAttemptsQuery.isError ? (
          <InlineErrorState
            title="修复尝试加载失败"
            description="请稍后重试，或重新选择 generation run。"
            onRetry={() => void repairAttemptsQuery.refetch()}
          />
        ) : repairAttempts.length === 0 ? (
          <EmptyState
            title="暂无修复尝试"
            description="Repair loop 写入失败摘要、变更摘要和再验证摘要后，会按所选 generation run 展示。"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Attempt
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Target gate
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      状态
                    </th>
                    <th className="min-w-64 px-3 py-2 font-medium">失败摘要</th>
                    <th className="min-w-64 px-3 py-2 font-medium">变更摘要</th>
                    <th className="min-w-64 px-3 py-2 font-medium">
                      再验证摘要
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {repairAttempts.map((attempt) => (
                    <tr
                      key={attempt.id}
                      className={cn(
                        'align-top',
                        selectedRepairAttemptId === attempt.id
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30',
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Repair #{attempt.attemptNumber}
                          </p>
                          <code className="text-xs text-muted-foreground">
                            {attempt.id}
                          </code>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {attempt.targetGateId}
                        </code>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <RepairAttemptStatusBadge status={attempt.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-0 space-y-2">
                          <AutomaticRepairAttemptNotice attempt={attempt} />
                          <SummaryText>{attempt.failureSummary}</SummaryText>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <SummaryText>
                          {attempt.changeSummary?.trim() || '暂无'}
                        </SummaryText>
                      </td>
                      <td className="px-3 py-3">
                        <SummaryText>
                          {attempt.verificationSummary?.trim() || '暂无'}
                        </SummaryText>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-pressed={selectedRepairAttemptId === attempt.id}
                          onClick={() => handleSelectRepairAttempt(attempt.id)}
                        >
                          {selectedRepairAttemptId === attempt.id
                            ? '取消过滤'
                            : `过滤 Repair #${attempt.attemptNumber}`}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {repairAttemptMeta && repairAttemptMeta.totalPages > 1 ? (
              <Pagination
                page={repairPage}
                totalPages={repairAttemptMeta.totalPages}
                onPageChange={setRepairPage}
                isLoading={repairAttemptsQuery.isFetching}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-3 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Gate run evidence
          </h3>
          <p className="text-xs text-muted-foreground">{gateScopeText}</p>
        </div>

        {!selectedRun ? (
          <p className="text-sm text-muted-foreground">
            尚未选中 generation run。
          </p>
        ) : gateRunsQuery.isLoading ? (
          <LoadingState label="正在加载 Gate run 证据..." />
        ) : gateRunsQuery.isError ? (
          <InlineErrorState
            title="Gate run 证据加载失败"
            description="请稍后重试，或调整当前 generation run / repair attempt 过滤。"
            onRetry={() => void gateRunsQuery.refetch()}
          />
        ) : gateRuns.length === 0 ? (
          <EmptyState
            title="暂无 Gate run 证据"
            description="Gate runner 写入证据后，会按所选 generation run 和 repair attempt 自动过滤展示。"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Gate
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      状态
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Attempt
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Blocking
                    </th>
                    <th className="min-w-72 px-3 py-2 font-medium">摘要</th>
                    <th className="min-w-72 px-3 py-2 font-medium">Evidence</th>
                    <th className="min-w-64 px-3 py-2 font-medium">
                      Failure / repair
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gateRuns.map((gateRun) => (
                    <tr key={gateRun.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Gate {gateRun.gateOrder}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {gateRun.gateName}
                          </p>
                          <code className="text-xs text-muted-foreground">
                            {gateRun.gateId}
                          </code>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <GateRunStatusBadge status={gateRun.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        #{gateRun.attemptNumber}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {gateRun.blocking ? '阻断' : '非阻断'}
                      </td>
                      <td className="px-3 py-3">
                        <SummaryText>{gateRun.summary}</SummaryText>
                      </td>
                      <td className="px-3 py-3">
                        <EvidenceSummaryList evidence={gateRun.evidence} />
                      </td>
                      <td className="px-3 py-3">
                        <FailureSummary gateRun={gateRun} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {formatGeneratedAppDateTime(gateRun.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {gateRunMeta && gateRunMeta.totalPages > 1 ? (
              <Pagination
                page={gatePage}
                totalPages={gateRunMeta.totalPages}
                onPageChange={setGatePage}
                isLoading={gateRunsQuery.isFetching}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
