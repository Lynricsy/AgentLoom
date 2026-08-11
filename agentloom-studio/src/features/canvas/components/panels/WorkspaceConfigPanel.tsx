import { memo, useCallback } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { useAllWorkspaces } from '@/features/workspace'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

interface WorkspaceConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
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
        <FolderOpen className="h-4 w-4 text-type-volume" />
        <span className="rounded-full bg-type-volume/10 px-2 py-0.5 text-xs font-medium text-type-volume">
          Workspace
        </span>
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>加载中...</span>
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
                  {ws.name} · {formatSize(ws.sizeBytes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedWorkspace && (
        <div
          className="space-y-2 rounded-card border border-border bg-surface-elevated p-3 text-xs"
          data-testid="workspace-details"
        >
          <p className="font-medium text-foreground">{selectedWorkspace.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>大小: {formatSize(selectedWorkspace.sizeBytes)}</span>
            <span>·</span>
            <span className="text-success">{selectedWorkspace.status}</span>
          </div>
          {selectedWorkspace.description && (
            <p className="text-muted-foreground">{selectedWorkspace.description}</p>
          )}
          <p className="break-all text-muted">ID: {currentId}</p>
        </div>
      )}

      {showMissingWarning && (
        <div
          className="space-y-2 rounded-card border border-warning/30 bg-warning/10 p-3 text-xs"
          data-testid="workspace-missing-warning"
        >
          <p className="font-medium text-warning">
            当前已选择的工作区不可用或已删除，请重新选择。
          </p>
          <p className="break-all text-warning/80">ID: {currentId}</p>
        </div>
      )}
    </div>
  )
})
