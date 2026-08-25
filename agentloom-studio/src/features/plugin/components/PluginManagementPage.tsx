import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Plus,
  Power,
  PowerOff,
  Puzzle,
  Search,
  Store,
  Trash2,
} from 'lucide-react'
import { useAuthToken } from '@/features/auth'
import { getInterventionPolicyRoleFromToken } from '@/features/intervention-policy'
import {
  PluginPublishDialog,
  type PluginPublishTarget,
} from '@/features/marketplace'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Spinner } from '@/shared/components/spinner/Spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { useToast } from '@/shared/ui/toast'
import { usePlugins } from '../api/pluginQueries'
import { useDeletePlugin, useUpdatePluginStatus } from '../api/pluginMutations'
import {
  PLUGIN_ORIGIN_LABEL,
  PLUGIN_STATUS_LABEL,
  PLUGIN_STATUS_VARIANT,
  canAdministerPlugins,
  canRegisterPlugins,
  getPluginOrigin,
} from '../lib/pluginPresentation'
import { PluginDetailSheet } from './PluginDetailSheet'
import { RegisterPluginDialog } from './RegisterPluginDialog'
import type { PluginListItem, PluginStatus } from '../types'

const PAGE_SIZE = 20

/** Radix Select 不接受空字符串 value，用哨兵值表示「不过滤」 */
const ANY = '__any__'

