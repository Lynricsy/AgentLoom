import { memo, useCallback } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAllWorkspaces } from '@/features/workspace'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Badge } from '@/shared/ui/badge'
import { Skeleton } from '@/shared/ui/skeleton'
import { formatBytes } from '@/shared/lib/format'
import { Alert } from '@/shared/ui/alert'

interface WorkspaceConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

export const WorkspaceConfigPanel = memo(function WorkspaceConfigPanel({
  config,
  onApply,
}: WorkspaceConfigPanelProps) {
  const { data, isLoading } = useAllWorkspaces()
  const allWorkspaces = data ?? []
  const readyWorkspaces = allWorkspaces.filter((ws) => ws.status === 'ready')

  const currentId = typeof config.workspaceId === 'string' ? config.workspaceId : ''
  const selectedWorkspace = readyWorkspaces.find((ws) => ws.id === currentId)
  const showMissingWarning = Boolean(currentId) && !selectedWorkspace && !isLoading

  const handleSelect = useCallback(
    (selectedId: string) => {
      if (!selectedId) {
        onApply({ config: {} })
        return
      }

      const selected = readyWorkspaces.find((ws) => ws.id === selectedId)
      if (!selected) return

      onApply({
        config: {
          workspaceId: selected.id,
          workspaceName: selected.name,
        },
        label: selected.name,
      })
    },
    [readyWorkspaces, onApply],
  )

  return (
    <div className="space-y-5 px-4 py-4" data-testid="workspace-config-panel">
      <div className="flex items-center gap-2">
        <FolderOpen className="size-4 shrink-0 text-type-volume" />
        <Badge tone="var(--color-type-volume)">Workspace</Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="workspace-select"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
        >
          选择工作区
          <span className="text-error">*</span>
        </label>
        {isLoading ? (
          <div role="status">
            <Skeleton className="h-9 w-full" />
            <span className="sr-only">加载中…</span>
          </div>
        ) : readyWorkspaces.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            暂无可用工作区，请先创建一个工作区。
          </p>
        ) : (
          <Select value={currentId} onValueChange={handleSelect}>
            <SelectTrigger aria-label="选择工作区" id="workspace-select">
              <SelectValue placeholder="请选择工作区" />
            </SelectTrigger>
            <SelectContent>
              {readyWorkspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name} · {formatBytes(ws.sizeBytes ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedWorkspace && (
        <div
          className="space-y-2 rounded-lg border border-border bg-muted p-3 text-xs"
          data-testid="workspace-details"
        >
          <p className="break-words font-medium text-foreground">{selectedWorkspace.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="tabular-nums">大小：{formatBytes(selectedWorkspace.sizeBytes ?? 0)}</span>
            <span>·</span>
            <span className="text-success">{selectedWorkspace.status}</span>
          </div>
          {selectedWorkspace.description && (
            <p className="break-words text-muted-foreground">{selectedWorkspace.description}</p>
          )}
          <p className="truncate font-mono text-muted-foreground" title={currentId}>
            ID：{currentId}
          </p>
        </div>
      )}

      {showMissingWarning && (
        <Alert
          variant="warning"
          title="当前已选择的工作区不可用或已删除，请重新选择。"
          data-testid="workspace-missing-warning"
        >
          <p className="break-all font-mono text-xs">ID：{currentId}</p>
        </Alert>
      )}
    </div>
  )
})
