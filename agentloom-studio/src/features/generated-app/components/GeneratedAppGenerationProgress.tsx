import { AlertTriangle } from 'lucide-react'

import { Spinner } from '@/shared/components/spinner/Spinner'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'
import {
  isGeneratedAppGenerationRunInFlight,
  useGeneratedAppGateRuns,
  useGeneratedAppGenerationRun,
} from '../api'
import {
  GENERATED_APP_GATE_STATUS_META,
  GENERATED_APP_GENERATION_RUN_STATUS_META,
  GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppGateResult,
  GeneratedAppGateRun,
  GeneratedAppGenerationRun,
} from '../types'

/** Gate 0–7 固定 8 个；应用 gateResults 缺失时（理论上不会）按序号兜底显示 */
const CANONICAL_GATE_COUNT = 8
/** 一次运行最多 8 个 Gate × 修复重试，100 是服务端分页上限 */
const GATE_RUN_PAGE_SIZE = 100

type GateProgressStatus =
  | GeneratedAppGateRun['status']
  | 'pending'
  | 'not_executed'

interface GateProgressRow {
  gateId: string
  name: string
  status: GateProgressStatus
  summary: string | null
}

const GATE_PROGRESS_META: Record<
  GateProgressStatus,
  { label: string; tone: StatusTone }
> = {
  ...GENERATED_APP_GATE_STATUS_META,
  not_executed: { label: '未执行', tone: 'neutral' },
}

/** 同一 Gate 在修复后会有多次尝试，只看最新一次 */
function pickLatestGateRuns(
  gateRuns: GeneratedAppGateRun[],
): Map<string, GeneratedAppGateRun> {
  const latest = new Map<string, GeneratedAppGateRun>()

  for (const gateRun of gateRuns) {
    const current = latest.get(gateRun.gateId)
    if (
      !current ||
      gateRun.attemptNumber > current.attemptNumber ||
      (gateRun.attemptNumber === current.attemptNumber &&
        gateRun.createdAt > current.createdAt)
    ) {
      latest.set(gateRun.gateId, gateRun)
    }
  }

  return latest
}

/**
 * Gate 记录只在该 Gate 结束时写入：运行执行中时，第一个还没有记录的 Gate 就是正在执行的那个；
 * 运行已结束时，没有记录的 Gate 是因前序失败而未执行。
 */
function buildGateProgressRows(
  run: GeneratedAppGenerationRun,
  gates: GeneratedAppGateResult[],
  gateRuns: GeneratedAppGateRun[],
): GateProgressRow[] {
  const orderedGates =
    gates.length > 0
      ? [...gates].sort((left, right) => left.order - right.order)
      : Array.from({ length: CANONICAL_GATE_COUNT }, (_, index) => ({
          gateId: `gate-${index}`,
          name: `Gate ${index}`,
        }))
  const latestGateRuns = pickLatestGateRuns(gateRuns)
  const executing = run.status === 'running' || run.status === 'repairing'
  let currentAssigned = false

  return orderedGates.map((gate) => {
    const gateRun = latestGateRuns.get(gate.gateId)

    if (gateRun) {
      return {
        gateId: gate.gateId,
        name: gateRun.gateName || gate.name,
        status: gateRun.status,
        summary: gateRun.summary,
      }
    }

    let status: GateProgressStatus = 'pending'
    if (executing && !currentAssigned) {
      status = 'running'
      currentAssigned = true
    } else if (!isGeneratedAppGenerationRunInFlight(run)) {
      status = 'not_executed'
    }

    return { gateId: gate.gateId, name: gate.name, status, summary: null }
  })
}

interface GeneratedAppGenerationProgressProps {
  appId: string
  generationRunId: string
  /** 应用的 gateResults，提供 Gate 名称与顺序 */
  gates: GeneratedAppGateResult[]
  className?: string
}

/** 单次生成运行的实时进度：运行状态与 Gate 0–7 的逐个结果，运行结束前自动轮询 */
export function GeneratedAppGenerationProgress({
  appId,
  generationRunId,
  gates,
  className,
}: GeneratedAppGenerationProgressProps) {
  const runQuery = useGeneratedAppGenerationRun(appId, generationRunId)
  const run = runQuery.data
  const inFlight = isGeneratedAppGenerationRunInFlight(run)
  const gateRunsQuery = useGeneratedAppGateRuns(
    appId,
    { generationRunId, pageSize: GATE_RUN_PAGE_SIZE },
    { poll: inFlight },
  )

  if (runQuery.isLoading) {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!run || runQuery.isError) {
    return (
      <div
        className={cn(
          'flex items-start gap-2 text-xs text-muted-foreground',
          className,
        )}
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="space-y-2">
          <p>生成运行进度加载失败。</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runQuery.refetch()}
          >
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  const rows = buildGateProgressRows(
    run,
    gates,
    gateRunsQuery.data?.data ?? [],
  )
  const finishedCount = rows.filter(
    (row) =>
      row.status !== 'pending' &&
      row.status !== 'running' &&
      row.status !== 'not_executed',
  ).length
  const runMeta = GENERATED_APP_GENERATION_RUN_STATUS_META[run.status]

  return (
    <section
      className={cn('space-y-3', className)}
      aria-label="生成运行进度"
      data-testid="generated-app-generation-progress"
      data-run-status={run.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={runMeta.tone} size="sm">
          {runMeta.label}
        </StatusBadge>
        <span className="text-xs text-muted-foreground">
          第 {run.runNumber} 次生成运行 ·{' '}
          {GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS[run.triggerSource]}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          已完成 {finishedCount}/{rows.length} 个 Gate
        </span>
      </div>

      <div className="space-y-1" aria-live="polite">
        <p className="break-words text-xs leading-relaxed text-foreground">
          {run.summary}
        </p>
        {run.status === 'failed' && run.failureReason ? (
          <p className="break-words text-xs leading-relaxed text-error">
            {run.failureReason}
          </p>
        ) : null}
        {inFlight ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner size="sm" />
            Gate 在后台依次执行，通常需要几分钟；进度会自动刷新。
          </p>
        ) : null}
      </div>

      <ol className="grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.gateId}
            className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-border bg-muted px-2.5 py-2"
            data-gate-id={row.gateId}
            data-gate-status={row.status}
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {row.gateId.replace('gate-', 'Gate ')} · {row.name}
              </p>
              {row.summary ? (
                <p className="line-clamp-2 break-words text-2xs text-muted-foreground">
                  {row.summary}
                </p>
              ) : null}
            </div>
            <StatusBadge tone={GATE_PROGRESS_META[row.status].tone} size="sm">
              {GATE_PROGRESS_META[row.status].label}
            </StatusBadge>
          </li>
        ))}
      </ol>
    </section>
  )
}
