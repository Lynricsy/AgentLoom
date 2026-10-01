import { useMemo, useState } from 'react'
import { AlertTriangle, KeyRound, Lock, Plus } from 'lucide-react'

import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'

import { useAgentApiKeys, useRevokeAgentApiKey } from '../api/agentApiKeyQueries'
import { resolveProblemDetail } from '../lib/problemDetail'
import type { AgentApiKey, AgentApiKeyStatusFilter } from '../types'
import { AgentApiKeyCreateDialog } from './AgentApiKeyCreateDialog'

interface AgentApiKeyListProps {
  agentId: string
  /** false 时为只读（creator）：不渲染创建与吊销入口 */
  canManage: boolean
}

const PAGE_SIZE = 20

const STATUS_OPTIONS: { value: AgentApiKeyStatusFilter; label: string }[] = [
  { value: 'active', label: '仅有效' },
  { value: 'revoked', label: '仅已吊销' },
  { value: 'all', label: '全部' },
]

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const COUNT_FORMAT = new Intl.NumberFormat('zh-CN')

function formatTimestamp(value: string): string {
  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? value : DATE_TIME_FORMAT.format(parsed)
}

type KeyState = 'active' | 'expired' | 'revoked'

function resolveKeyState(key: AgentApiKey, now: number): KeyState {
  if (key.revokedAt) {
    return 'revoked'
  }

  const expiresAt = key.expiresAt ? new Date(key.expiresAt).getTime() : Number.NaN

  return !Number.isNaN(expiresAt) && expiresAt <= now ? 'expired' : 'active'
}

const STATE_BADGE: Record<
  KeyState,
  { label: string; variant: 'success' | 'warning' | 'secondary' }
> = {
  active: { label: '有效', variant: 'success' },
  expired: { label: '已过期', variant: 'warning' },
  revoked: { label: '已吊销', variant: 'secondary' },
}

