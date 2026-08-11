import { useState, useCallback, useEffect, useMemo } from 'react'
import { Search, Plus, Brain, Loader2, AlertCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { staggerList } from '@/shared/lib/motion'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
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

const MEMORY_TONE = 'var(--color-node-memory)'

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

  useEffect(() => {
    if (!isError) return
    notify({
      title: '记忆实例列表加载失败',
      description: '请检查网络后重试。',
      variant: 'error',
    })
  }, [isError, notify])

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
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Brain}
        tone={MEMORY_TONE}
        title="记忆实例"
        description="管理 Agent 的图谱记忆实例"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建记忆实例
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索记忆实例..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="sm:w-32" aria-label="状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="archived">已归档</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="记忆实例列表加载失败"
          description="请稍后重试，或检查记忆服务是否可用。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : instances.length === 0 ? (
        <EmptyState
          icon={Brain}
          tone={MEMORY_TONE}
          title={hasFilters ? '没有匹配的记忆实例' : '暂无记忆实例'}
          description={
            hasFilters
              ? '换个关键词，或切换状态筛选。'
              : '记忆实例保存 Agent 的长期图谱记忆，创建后可在 Agent 配置里挂载。'
          }
          action={
            hasFilters ? null : (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                创建记忆实例
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {instances.map((instance, index) => (
              <motion.div key={instance.id} {...staggerList(index)}>
                <MemoryInstanceCard
                  instance={instance}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                />
              </motion.div>
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

      <CreateMemoryInstanceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <EditMemoryInstanceDialog
        instance={editingInstance}
        open={editingInstance !== null}
        onOpenChange={(open) => {
          if (!open) setEditingInstance(null)
        }}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除记忆实例「{confirmDelete?.name}」吗？此操作不可撤销。
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
              {deleteMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
