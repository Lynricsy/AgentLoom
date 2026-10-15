import { memo, useEffect, useMemo, useState } from 'react'
import { TriangleAlert, Users } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { JsonTreeView } from '@/shared/components/json/JsonTreeView'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Progress } from '@/shared/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge } from '@/shared/ui/status-badge'
import type { TeamRunDetail } from '../../api/teamRuns'
import { useTeamRunLive, useTeamRuns } from '../../hooks/useTeamRuns'
import {
  TEAM_FAILURE_REASON_LABEL,
  TEAM_MEMBER_STATUS_META,
  TEAM_RUN_STATUS_META,
  formatTeamDeadlineRemaining,
} from '../../lib/teamPresentation'
import type { TeamMemberView, TeamRunView } from '../../lib/teamRunView'
import { useExecutionStore } from '../../stores/executionStore'
import { TeamMessageTimeline } from './TeamMessageTimeline'

/** 用量达到上限该比例时进度条转为警示色 */
const BUDGET_WARNING_RATIO = 0.9

const MEMBER_COLUMNS: DataTableColumn<TeamMemberView>[] = [
  {
    key: 'role',
    header: '角色',
    cell: (member) => (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="font-medium text-foreground">{member.role}</span>
        {member.isLead ? (
          <Badge variant="default" size="sm">
            负责人
          </Badge>
        ) : null}
      </div>
    ),
  },
  {
    key: 'agent',
    header: 'Agent',
    cell: (member) => member.agentName ?? '—',
    hideBelow: 'md',
  },
  {
    key: 'status',
    header: '状态',
    nowrap: true,
    cell: (member) => {
      const meta = TEAM_MEMBER_STATUS_META[member.status]
      return (
        <StatusBadge tone={meta.tone} dot pulse={member.status === 'running'} size="sm">
          {meta.label}
        </StatusBadge>
      )
    },
  },
  {
    key: 'turns',
    header: '回合',
    align: 'right',
    nowrap: true,
    cell: (member) =>
      member.turnCount === null ? '—' : formatNumber(member.turnCount),
  },
  {
    key: 'tokens',
    header: 'Tokens',
    align: 'right',
    nowrap: true,
    cell: (member) => formatNumber(member.usedTokens),
  },
]

function BudgetMeter({
  label,
  used,
  max,
  testId,
}: {
  label: string
  used: number
  max: number
  testId: string
}) {
  return (
    <div className="min-w-0 space-y-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {formatNumber(used)} / {formatNumber(max)}
        </span>
      </div>
      <Progress
        value={used}
        max={max}
        aria-label={label}
        tone={used >= max * BUDGET_WARNING_RATIO ? 'var(--color-warning)' : undefined}
      />
    </div>
  )
}

/** 运行中每秒刷新剩余时间；结束后显示截止时刻 */
function DeadlineCountdown({
  deadlineAt,
  active,
}: {
  deadlineAt: string
  active: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const remaining = active ? formatTeamDeadlineRemaining(deadlineAt, now) : null

  return (
    <div className="min-w-0 space-y-1.5" data-testid="team-budget-deadline">
      <div className="text-xs text-muted-foreground">截止</div>
      <div className="text-sm tabular-nums text-foreground">
        {remaining ? `剩余 ${remaining}` : formatDateTime(deadlineAt)}
      </div>
    </div>
  )
}

function TeamResultSection({
  view,
  detail,
}: {
  view: TeamRunView
  detail: TeamRunDetail | undefined
}) {
  if (view.status === 'failed' || view.status === 'cancelled') {
    const reason = view.failureReason
    return (
      <Alert
        variant={view.status === 'failed' ? 'error' : 'warning'}
        title={reason ? TEAM_FAILURE_REASON_LABEL[reason] : TEAM_RUN_STATUS_META[view.status].label}
        data-testid="team-run-failure"
      >
        {detail?.failureDetail ?? null}
      </Alert>
    )
  }

  const result = detail?.result
  if (view.status !== 'completed' || !result) {
    return null
  }

  const summary = typeof result.summary === 'string' ? result.summary : null
  const limitations = Array.isArray(result.knownLimitations)
    ? result.knownLimitations.filter((item): item is string => typeof item === 'string')
    : []

  return (
    <section className="space-y-2" data-testid="team-run-result">
      <h3 className="text-sm font-semibold text-foreground">结果</h3>
      {summary ? (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{summary}</p>
      ) : null}
      {limitations.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">已知局限</div>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.artifact !== undefined ? (
        <JsonTreeView value={result.artifact} name="artifact" defaultExpandedDepth={1} />
      ) : null}
    </section>
  )
}