export function AgentApiKeyList({ agentId, canManage }: AgentApiKeyListProps) {
  const { notify } = useToast()

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<AgentApiKeyStatusFilter>('active')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<AgentApiKey | null>(null)

  const keysQuery = useAgentApiKeys(agentId, { page, pageSize: PAGE_SIZE, status })
  const revokeMutation = useRevokeAgentApiKey(agentId)

  const keys = keysQuery.data?.data ?? []
  const meta = keysQuery.data?.meta
  const listError = keysQuery.error

  async function handleRevoke() {
    const target = revokeTarget

    if (!target) {
      return
    }

    try {
      await revokeMutation.mutateAsync(target.id)
      notify({
        variant: 'success',
        title: 'API Key 已吊销',
        description: `「${target.name}」已失效，使用它的调用将立即被拒绝。`,
      })
    } catch (error) {
      notify({
        variant: 'error',
        title: '吊销失败',
        description: resolveProblemDetail(error, '吊销 API Key 时发生未知错误。'),
      })
    } finally {
      setRevokeTarget(null)
    }
  }

  const columns = useMemo<DataTableColumn<AgentApiKey>[]>(() => {
    const now = Date.now()
    const base: DataTableColumn<AgentApiKey>[] = [
      {
        key: 'name',
        header: '名称',
        // `w-full max-w-0` 让名称列吃掉剩余宽度并真正触发 truncate
        className: 'w-full max-w-0',
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <code className="truncate font-mono text-xs text-muted">
              {row.keyPrefix}…
            </code>
          </div>
        ),
      },
      {
        key: 'limits',
        header: '限额',
        hideBelow: 'sm',
        cell: (row) => (
          <div className="flex flex-col whitespace-nowrap text-xs">
            <span className="text-foreground">
              {row.rateLimitPerMinute == null
                ? '组织默认速率'
                : `${COUNT_FORMAT.format(row.rateLimitPerMinute)} 次/分钟`}
            </span>
            <span className="text-muted">
              并发 {COUNT_FORMAT.format(row.maxConcurrentRuns)} 个 run
            </span>
          </div>
        ),
      },
      {
        key: 'lastUsedAt',
        header: '最后使用',
        hideBelow: 'md',
        cell: (row) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {row.lastUsedAt ? formatTimestamp(row.lastUsedAt) : '从未使用'}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        cell: (row) => {
          const state = resolveKeyState(row, now)
          const badge = STATE_BADGE[state]

          return (
            <div className="flex flex-col items-start gap-0.5">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              <span className="whitespace-nowrap text-[11px] text-muted">
                {state === 'revoked' && row.revokedAt
                  ? `吊销于 ${formatTimestamp(row.revokedAt)}`
                  : row.expiresAt
                    ? `${state === 'expired' ? '过期于' : '有效至'} ${formatTimestamp(row.expiresAt)}`
                    : '长期有效'}
              </span>
            </div>
          )
        },
      },
    ]

    if (!canManage) {
      return base
    }

    return [
      ...base,
      {
        key: 'actions',
        header: '操作',
        className: 'w-px text-right',
        cell: (row) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`吊销 ${row.name}`}
            className="whitespace-nowrap text-error hover:bg-error/10"
            disabled={row.revokedAt !== null}
            onClick={() => setRevokeTarget(row)}
          >
            吊销
          </Button>
        ),
      },
    ]
  }, [canManage])

  const createButton = canManage ? (
    <Button size="sm" onClick={() => setIsCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      创建 Key
    </Button>
  ) : null

  return (
    <div className="space-y-4" data-testid="agent-api-key-list">
      {canManage ? null : (
        <div
          className="flex gap-2 rounded-card border border-border bg-surface-elevated px-3 py-2.5"
          data-testid="agent-api-key-readonly-notice"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            你当前只有查看权限。创建与吊销 API Key 需要组织的 owner 或 admin 角色。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus(next as AgentApiKeyStatusFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36" aria-label="按状态筛选 API Key">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {meta ? (
          <span className="text-xs text-muted">
            共 {COUNT_FORMAT.format(meta.total)} 个
          </span>
        ) : null}

        {createButton ? <div className="ml-auto">{createButton}</div> : null}
      </div>

      <DataTable
        columns={columns}
        data={keys}
        rowKey={(row) => row.id}
        loading={keysQuery.isPending}
        skeletonRows={3}
        empty={
          listError ? (
            <EmptyState
              icon={AlertTriangle}
              tone="var(--color-error)"
              title="加载 API Key 失败"
              description={resolveProblemDetail(listError, '请检查网络连接后重试。')}
              action={
                <Button variant="outline" onClick={() => void keysQuery.refetch()}>
                  重试
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={KeyRound}
              title={status === 'revoked' ? '没有已吊销的 API Key' : '还没有 API Key'}
              description={
                canManage
                  ? '创建一个 Key，第三方系统即可调用这个 Agent。'
                  : '请联系组织的 owner 或 admin 创建 API Key。'
              }
              action={status === 'revoked' ? undefined : createButton ?? undefined}
            />
          )
        }
        pagination={
          meta && meta.total > meta.pageSize
            ? {
                page: meta.page,
                pageSize: meta.pageSize,
                total: meta.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      {canManage ? (
        <AgentApiKeyCreateDialog
          agentId={agentId}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      ) : null}

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRevokeTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>吊销 API Key？</AlertDialogTitle>
          <AlertDialogDescription>
            吊销后「{revokeTarget?.name}」将立即失效且无法恢复，使用它的调用都会收到 401。请先确认接入方已切换到新的 Key。
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={revokeMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={revokeMutation.isPending}
              onClick={(event) => {
                // 吊销是异步的：阻止 Radix 立即关闭，等请求落地后统一收尾
                event.preventDefault()
                void handleRevoke()
              }}
            >
              {revokeMutation.isPending ? '吊销中…' : '确认吊销'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
