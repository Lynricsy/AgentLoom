import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'

import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'

import {
  useDeveloperKeys,
  useRevokeDeveloperKey,
} from '../api/developer-key.queries'
import { DeveloperConsoleLayout } from '../components/DeveloperConsoleLayout'
import { DeveloperKeyRegisterDialog } from '../components/DeveloperKeyRegisterDialog'
import {
  DEVELOPER_KEY_STATUS_LABEL,
  resolveDeveloperKeyErrorMessage,
  shortenFingerprint,
} from '../lib/developerKey'
import type { DeveloperKey, DeveloperKeyStatus } from '../types'

const PAGE_SIZE = 20

/** Radix Select 不接受空字符串 Item，用哨兵值表达「不筛选」 */
const ANY_STATUS = '__any__'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ANY_STATUS, label: '全部状态' },
  { value: 'active', label: '有效' },
  { value: 'revoked', label: '已撤销' },
]

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

export function DeveloperKeysPage() {
  const { notify } = useToast()

  const [statusFilter, setStatusFilter] = useState<string>(ANY_STATUS)
  const [page, setPage] = useState(1)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [keyPendingRevoke, setKeyPendingRevoke] = useState<DeveloperKey | null>(
    null,
  )

  const listParams = useMemo(
    () => ({
      status:
        statusFilter === ANY_STATUS
          ? undefined
          : (statusFilter as DeveloperKeyStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    [page, statusFilter],
  )

  const keysQuery = useDeveloperKeys(listParams)
  const revokeMutation = useRevokeDeveloperKey()

  const keys = keysQuery.data?.data ?? []
  const meta = keysQuery.data?.meta
  const listError =
    keysQuery.error instanceof Error
      ? keysQuery.error.message
      : '加载开发者密钥时发生未知错误。'

  // 列表失败时除了行内错误卡片，再补一条 toast，避免用户滚动到别处错过反馈
  useEffect(() => {
    if (!keysQuery.error) {
      return
    }

    notify({ title: '加载失败', description: listError, variant: 'error' })
  }, [keysQuery.error, listError, notify])

  const columns = useMemo<DataTableColumn<DeveloperKey>[]>(
    () => [
      {
        key: 'label',
        header: '标签',
        // w-full max-w-0：表格内让 truncate 真正生效，不被内容顶宽
        className: 'w-full max-w-0',
        cell: (key) => (
          <div className="min-w-0 space-y-1">
            <p className="truncate text-xs font-medium text-foreground">
              {key.label?.trim() || '未命名密钥'}
            </p>
            <p className="truncate text-[11px] text-muted sm:hidden">
              {shortenFingerprint(key.keyFingerprint)}
            </p>
          </div>
        ),
      },
      {
        key: 'fingerprint',
        header: '指纹',
        hideBelow: 'sm',
        cell: (key) => (
          <span
            title={key.keyFingerprint}
            className="whitespace-nowrap font-mono text-[11px] text-muted"
          >
            {shortenFingerprint(key.keyFingerprint)}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        className: 'w-24',
        cell: (key) => (
          <Badge
            variant={key.status === 'active' ? 'success' : 'secondary'}
            size="sm"
          >
            {DEVELOPER_KEY_STATUS_LABEL[key.status]}
          </Badge>
        ),
      },
      {
        key: 'createdAt',
        header: '创建时间',
        hideBelow: 'md',
        className: 'w-44',
        cell: (key) => (
          <div className="space-y-0.5">
            <p className="whitespace-nowrap text-xs text-muted">
              {formatTimestamp(key.createdAt)}
            </p>
            {key.status === 'revoked' ? (
              <p className="whitespace-nowrap text-[11px] text-muted">
                撤销于 {formatTimestamp(key.revokedAt)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        className: 'w-24 text-right',
        cell: (key) =>
          key.status === 'active' ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`撤销 ${key.label?.trim() || '未命名密钥'}`}
              className="whitespace-nowrap text-error hover:bg-error/10"
              onClick={() => setKeyPendingRevoke(key)}
            >
              撤销
            </Button>
          ) : (
            <span className="text-xs text-muted">—</span>
          ),
      },
    ],
    [],
  )

  function handleConfirmRevoke() {
    const target = keyPendingRevoke
    if (!target) {
      return
    }

    revokeMutation.mutate(target.id, {
      onSuccess: () => {
        setKeyPendingRevoke(null)
        notify({
          title: '密钥已撤销',
          description: '使用该密钥签名的插件包将不再通过验签。',
          variant: 'success',
        })
      },
      onError: async (error) => {
        setKeyPendingRevoke(null)
        notify({
          title: '撤销失败',
          description: await resolveDeveloperKeyErrorMessage(
            error,
            '密钥撤销失败，请稍后重试。',
          ),
          variant: 'error',
        })
      },
    })
  }

  return (
    <DeveloperConsoleLayout
      activeTab="keys"
      actions={
        <Button onClick={() => setIsRegisterOpen(true)}>
          <Plus className="h-4 w-4" />
          注册公钥
        </Button>
      }
    >
      <div className="space-y-4" data-testid="developer-keys-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            插件包上传时按指纹匹配开发者公钥完成验签，撤销后即刻失效。
          </p>

          <Select
            value={statusFilter}
            onValueChange={(next) => {
              setStatusFilter(next)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-8 w-36" aria-label="按状态筛选">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {keysQuery.error ? (
          <Card className="border-error/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-foreground">
                  开发者密钥加载失败
                </p>
                <p className="text-xs font-medium text-error">{listError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void keysQuery.refetch()}
              >
                重试
              </Button>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            columns={columns}
            data={keys}
            rowKey={(key) => key.id}
            loading={keysQuery.isLoading}
            empty={
              <EmptyState
                icon={KeyRound}
                title={
                  statusFilter === ANY_STATUS
                    ? '还没有注册开发者公钥'
                    : '当前筛选下没有密钥'
                }
                description={
                  statusFilter === ANY_STATUS
                    ? '注册公钥后即可上传经签名的 .alp 插件包，平台会按指纹校验来源。'
                    : '换一个状态筛选，或注册一个新的开发者公钥。'
                }
                action={
                  <Button size="sm" onClick={() => setIsRegisterOpen(true)}>
                    <Plus className="h-4 w-4" />
                    注册公钥
                  </Button>
                }
              />
            }
            pagination={
              meta
                ? {
                    page: meta.page,
                    pageSize: meta.pageSize,
                    total: meta.total,
                    onPageChange: setPage,
                  }
                : undefined
            }
          />
        )}
      </div>

      <DeveloperKeyRegisterDialog
        open={isRegisterOpen}
        onOpenChange={setIsRegisterOpen}
      />

      <AlertDialog
        open={keyPendingRevoke != null}
        onOpenChange={(next) => {
          if (!next) {
            setKeyPendingRevoke(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>撤销开发者密钥？</AlertDialogTitle>
          <AlertDialogDescription>
            撤销「{keyPendingRevoke?.label?.trim() || '未命名密钥'}
            」后，使用对应私钥签名的插件包将无法通过验签。此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">取消</Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={handleConfirmRevoke}
            >
              {revokeMutation.isPending ? '撤销中…' : '确认撤销'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </DeveloperConsoleLayout>
  )
}
