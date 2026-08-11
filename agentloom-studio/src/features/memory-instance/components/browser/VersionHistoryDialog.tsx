import { useState } from 'react'
import { Loader2, History, RotateCcw } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Skeleton } from '@/shared/ui/skeleton'
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
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
        v{version.versionNumber}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {version.mode === 'patch' ? '编辑' : version.mode === 'rollback' ? '回滚' : version.mode}
          </span>
          {isLatest && (
            <Badge size="sm" variant="success">
              最新
            </Badge>
          )}
          <span className="text-[11px] text-muted">
            {new Date(version.createdAt).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {version.content && (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{version.content}</p>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            版本历史
            <span className="text-sm font-normal text-muted">— {nodeName}</span>
          </DialogTitle>
          <DialogDescription>
            查看和管理记忆节点的版本历史
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-card" />
              ))}
            </div>
          ) : !versions || versions.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">暂无版本记录</p>
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
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              关闭
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
