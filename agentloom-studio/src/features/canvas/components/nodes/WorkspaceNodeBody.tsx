import { memo } from 'react'
import { useViewport } from '@xyflow/react'
import { FolderOpen } from 'lucide-react'
import { NodeBadge } from '../shared/NodeBadge'

function readStringValue(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = config[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function isWorkspaceConfigured(config: Record<string, unknown>): boolean {
  return !!readStringValue(config, 'workspaceId')
}

export const WorkspaceNodeBody = memo(function WorkspaceNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const { zoom } = useViewport()

  const isHighDetail = zoom >= 0.7
  const isMedDetail = zoom >= 0.4

  const configured = isWorkspaceConfigured(config)
  const workspaceName =
    readStringValue(config, 'workspaceName') ??
    readStringValue(config, 'label') ??
    'Workspace'

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid="workspace-node-body"
    >
      {/* Icon -- always visible */}
      <FolderOpen className="h-4 w-4 shrink-0 text-primary/80" />

      {/* Low LOD: just the label */}
      {!isMedDetail && (
        <span className="text-[11px] leading-tight text-muted-foreground">
          Workspace
        </span>
      )}

      {/* Medium LOD: + workspace name */}
      {isMedDetail && !isHighDetail && (
        <span
          className="max-w-[100px] truncate text-[11px] leading-tight text-muted-foreground"
          data-testid="workspace-name"
        >
          {configured ? workspaceName : '未配置'}
        </span>
      )}

      {/* High LOD: workspace name + badge */}
      {isHighDetail && (
        <>
          <span
            className="max-w-[120px] truncate leading-tight text-foreground"
            data-testid="workspace-name"
          >
            {configured ? workspaceName : '未配置'}
          </span>

          {configured && (
            <NodeBadge variant="status" color="primary">
              Workspace
            </NodeBadge>
          )}
        </>
      )}
    </div>
  )
})
