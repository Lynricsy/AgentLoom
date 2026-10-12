import { memo } from 'react'
import { Container } from 'lucide-react'
import type { CanvasNodeData } from '../../types'
import { NodeBadge } from '../shared/NodeBadge'

interface SandboxNodeBodyProps {
  data: CanvasNodeData
}

export const SandboxNodeBody = memo(function SandboxNodeBody({ data }: SandboxNodeBodyProps) {
  const inputCount = Array.isArray(data.inputPorts) ? data.inputPorts.length : 0
  const outputCount = Array.isArray(data.outputPorts) ? data.outputPorts.length : 0

  const lifecycleMode = data.config?.lifecycleMode as string | undefined
  const isPersistent = lifecycleMode === 'persistent'

  const cpu = (data.config?.cpu as number) ?? 1
  const memory = (data.config?.memory as number) ?? 512
  const disk = (data.config?.disk as number) ?? 2
  const persistentSandboxName = (data.config?.persistentSandboxName as string) ?? ''

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Container className="h-3.5 w-3.5 shrink-0 text-info" />
        <NodeBadge variant="status" color="info" className="shrink-0">
          Sandbox
        </NodeBadge>
        <NodeBadge
          variant="status"
          color={isPersistent ? 'info' : 'warning'}
          className="shrink-0"
        >
          {isPersistent ? '持久' : '临时'}
        </NodeBadge>
        {(inputCount > 0 || outputCount > 0) && (
          <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
            {inputCount}入 / {outputCount}出
          </span>
        )}
      </div>
      {isPersistent ? (
        <span className="block truncate text-2xs text-muted-foreground">
          {persistentSandboxName || '未选择沙箱'}
        </span>
      ) : (
        <span className="block truncate text-2xs tabular-nums text-muted-foreground">
          {cpu}C / {memory}M / {disk}G
        </span>
      )}
      {data.description && (
        <span className="truncate text-2xs text-muted-foreground">{data.description}</span>
      )}
    </div>
  )
})
