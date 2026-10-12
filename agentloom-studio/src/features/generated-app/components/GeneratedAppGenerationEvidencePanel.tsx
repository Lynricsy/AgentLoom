import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  FileSearch,
  History,
  RefreshCw,
  Wrench,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge } from '@/shared/ui/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import {
  useGeneratedAppGateRuns,
  useGeneratedAppGenerationRuns,
  useGeneratedAppRepairAttempts,
} from '../api'
import {
  GENERATED_APP_GATE_STATUS_META,
  GENERATED_APP_GENERATION_RUN_STATUS_META,
  GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS,
  GENERATED_APP_REPAIR_ATTEMPT_STATUS_META,
  formatGeneratedAppDateTime,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRun,
  GeneratedAppGenerationRun,
  GeneratedAppGenerationRunStatus,
  GeneratedAppRepairAttempt,
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
  { value: 'queued', label: GENERATED_APP_GENERATION_RUN_STATUS_META.queued.label },
  {
    value: 'running',
    label: GENERATED_APP_GENERATION_RUN_STATUS_META.running.label,
  },
  {
    value: 'repairing',
    label: GENERATED_APP_GENERATION_RUN_STATUS_META.repairing.label,
  },
  { value: 'passed', label: GENERATED_APP_GENERATION_RUN_STATUS_META.passed.label },
  { value: 'failed', label: GENERATED_APP_GENERATION_RUN_STATUS_META.failed.label },
  {
    value: 'cancelled',
    label: GENERATED_APP_GENERATION_RUN_STATUS_META.cancelled.label,
  },
]

interface GeneratedAppGenerationEvidencePanelProps {
  appId: string
  autoSelectLatestRun?: boolean
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
    <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/10 p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="break-words text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          重新加载
        </Button>
      </div>
    </div>
  )
}

/** 三个区块共用的表格形态骨架：表头 h-10 + 行位占位，加载完成后列结构不再突变 */
function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border" aria-busy="true">
      <p className="sr-only">{label}</p>
      <div className="flex h-10 items-center gap-4 border-b border-border px-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-40" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 flex-1" />
        </div>
      ))}
    </div>
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
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
      <p className="font-medium text-warning">已定位失败 Gate，尚未应用补丁</p>
      <p className="mt-1 break-words text-muted-foreground">
        自动修复循环已把 {attempt.targetGateId}{' '}
        标记为下一轮修复目标；当前同步 runner 未修改源码、Workflow
        或插件，重新运行前仍需要完成对应修复。
      </p>
    </div>
  )
}

