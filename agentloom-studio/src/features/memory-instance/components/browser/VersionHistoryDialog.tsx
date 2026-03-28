import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, History, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { useNodeVersions } from '../../api/memoryInstanceQueries'
import { useRollbackNodeVersion } from '../../api/memoryInstanceMutations'
import { useToast } from '@/shared/ui/toast'
import type { MemoryNodeVersion } from '../../types'

interface VersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: string
  nodeId: string
  nodeName: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function VersionRow({
  version,
  isLatest,
  onRollback,
  isRollingBack,
}: {
  version: MemoryNodeVersion
  isLatest: boolean
  onRollback: (versionId: string) => void
  isRollingBack: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
        v{version.versionNumber}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {version.mode === 'patch' ? '编辑' : version.mode === 'rollback' ? '回滚' : version.mode}
          </span>
          {isLatest && (
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
              最新
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{formatDate(version.createdAt)}</span>
        </div>
        {version.content && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{version.content}</p>
        )}
      </div>
      {!isLatest && (
        <Button
          variant="outline"
          size="sm"
          disabled={isRollingBack}
          onClick={() => onRollback(version.id)}
          className="shrink-0 gap-1 text-xs"
        >
          {isRollingBack ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          回滚
        </Button>
      )}
    </div>
  )
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  instanceId,
  nodeId,
  nodeName,
}: VersionHistoryDialogProps) {
  const { notify } = useToast()
  const { data: versions, isLoading } = useNodeVersions(instanceId, nodeId, { enabled: open })
  const rollbackMutation = useRollbackNodeVersion(instanceId)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  function handleRollback(versionId: string) {
    setRollingBackId(versionId)
    rollbackMutation.mutate(
      { nodeId, versionId },
      {
        onSuccess: () => {
          notify({
            title: '回滚成功',
            description: `已回滚到指定版本。`,
            variant: 'success',
          })
          setRollingBackId(null)
        },
        onError: (err) => {
          notify({
            title: '回滚失败',
            description: err instanceof Error ? err.message : '请稍后重试。',
            variant: 'error',
          })
          setRollingBackId(null)
        },
      },
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="version-history-desc"
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(36rem,calc(100vw-2rem))] max-h-[70vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface-elevated shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <Dialog.Title className="text-lg font-semibold text-foreground">
                版本历史
              </Dialog.Title>
              <span className="text-sm text-muted-foreground">— {nodeName}</span>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only" id="version-history-desc">
            查看和管理记忆节点的版本历史
          </Dialog.Description>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">加载版本历史...</span>
              </div>
            ) : !versions || versions.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">暂无版本记录</div>
            ) : (
              <div className="space-y-2">
                {versions.map((version, i) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    isLatest={i === 0}
                    onRollback={handleRollback}
                    isRollingBack={rollingBackId === version.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-border px-6 py-3">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm">
                关闭
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
