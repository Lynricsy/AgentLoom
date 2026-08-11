import { memo, useCallback } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { useAllWorkspaces } from '@/features/workspace'
import { NativeSelect } from '@/shared/ui/native-select'

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
    <div className="space-y-4 px-4 py-4" data-testid="workspace-config-panel">
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-teal-400" />
        <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-400">
          Workspace
        </span>
      </div>

      {/* Workspace selector */}
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <label htmlFor="workspace-select">选择工作区</label>
          <span className="text-error">*</span>
        </span>
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
          <NativeSelect
            aria-label="选择工作区"
            id="workspace-select"
            value={currentId}
            onValueChange={handleSelect}
          >
            <option value="">请选择工作区</option>
            {readyWorkspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} · {formatSize(ws.sizeBytes)}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      {/* Selected workspace details */}
      {selectedWorkspace && (
        <div
          className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs"
          data-testid="workspace-details"
        >
          <p className="font-medium text-foreground">{selectedWorkspace.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>大小: {formatSize(selectedWorkspace.sizeBytes)}</span>
            <span>·</span>
            <span className="text-green-400">{selectedWorkspace.status}</span>
          </div>
          {selectedWorkspace.description && (
            <p className="text-muted-foreground">{selectedWorkspace.description}</p>
          )}
          <p className="break-all text-muted">ID: {currentId}</p>
        </div>
      )}

      {/* Missing workspace warning */}
      {showMissingWarning && (
        <div
          className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
          data-testid="workspace-missing-warning"
        >
          <p className="font-medium text-amber-700 dark:text-amber-300">
            当前已选择的工作区不可用或已删除，请重新选择。
          </p>
          <p className="break-all text-amber-700/80 dark:text-amber-200/80">ID: {currentId}</p>
        </div>
      )}
    </div>
  )
})