function RepairPlanSummary({
  attempt,
}: {
  attempt: GeneratedAppRepairAttempt
}) {
  if (!attempt.repairPlan && !attempt.reverificationPlan) {
    return null
  }

  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted p-3 text-xs">
      {attempt.repairPlan ? (
        <p className="break-words text-muted-foreground">
          修复工作单：{attempt.repairPlan.patchTargets.join('、') || '暂无目标'}
        </p>
      ) : null}
      {attempt.reverificationPlan ? (
        <p className="break-words text-muted-foreground">
          再验证：
          {attempt.reverificationPlan.requiredGateIds.join('、') || '暂无 Gate'}
          {attempt.reverificationPlan.requiredCommandIds.length > 0
            ? ` / ${attempt.reverificationPlan.requiredCommandIds.join('、')}`
            : ''}
        </p>
      ) : null}
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
              <code className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
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

export function GeneratedAppGenerationEvidencePanel({
  appId,
  autoSelectLatestRun = false,
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
    if (!autoSelectLatestRun || selectedRunId !== null) {
      return
    }

    if (generationRunsQuery.isFetching || generationRuns.length === 0) {
      return
    }

    const latestVisibleRun = generationRuns[0]
    if (!latestVisibleRun) {
      return
    }

    setSelectedRunId(latestVisibleRun.id)
    setSelectedRepairAttemptId(null)
    setRepairPage(1)
    setGatePage(1)
  }, [
    autoSelectLatestRun,
    generationRuns,
    generationRunsQuery.isFetching,
    selectedRunId,
  ])

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
          <div className="space-y-1 text-xs text-muted-foreground">
            <span className="block">运行状态</span>
            <Select
              value={runStatusFilter}
              onValueChange={handleRunStatusFilterChange}
            >
              <SelectTrigger
                aria-label="生成运行状态筛选"
                className="min-w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERATION_RUN_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {generationRunsQuery.isLoading ? (
          <LoadingState label="正在加载生成运行记录…" />
        ) : generationRunsQuery.isError ? (
          <InlineErrorState
            title="生成运行记录加载失败"
            description="请稍后重试，或刷新页面后重新查看。"
            onRetry={() => void generationRunsQuery.refetch()}
          />
        ) : generationRuns.length === 0 ? (
          <EmptyState
            icon={History}
            title="暂无生成运行记录"
            description="自动开发测试循环写入 generation run 后，会在这里展示运行状态、预算、摘要和失败原因。"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>触发来源</TableHead>
                  <TableHead>预算</TableHead>
                  <TableHead className="min-w-72">摘要</TableHead>
                  <TableHead className="min-w-56">失败原因</TableHead>
                  <TableHead>开始时间</TableHead>
                  <TableHead>完成时间</TableHead>
                  <TableHead className="sticky right-0 border-l border-border bg-surface">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generationRuns.map((run) => (
                  <TableRow
                    key={run.id}
                    className="align-top"
                    data-state={
                      selectedRunId === run.id ? 'selected' : undefined
                    }
                  >
                    <TableCell className="whitespace-nowrap py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          Run #{run.runNumber}
                        </p>
                        <code
                          className="block max-w-40 truncate text-xs text-muted-foreground"
                          title={run.id}
                        >
                          {run.id}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3">
                      <StatusBadge tone={GENERATED_APP_GENERATION_RUN_STATUS_META[run.status].tone}>{GENERATED_APP_GENERATION_RUN_STATUS_META[run.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                      {
                        GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS[
                          run.triggerSource
                        ]
                      }
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground tabular-nums">
                      {run.maxRepairAttempts} 次修复 / {run.maxRuntimeSeconds}s
                    </TableCell>
                    <TableCell className="py-3">
                      <SummaryText>{run.summary}</SummaryText>
                    </TableCell>
                    <TableCell className="py-3">
                      <SummaryText>
                        {run.failureReason?.trim() || '暂无'}
                      </SummaryText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground tabular-nums">
                      {formatGeneratedAppDateTime(run.startedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground tabular-nums">
                      {formatGeneratedAppDateTime(run.completedAt)}
                    </TableCell>
                    <TableCell className="sticky right-0 whitespace-nowrap border-l border-border bg-surface py-3">
                      {/* 文案固定宽度，选中/未选中切换时操作列不抖动；可访问名称仍带 Run 编号 */}
                      <Button
                        variant={selectedRunId === run.id ? 'secondary' : 'outline'}
                        size="sm"
                        className="min-w-16 justify-center"
                        aria-pressed={selectedRunId === run.id}
                        aria-label={
                          selectedRunId === run.id
                            ? `当前 Run #${run.runNumber}`
                            : `选择 Run #${run.runNumber}`
                        }
                        onClick={() => handleSelectRun(run.id)}
                      >
                        {selectedRunId === run.id ? '已选' : '选择'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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
          <LoadingState label="正在加载修复尝试…" />
        ) : repairAttemptsQuery.isError ? (
          <InlineErrorState
            title="修复尝试加载失败"
            description="请稍后重试，或重新选择 generation run。"
            onRetry={() => void repairAttemptsQuery.refetch()}
          />
        ) : repairAttempts.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="暂无修复尝试"
            description="Repair loop 写入失败摘要、变更摘要和再验证摘要后，会按所选 generation run 展示。"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>修复轮次</TableHead>
                  <TableHead>目标 Gate</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="min-w-64">失败摘要</TableHead>
                  <TableHead className="min-w-64">变更摘要</TableHead>
                  <TableHead className="min-w-64">再验证摘要</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repairAttempts.map((attempt) => (
                  <TableRow
                    key={attempt.id}
                    className="align-top"
                    data-state={
                      selectedRepairAttemptId === attempt.id
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="whitespace-nowrap py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          Repair #{attempt.attemptNumber}
                        </p>
                        <code
                          className="block max-w-40 truncate text-xs text-muted-foreground"
                          title={attempt.id}
                        >
                          {attempt.id}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {attempt.targetGateId}
                      </code>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3">
                      <StatusBadge tone={GENERATED_APP_REPAIR_ATTEMPT_STATUS_META[attempt.status].tone}>{GENERATED_APP_REPAIR_ATTEMPT_STATUS_META[attempt.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="min-w-0 space-y-2">
                        <AutomaticRepairAttemptNotice attempt={attempt} />
                        <RepairPlanSummary attempt={attempt} />
                        <SummaryText>{attempt.failureSummary}</SummaryText>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <SummaryText>
                        {attempt.changeSummary?.trim() || '暂无'}
                      </SummaryText>
                    </TableCell>
                    <TableCell className="py-3">
                      <SummaryText>
                        {attempt.verificationSummary?.trim() || '暂无'}
                      </SummaryText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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
          <LoadingState label="正在加载 Gate run 证据…" />
        ) : gateRunsQuery.isError ? (
          <InlineErrorState
            title="Gate run 证据加载失败"
            description="请稍后重试，或调整当前 generation run / repair attempt 过滤。"
            onRetry={() => void gateRunsQuery.refetch()}
          />
        ) : gateRuns.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="暂无 Gate run 证据"
            description="Gate runner 写入证据后，会按所选 generation run 和 repair attempt 自动过滤展示。"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gate</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>轮次</TableHead>
                  <TableHead>阻断</TableHead>
                  <TableHead className="min-w-72">摘要</TableHead>
                  <TableHead className="min-w-72">证据</TableHead>
                  <TableHead className="min-w-64">失败 / 修复</TableHead>
                  <TableHead>完成时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateRuns.map((gateRun) => (
                  <TableRow key={gateRun.id} className="align-top">
                    <TableCell className="whitespace-nowrap py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          Gate {gateRun.gateOrder}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {gateRun.gateName}
                        </p>
                        <code
                          className="block max-w-40 truncate text-xs text-muted-foreground"
                          title={gateRun.gateId}
                        >
                          {gateRun.gateId}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3">
                      <StatusBadge tone={GENERATED_APP_GATE_STATUS_META[gateRun.status].tone}>{GENERATED_APP_GATE_STATUS_META[gateRun.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                      #{gateRun.attemptNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                      {gateRun.blocking ? '阻断' : '非阻断'}
                    </TableCell>
                    <TableCell className="py-3">
                      <SummaryText>{gateRun.summary}</SummaryText>
                    </TableCell>
                    <TableCell className="py-3">
                      <EvidenceSummaryList evidence={gateRun.evidence} />
                    </TableCell>
                    <TableCell className="py-3">
                      <FailureSummary gateRun={gateRun} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                      {formatGeneratedAppDateTime(gateRun.completedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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
