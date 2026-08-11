import { useEffect, useMemo, useState } from 'react'
import { HTTPError } from 'ky'
import { AlertTriangle, KeyRound, Plus } from 'lucide-react'

import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
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

import {
  usePlatformApiTokens,
  useRevokePlatformApiToken,
} from '../api/platformApiTokenQueries'
import { ApiTokenCreateDialog } from './ApiTokenCreateDialog'
import type { PlatformApiToken, PlatformApiTokenStatus } from '../types'

const PAGE_SIZE = 20

const STATUS_OPTIONS: { value: PlatformApiTokenStatus; label: string }[] = [
  { value: 'active', label: '仅有效' },
  { value: 'revoked', label: '仅已撤销' },
  { value: 'all', label: '全部' },
]

const EMPTY_HINT: Record<PlatformApiTokenStatus, string> = {
  active: '创建一个 Token 即可用它以你的身份调用开放接口。',
  revoked: '还没有被撤销过的 Token。',
  all: '创建一个 Token 即可用它以你的身份调用开放接口。',
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ApiTokenPage() {
  const { notify } = useToast()

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<PlatformApiTokenStatus>('active')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<PlatformApiToken | null>(null)

  const tokensQuery = usePlatformApiTokens({ page, pageSize: PAGE_SIZE, status })
  const revokeMutation = useRevokePlatformApiToken()

  const tokens = tokensQuery.data?.data ?? []
  const meta = tokensQuery.data?.meta
  const listError = tokensQuery.error

  useEffect(() => {
    if (!listError) {
      return
    }

    notify({
      variant: 'error',
      title: '加载失败',
      description:
        listError instanceof Error
          ? listError.message
          : '加载 API Token 列表时发生未知错误。',
    })
  }, [listError, notify])

  async function handleRevoke() {
    const target = revokeTarget

    if (!target) {
      return
    }

    try {
      await revokeMutation.mutateAsync(target.id)
      notify({
        variant: 'success',
        title: 'Token 已撤销',
        description: `「${target.name}」已失效，使用它的调用将立即被拒绝。`,
      })
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 409) {
        notify({
          variant: 'warning',
          title: 'Token 已被撤销',
          description: `「${target.name}」此前已失效，列表已刷新。`,
        })
      } else {
        notify({
          variant: 'error',
          title: '撤销失败',
          description:
            error instanceof Error ? error.message : '撤销 API Token 时发生未知错误。',
        })
      }
    } finally {
      setRevokeTarget(null)
    }
  }

  const columns = useMemo<DataTableColumn<PlatformApiToken>[]>(
    () => [
      {
        key: 'name',
        header: '名称',
        // `w-full max-w-0` 让名称列吃掉剩余宽度并真正触发 truncate，
        // 否则超长名称/作用域会把表格撑到需要横向滚动
        className: 'w-full max-w-0',
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-muted">
              {row.scopes ? row.scopes : '继承账号全部权限'}
            </p>
          </div>
        ),
      },
      {
        key: 'tokenPrefix',
        header: '前缀',
        hideBelow: 'sm',
        cell: (row) => (
          <code className="whitespace-nowrap font-mono text-xs text-muted">
            {row.tokenPrefix}…
          </code>
        ),
      },
      {
        key: 'status',
        header: '状态',
        cell: (row) => {
          const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null
          const isExpired =
            expiresAt != null &&
            !Number.isNaN(expiresAt.getTime()) &&
            expiresAt.getTime() <= Date.now()

          return (
            <div className="flex flex-col items-start gap-0.5">
              {row.isRevoked ? (
                <Badge variant="secondary">已撤销</Badge>
              ) : isExpired ? (
                <Badge variant="warning">已过期</Badge>
              ) : (
                <Badge variant="success">有效</Badge>
              )}
              {row.expiresAt ? (
                <span className="hidden whitespace-nowrap text-[11px] text-muted sm:inline">
                  {isExpired ? '过期于 ' : '有效至 '}
                  {formatTimestamp(row.expiresAt)}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'createdAt',
        header: '创建时间',
        hideBelow: 'md',
        cell: (row) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {formatTimestamp(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'lastUsedAt',
        header: '最后使用',
        hideBelow: 'lg',
        cell: (row) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {row.lastUsedAt ? formatTimestamp(row.lastUsedAt) : '从未使用'}
          </span>
        ),
      },
      {
        key: 'actions',
        // 不用 sr-only：绝对定位元素会逃出 DataTable 的横向滚动容器，撑破小屏文档宽度
        header: '操作',
        className: 'w-px text-right',
        cell: (row) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`撤销 ${row.name}`}
            className="whitespace-nowrap text-error hover:bg-error/10"
            disabled={row.isRevoked}
            onClick={() => setRevokeTarget(row)}
          >
            撤销
          </Button>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="api-token-page">
      <PageHeader
        icon={KeyRound}
        title="API Token"
        description="以你的身份调用 AgentLoom 开放接口的长期凭据。明文仅在创建时展示一次，泄露后请立即撤销。"
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            创建 Token
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus(next as PlatformApiTokenStatus)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40" aria-label="按状态筛选">
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
          <span className="text-xs text-muted">共 {meta.total} 个</span>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={tokens}
        rowKey={(row) => row.id}
        loading={tokensQuery.isPending}
        empty={
          listError ? (
            <EmptyState
              icon={AlertTriangle}
              tone="var(--color-error)"
              title="加载 API Token 失败"
              description={
                listError instanceof Error
                  ? listError.message
                  : '请检查网络连接后重试。'
              }
              action={
                <Button variant="outline" onClick={() => void tokensQuery.refetch()}>
                  重试
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={KeyRound}
              title="还没有 API Token"
              description={EMPTY_HINT[status]}
              action={
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  创建 Token
                </Button>
              }
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

      <ApiTokenCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRevokeTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>撤销 API Token？</AlertDialogTitle>
          <AlertDialogDescription>
            撤销后「{revokeTarget?.name}」将立即失效且无法恢复，所有使用它的集成都会收到
            401。请先确认没有线上服务仍在使用该 Token。
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={revokeMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={revokeMutation.isPending}
              onClick={(event) => {
                // 撤销是异步的：阻止 Radix 立即关闭，等请求落地后统一收尾
                event.preventDefault()
                void handleRevoke()
              }}
            >
              {revokeMutation.isPending ? '撤销中…' : '确认撤销'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