const TeamRunBody = memo(function TeamRunBody({ teamRunId }: { teamRunId: string }) {
  const {
    view,
    detail,
    isLoading,
    error,
    hasMoreMessages,
    isLoadingMoreMessages,
    loadMoreMessages,
  } = useTeamRunLive(teamRunId)

  if (isLoading && view.status === null) {
    return <Skeleton className="h-48 rounded-lg" data-testid="team-run-loading" />
  }

  if (error && view.status === null) {
    return (
      <EmptyState
        variant="plain"
        icon={TriangleAlert}
        tone="var(--color-error)"
        title="加载团队运行失败"
        description={error.message}
      />
    )
  }

  const active = view.status === 'running'

  return (
    <div className="space-y-5">
      {view.budget ? (
        <div className="grid gap-4 sm:grid-cols-3" data-testid="team-budget">
          <BudgetMeter
            label="Tokens"
            used={view.budget.usedTokens}
            max={view.budget.maxTotalTokens}
            testId="team-budget-tokens"
          />
          <BudgetMeter
            label="消息"
            used={view.budget.messageCount}
            max={view.budget.maxMessages}
            testId="team-budget-messages"
          />
          <DeadlineCountdown deadlineAt={view.budget.deadlineAt} active={active} />
        </div>
      ) : null}

      <TeamResultSection view={view} detail={detail} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">成员</h3>
        <DataTable
          columns={MEMBER_COLUMNS}
          data={view.members}
          rowKey={(member) => member.memberId}
          empty={<EmptyState variant="plain" icon={Users} title="暂无成员" />}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">消息</h3>
        <TeamMessageTimeline
          messages={view.messages}
          hasMore={hasMoreMessages}
          isLoadingMore={isLoadingMoreMessages}
          onLoadMore={() => void loadMoreMessages()}
        />
      </section>
    </div>
  )
})

interface TeamRunPanelProps {
  executionId: string
  stepId: string
  nodeName: string
}

/**
 * 一个 team 步骤的团队视图。重跑会为同一步骤留下多次运行，默认显示最新一次，可切换查看历史。
 * 运行状态与消息投递由 `executionStore.teamRuns` 的 socket 增量驱动，REST 只 hydrate 一次。
 */
export const TeamRunPanel = memo(function TeamRunPanel({
  executionId,
  stepId,
  nodeName,
}: TeamRunPanelProps) {
  const { data: runs, isLoading, error } = useTeamRuns(executionId)
  // REST 列表之后才启动的运行只在 socket 中出现，视为最新
  const liveRunIds = useExecutionStore(
    useShallow((state) =>
      Object.values(state.teamRuns)
        .filter((run) => run.stepId === stepId)
        .map((run) => run.teamRunId),
    ),
  )
  const runIds = useMemo(() => {
    const restIds = (runs ?? [])
      .filter((run) => run.stepId === stepId)
      .map((run) => run.id)
    return [...liveRunIds.filter((id) => !restIds.includes(id)), ...restIds]
  }, [liveRunIds, runs, stepId])
  const runStartedAt = useMemo(
    () => Object.fromEntries((runs ?? []).map((run) => [run.id, run.startedAt])),
    [runs],
  )

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const teamRunId =
    selectedRunId && runIds.includes(selectedRunId) ? selectedRunId : (runIds[0] ?? null)
  const liveStatus = useExecutionStore((state) =>
    teamRunId ? state.teamRuns[teamRunId]?.status : undefined,
  )
  const status =
    liveStatus ?? runs?.find((run) => run.id === teamRunId)?.status ?? null

  let body
  if (teamRunId) {
    body = <TeamRunBody key={teamRunId} teamRunId={teamRunId} />
  } else if (isLoading) {
    body = <Skeleton className="h-48 rounded-lg" data-testid="team-run-loading" />
  } else if (error) {
    body = (
      <EmptyState
        variant="plain"
        icon={TriangleAlert}
        tone="var(--color-error)"
        title="加载团队运行失败"
        description={error.message}
      />
    )
  } else {
    body = (
      <EmptyState
        variant="plain"
        icon={Users}
        title="团队尚未启动"
        description="步骤开始执行后会创建团队运行。"
      />
    )
  }

  return (
    <Card data-testid={`team-run-panel-${stepId}`}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate">{nodeName}</CardTitle>
          {status ? (
            <StatusBadge
              tone={TEAM_RUN_STATUS_META[status].tone}
              dot
              pulse={status === 'running'}
              data-testid="team-run-status"
            >
              {TEAM_RUN_STATUS_META[status].label}
            </StatusBadge>
          ) : null}
        </div>
        {runIds.length > 1 && teamRunId ? (
          <Select value={teamRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="w-56" aria-label="选择团队运行">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {runIds.map((id, index) => (
                <SelectItem key={id} value={id}>
                  {`第 ${runIds.length - index} 次运行`}
                  {runStartedAt[id] ? ` · ${formatDateTime(runStartedAt[id])}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent className="p-4 pt-0">{body}</CardContent>
    </Card>
  )
})