const STATUS_OPTIONS: { value: PluginStatus | typeof ANY; label: string }[] = [
  { value: ANY, label: '全部状态' },
  { value: 'active', label: PLUGIN_STATUS_LABEL.active },
  { value: 'registered', label: PLUGIN_STATUS_LABEL.registered },
  { value: 'disabled', label: PLUGIN_STATUS_LABEL.disabled },
  { value: 'error', label: PLUGIN_STATUS_LABEL.error },
]

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function PluginManagementPage() {
  const { notify } = useToast()
  const authToken = useAuthToken()
  const role = getInterventionPolicyRoleFromToken(authToken)
  const canAdminister = canAdministerPlugins(role)
  const canRegister = canRegisterPlugins(role)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PluginStatus | ''>('')
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PluginListItem | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [publishTarget, setPublishTarget] = useState<PluginPublishTarget | null>(
    null,
  )

  const params = useMemo(() => {
    const next: {
      page: number
      pageSize: number
      search?: string
      status?: PluginStatus
    } = { page, pageSize: PAGE_SIZE }
    if (search.trim()) next.search = search.trim()
    if (statusFilter) next.status = statusFilter
    return next
  }, [page, search, statusFilter])

  const { data, isLoading, isError, refetch } = usePlugins(params)
  const plugins = data?.data ?? []
  const meta = data?.meta

  const statusMutation = useUpdatePluginStatus()
  const deleteMutation = useDeletePlugin()

  useEffect(() => {
    if (!isError) return
    notify({
      title: '插件列表加载失败',
      description: '请检查网络后重试。',
      variant: 'error',
    })
  }, [isError, notify])

  const handleToggleStatus = useCallback(
    (plugin: PluginListItem) => {
      const nextStatus: PluginStatus = plugin.status === 'active' ? 'disabled' : 'active'
      setTogglingId(plugin.id)

      statusMutation.mutate(
        { id: plugin.id, status: nextStatus, occVersion: plugin.occVersion },
        {
          onSuccess: () => {
            setTogglingId(null)
            notify({
              title: nextStatus === 'active' ? '插件已启用' : '插件已停用',
              description: `「${plugin.name}」现在是${PLUGIN_STATUS_LABEL[nextStatus]}状态。`,
              variant: 'success',
            })
          },
          onError: (error) => {
            setTogglingId(null)
            notify({
              title: '状态更新失败',
              description:
                error instanceof Error ? error.message : '插件可能已被他人修改，请刷新后重试。',
              variant: 'error',
            })
          },
        },
      )
    },
    [notify, statusMutation],
  )

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return

    deleteMutation.mutate(pendingDelete.id, {
      onSuccess: () => {
        notify({
          title: '插件已删除',
          description: `「${pendingDelete.name}」已从插件库移除。`,
          variant: 'success',
        })
        setPendingDelete(null)
      },
      onError: (error) => {
        notify({
          title: '删除失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      },
    })
  }, [deleteMutation, notify, pendingDelete])

  const columns = useMemo<DataTableColumn<PluginListItem>[]>(() => {
    const base: DataTableColumn<PluginListItem>[] = [
      {
        key: 'name',
        header: '插件',
        // w-full max-w-0 是表格内让 truncate 真正生效的写法
        className: 'w-full max-w-0',
        cell: (plugin) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{plugin.name}</p>
            <p className="flex items-baseline gap-1 text-xs text-muted">
              <span className="truncate">{plugin.pluginId}</span>
              {/* 小屏隐藏了版本列，把版本号并进副标题且不参与截断 */}
              <span className="shrink-0 sm:hidden">v{plugin.version}</span>
            </p>
          </div>
        ),
      },
      {
        key: 'version',
        header: '版本',
        className: 'w-24',
        hideBelow: 'sm',
        cell: (plugin) => <span className="text-muted">v{plugin.version}</span>,
      },
      {
        key: 'status',
        header: '状态',
        className: 'w-28',
        cell: (plugin) => (
          <Badge variant={PLUGIN_STATUS_VARIANT[plugin.status]}>
            {PLUGIN_STATUS_LABEL[plugin.status]}
          </Badge>
        ),
      },
      {
        key: 'origin',
        header: '来源',
        className: 'w-36',
        hideBelow: 'md',
        cell: (plugin) => (
          <div className="min-w-0">
            <p className="text-foreground">{PLUGIN_ORIGIN_LABEL[getPluginOrigin(plugin)]}</p>
            <p className="truncate text-xs text-muted">{plugin.author}</p>
          </div>
        ),
      },
      {
        key: 'updatedAt',
        header: '更新时间',
        className: 'w-40',
        hideBelow: 'lg',
        cell: (plugin) => (
          <span className="text-muted">
            {DATE_FORMATTER.format(new Date(plugin.updatedAt))}
          </span>
        ),
      },
    ]

    // 发布到市场对 creator 开放，启停/删除仍限 owner/admin
    if (!canAdminister && !canRegister) return base

    return [
      ...base,
      {
        key: 'actions',
        header: '操作',
        className: 'w-32 text-right',
        cell: (plugin) => (
          <div
            className="flex justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            {canRegister && plugin.status === 'active' ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`发布 ${plugin.name} 到市场`}
                onClick={() =>
                  setPublishTarget({
                    mode: 'create',
                    pluginDbId: plugin.id,
                    pluginName: plugin.name,
                  })
                }
              >
                <Store className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {canAdminister ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    plugin.status === 'active'
                      ? `停用 ${plugin.name}`
                      : `启用 ${plugin.name}`
                  }
                  disabled={togglingId === plugin.id}
                  onClick={() => handleToggleStatus(plugin)}
                >
                  {togglingId === plugin.id ? (
                    <Spinner size="sm" />
                  ) : plugin.status === 'active' ? (
                    <PowerOff className="h-3.5 w-3.5" />
                  ) : (
                    <Power className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除 ${plugin.name}`}
                  className="text-muted hover:text-error"
                  onClick={() => setPendingDelete(plugin)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ]
  }, [canAdminister, canRegister, handleToggleStatus, togglingId])

  const hasFilters = search.trim() !== '' || statusFilter !== ''

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Puzzle}
        tone="var(--color-node-plugin)"
        title="插件"
        description="管理组织内已注册的 AgentLoom 插件包及其画布节点"
        actions={
          canRegister ? (
            <Button onClick={() => setRegisterOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              注册插件
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="搜索插件名称、标识或作者..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter || ANY}
          onValueChange={(value) => {
            setStatusFilter(value === ANY ? '' : (value as PluginStatus))
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-36" aria-label="状态筛选">
            <SelectValue />
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

      {isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="插件列表加载失败"
          description="请稍后重试，或确认当前账号有查看插件的权限。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={plugins}
          rowKey={(plugin) => plugin.id}
          loading={isLoading}
          onRowClick={(plugin) => setDetailId(plugin.id)}
          empty={
            <EmptyState
              icon={Puzzle}
              tone="var(--color-node-plugin)"
              title={hasFilters ? '没有匹配的插件' : '还没有注册任何插件'}
              description={
                hasFilters
                  ? '换个关键词，或把状态筛选放宽到全部。'
                  : '插件包由开发者密钥签名后打包成 .alp，注册启用后即可在画布中使用其节点。'
              }
              action={
                hasFilters || !canRegister ? null : (
                  <Button size="sm" onClick={() => setRegisterOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    注册插件
                  </Button>
                )
              }
            />
          }
          pagination={
            meta && meta.total > PAGE_SIZE
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

      <RegisterPluginDialog open={registerOpen} onOpenChange={setRegisterOpen} />

      <PluginDetailSheet
        pluginId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
      />

      <PluginPublishDialog
        target={publishTarget}
        onOpenChange={(open) => {
          if (!open) setPublishTarget(null)
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>删除插件</AlertDialogTitle>
          <AlertDialogDescription>
            {`确定要删除「${pendingDelete?.name ?? ''}」吗？使用了该插件节点的工作流将无法继续执行，此操作不可撤销。`}
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                handleConfirmDelete()
              }}
            >
              {deleteMutation.isPending ? <Spinner size="sm" className="mr-1.5" /> : null}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
