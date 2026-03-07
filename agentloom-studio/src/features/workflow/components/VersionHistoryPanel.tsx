import { memo, useCallback, useState } from 'react'
import {
  History,
  X,
  RotateCcw,
  Upload,
  ChevronLeft,
  ChevronRight,
  Clock,
  Tag,
  Loader2,
  Archive,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { formatRelativeTime } from '@/features/canvas/lib/formatRelativeTime'
import type { WorkflowVersion } from '../types'
import { useWorkflowVersions } from '../api/versionQueries'
import { useRollbackVersion } from '../api/versionMutations'
import { useToast } from '@/shared/ui/toast'

interface VersionHistoryPanelProps {
  open: boolean
  workflowId: string
  workflowStatus: string
  onClose: () => void
  onPublish?: (versionId: string) => void
}

function VersionItemSkeleton() {
  return (
    <div className="animate-pulse border-b border-border p-4" data-testid="version-item-skeleton">
      <div className="flex items-center gap-2">
        <div className="h-5 w-10 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
      <div className="mt-2 h-3 w-24 rounded bg-muted" />
    </div>
  )
}

interface VersionItemProps {
  version: WorkflowVersion
  workflowStatus: string
  onRollback: (version: WorkflowVersion) => void
  onPublish?: (versionId: string) => void
  isRollingBack: boolean
}

const VersionItem = memo(function VersionItem({
  version,
  workflowStatus,
  onRollback,
  onPublish,
  isRollingBack,
}: VersionItemProps) {
  const isPublished = !!version.publishedAt
  const isArchived = !!version.archivedAt
  const isWorkflowArchived = workflowStatus === 'archived'

  return (
    <div
      className="group border-b border-border p-4 transition-colors hover:bg-muted/30"
      data-testid={`version-item-${version.versionNumber}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            v{version.versionNumber}
          </span>
          {version.label && (
            <span className="flex items-center gap-1 text-sm text-foreground">
              <Tag className="h-3 w-3" />
              {version.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isPublished && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              已发布
            </span>
          )}
          {isArchived && (
            <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-500">
              <Archive className="mr-1 h-3 w-3" />
              已归档
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(new Date(version.createdAt))}
        </span>

        {!isWorkflowArchived && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!isPublished && !isArchived && onPublish && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                onClick={() => onPublish(version.id)}
                data-testid={`publish-version-${version.versionNumber}`}
              >
                <Upload className="h-3 w-3" />
                发布
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-500/10"
              onClick={() => onRollback(version)}
              disabled={isRollingBack}
              data-testid={`rollback-version-${version.versionNumber}`}
            >
              {isRollingBack ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              回滚
            </button>
          </div>
        )}
      </div>

      {version.snapshot?.metadata && (
        <div className="mt-1 text-xs text-muted-foreground">
          {version.snapshot.metadata.nodeCount} 个节点 · {version.snapshot.metadata.edgeCount} 条连线
        </div>
      )}
    </div>
  )
})

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  open,
  workflowId,
  workflowStatus,
  onClose,
  onPublish,
}: VersionHistoryPanelProps) {
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [rollbackTarget, setRollbackTarget] = useState<WorkflowVersion | null>(null)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  const { data, isLoading } = useWorkflowVersions(workflowId, { page, pageSize })
  const rollbackMutation = useRollbackVersion(workflowId)
  const { notify } = useToast()

  const versions = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const handleRollback = useCallback(
    (version: WorkflowVersion) => {
      setRollbackTarget(version)
    },
    [],
  )

  const confirmRollback = useCallback(async () => {
    if (!rollbackTarget) return

    setRollingBackId(rollbackTarget.id)
    try {
      await rollbackMutation.mutateAsync(rollbackTarget.id)
      notify({
        title: '回滚成功',
        description: `已回滚到版本 v${rollbackTarget.versionNumber}${rollbackTarget.label ? `（${rollbackTarget.label}）` : ''}`,
        variant: 'success',
      })
      setRollbackTarget(null)
    } catch {
      notify({
        title: '回滚失败',
        description: '请稍后重试',
        variant: 'error',
      })
    } finally {
      setRollingBackId(null)
    }
  }, [rollbackTarget, rollbackMutation, notify])

  const cancelRollback = useCallback(() => {
    setRollbackTarget(null)
  }, [])

  return (
    <aside
      className={cn(
        'fixed right-0 top-0 z-40 flex h-full w-[400px] flex-col border-l border-border bg-surface shadow-xl transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
      data-testid="version-history-panel"
      aria-label="版本历史"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">版本历史</h2>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">({total})</span>
          )}
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="关闭版本历史"
          data-testid="close-version-history"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 回滚确认 */}
      {rollbackTarget && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 p-4" data-testid="rollback-confirm">
          <p className="text-sm text-amber-700">
            确定要回滚到版本 v{rollbackTarget.versionNumber}
            {rollbackTarget.label ? `（${rollbackTarget.label}）` : ''}吗？当前未保存的更改将丢失。
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              onClick={confirmRollback}
              disabled={!!rollingBackId}
              data-testid="confirm-rollback"
            >
              {rollingBackId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              确认回滚
            </button>
            <button
              type="button"
              className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={cancelRollback}
              data-testid="cancel-rollback"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 版本列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div data-testid="version-list-loading">
            <VersionItemSkeleton />
            <VersionItemSkeleton />
            <VersionItemSkeleton />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground" data-testid="version-list-empty">
            <History className="h-8 w-8 opacity-40" />
            <p className="text-sm">暂无版本历史</p>
            <p className="text-xs">保存版本后将在此显示</p>
          </div>
        ) : (
          versions.map((version) => (
            <VersionItem
              key={version.id}
              version={version}
              workflowStatus={workflowStatus}
              onRollback={handleRollback}
              onPublish={onPublish}
              isRollingBack={rollingBackId === version.id}
            />
          ))
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">
            第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="上一页"
              data-testid="version-page-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="下一页"
              data-testid="version-page-next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
})
