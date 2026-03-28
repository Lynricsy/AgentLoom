import { memo } from 'react'
import { Container } from 'lucide-react'
import type { CanvasNodeData } from '../../types'

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
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
          Sandbox
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isPersistent
              ? 'bg-blue-500/10 text-blue-400'
              : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          {isPersistent ? '持久' : '临时'}
        </span>
        {(inputCount > 0 || outputCount > 0) && (
          <span className="ml-auto shrink-0 text-[10px] text-muted">
            {inputCount}入 / {outputCount}出
          </span>
        )}
      </div>
      {isPersistent ? (
        <span className="text-[10px] text-muted">
          {persistentSandboxName || '未选择沙箱'}
        </span>
      ) : (
        <span className="text-[10px] text-muted">
          {cpu}C / {memory}M / {disk}G
        </span>
      )}
      {data.description && (
        <span className="truncate text-xs text-muted-foreground">{data.description}</span>
      )}
    </div>
  )
})
