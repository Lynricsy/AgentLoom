import { memo } from 'react'
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
  // Body 只在外层 shell 的 full LOD 下渲染，这里不再按 zoom 二次降级

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
      <FolderOpen className="h-4 w-4 shrink-0 text-primary/80" />

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
    </div>
  )
})
