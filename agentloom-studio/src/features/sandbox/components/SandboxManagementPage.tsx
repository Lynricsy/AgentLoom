import { useState, useCallback, useMemo } from 'react'
import { Search, Plus, Container, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Pagination } from '@/shared/components'
import { useToast } from '@/shared/ui/toast'
import { useSandboxes } from '../api/sandboxQueries'
import { useStopSandbox, useStartSandbox, useDeleteSandbox } from '../api/sandboxMutations'
import { SandboxCard } from './SandboxCard'
import { CreateSandboxDialog } from './CreateSandboxDialog'
import type { SandboxSession, SandboxListParams, SandboxStatus } from '../types'

const PAGE_SIZE = 20

const STATUS_OPTIONS: { value: SandboxStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'creating', label: '创建中' },
  { value: 'ready', label: '就绪' },
  { value: 'busy', label: '运行中' },
  { value: 'stopping', label: '停止中' },
  { value: 'stopped', label: '已停止' },
  { value: 'failed', label: '失败' },
]

const LIFECYCLE_OPTIONS: { value: '' | 'session' | 'persistent'; label: string }[] = [
  { value: '', label: '全部类型' },
  { value: 'session', label: '临时' },
  { value: 'persistent', label: '持久' },
]

export function SandboxManagementPage() {
  const { notify } = useToast()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SandboxStatus | ''>('')
  const [lifecycleFilter, setLifecycleFilter] = useState<'' | 'session' | 'persistent'>('')

  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<SandboxSession | null>(null)

  const stopMutation = useStopSandbox()
  const startMutation = useStartSandbox()
  const deleteMutation = useDeleteSandbox()

  const params = useMemo<SandboxListParams>(() => {
    const p: SandboxListParams = { page, pageSize: PAGE_SIZE }
    if (search.trim()) p.search = search.trim()
    if (statusFilter) p.status = statusFilter
    if (lifecycleFilter) p.lifecycleMode = lifecycleFilter
    return p
  }, [page, search, statusFilter, lifecycleFilter])

  const { data, isLoading, isError, refetch } = useSandboxes(params)
  const sessions = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  const handleStop = useCallback(
    (session: SandboxSession) => {
      stopMutation.mutate(session.id, {
        onSuccess: () => {
          notify({ title: '已停止', description: `沙箱「${session.config.name || session.id.slice(0, 8)}」已停止。`, variant: 'success' })
        },
        onError: (err) => {
          notify({ title: '停止失败', description: err instanceof Error ? err.message : '请稍后重试。', variant: 'error' })
        },
      })
    },
    [stopMutation, notify],
  )

  const handleStart = useCallback(
    (session: SandboxSession) => {
      startMutation.mutate(session.id, {
        onSuccess: () => {
          notify({ title: '已启动', description: `沙箱「${session.config.name || session.id.slice(0, 8)}」已启动。`, variant: 'success' })
        },
        onError: (err) => {
          notify({ title: '启动失败', description: err instanceof Error ? err.message : '请稍后重试。', variant: 'error' })
        },
      })
    },
    [startMutation, notify],
  )

  const handleDelete = useCallback((session: SandboxSession) => {
    setConfirmDelete(session)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        setConfirmDelete(null)
        notify({
          title: '已删除',
          description: `已删除沙箱「${confirmDelete.config.name || confirmDelete.id.slice(0, 8)}」。`,
          variant: 'success',
        })
      },
      onError: (err) => {
        notify({
          title: '删除失败',
          description: err instanceof Error ? err.message : '请稍后重试。',
          variant: 'error',
        })
      },
    })
  }, [confirmDelete, deleteMutation, notify])

  const hasFilters = search.trim() !== '' || statusFilter !== '' || lifecycleFilter !== ''

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">沙箱</h1>
          <p className="text-sm text-muted-foreground">管理 Agent 的代码执行沙箱环境</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          创建沙箱
        </Button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索沙箱..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SandboxStatus | '')
            setPage(1)
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={lifecycleFilter}
          onChange={(e) => {
            setLifecycleFilter(e.target.value as '' | 'session' | 'persistent')
            setPage(1)
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {LIFECYCLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium">沙箱列表加载失败</p>
          <p className="text-sm text-muted-foreground">请稍后重试</p>
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
          <Container className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters ? '没有匹配的沙箱' : '暂无沙箱，点击右上角创建'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {sessions.map((session) => (
              <SandboxCard
                key={session.id}
                session={session}
                onStop={handleStop}
                onStart={handleStart}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
        </>
      )}

      {/* Create dialog */}
      <CreateSandboxDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirmDelete(null)
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭对话框"
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">确认删除</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除沙箱「{confirmDelete.config.name || confirmDelete.id.slice(0, 8)}」吗？此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
