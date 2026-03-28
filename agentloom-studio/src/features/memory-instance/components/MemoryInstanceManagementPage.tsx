import { useState, useCallback, useMemo } from 'react'
import { Search, Plus, Brain, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
import { Pagination } from '@/shared/components'
import { useToast } from '@/shared/ui/toast'
import { useMemoryInstances } from '../api/memoryInstanceQueries'
import {
  useDeleteMemoryInstance,
  useUpdateMemoryInstance,
} from '../api/memoryInstanceMutations'
import { MemoryInstanceCard } from './MemoryInstanceCard'
import { CreateMemoryInstanceDialog } from './CreateMemoryInstanceDialog'
import { EditMemoryInstanceDialog } from './EditMemoryInstanceDialog'
import type { MemoryInstance, MemoryInstanceListParams } from '../types'

const PAGE_SIZE = 20

export function MemoryInstanceManagementPage() {
  const { notify } = useToast()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [editingInstance, setEditingInstance] = useState<MemoryInstance | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MemoryInstance | null>(null)

  const deleteMutation = useDeleteMemoryInstance()
  const updateMutation = useUpdateMemoryInstance()

  const params = useMemo<MemoryInstanceListParams>(() => {
    const p: MemoryInstanceListParams = { page, pageSize: PAGE_SIZE }
    if (search.trim()) p.search = search.trim()
    if (statusFilter !== 'all') p.status = statusFilter
    return p
  }, [page, search, statusFilter])

  const { data, isLoading, isError, refetch } = useMemoryInstances(params)
  const instances = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [])

  const handleEdit = useCallback((instance: MemoryInstance) => {
    setEditingInstance(instance)
  }, [])

  const handleDelete = useCallback((instance: MemoryInstance) => {
    setConfirmDelete(instance)
  }, [])

  const handleToggleStatus = useCallback(
    (instance: MemoryInstance) => {
      const nextStatus = instance.status === 'active' ? 'archived' : 'active'
      updateMutation.mutate(
        { id: instance.id, payload: { status: nextStatus } },
        {
          onSuccess: () => {
            notify({
              title: nextStatus === 'active' ? '已激活' : '已归档',
              description: `记忆实例「${instance.name}」已${nextStatus === 'active' ? '激活' : '归档'}。`,
              variant: 'success',
            })
          },
          onError: (err) => {
            notify({
              title: '操作失败',
              description: err instanceof Error ? err.message : '请稍后重试。',
              variant: 'error',
            })
          },
        },
      )
    },
    [updateMutation, notify],
  )

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        setConfirmDelete(null)
        notify({
          title: '已删除',
          description: `已删除记忆实例「${confirmDelete.name}」。`,
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

  const hasFilters = search.trim() !== '' || statusFilter !== 'all'

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">记忆实例</h1>
          <p className="text-sm text-muted-foreground">管理 Agent 的图谱记忆实例</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          创建记忆实例
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
            placeholder="搜索记忆实例..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={handleStatusChange}
          className="w-32"
        >
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium">记忆实例列表加载失败</p>
          <p className="text-sm text-muted-foreground">请稍后重试</p>
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
          <Brain className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters ? '没有匹配的记忆实例' : '暂无记忆实例，点击右上角创建'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {instances.map((instance) => (
              <MemoryInstanceCard
                key={instance.id}
                instance={instance}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleStatus={handleToggleStatus}
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
      <CreateMemoryInstanceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Edit dialog */}
      <EditMemoryInstanceDialog
        instance={editingInstance}
        open={editingInstance !== null}
        onOpenChange={(open) => {
          if (!open) setEditingInstance(null)
        }}
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
              确定要删除记忆实例「{confirmDelete.name}」吗？此操作不可撤销。
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
