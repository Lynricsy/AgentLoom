import { memo } from 'react'
import { BrainCircuit } from 'lucide-react'
import { NodeBadge } from '../shared/NodeBadge'

// -- helpers ----------------------------------------------------------------

function readStringValue(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = config[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function readNumericValue(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = config[key]
  return typeof v === 'number' ? v : undefined
}

function isMemoryConfigured(config: Record<string, unknown>): boolean {
  return !!readStringValue(config, 'memoryInstanceId')
}

// -- component --------------------------------------------------------------

export const MemoryNodeBody = memo(function MemoryNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  // Body 只在外层 shell 的 full LOD 下渲染，这里不再按 zoom 二次降级

  const configured = isMemoryConfigured(config)
  const instanceName =
    readStringValue(config, 'memoryInstanceName') ??
    readStringValue(config, 'label') ??
    'Memory'
  const role = readStringValue(config, 'role') ?? 'primary'
  const priority = readNumericValue(config, 'fusionPriority') ?? 1

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid="memory-node-body"
    >
      <BrainCircuit className="h-4 w-4 shrink-0 text-primary/80" />

      <span
        className="max-w-[120px] truncate leading-tight text-foreground"
        data-testid="memory-instance-name"
      >
        {configured ? instanceName : '未配置'}
      </span>

      {configured && (
        <div className="flex items-center gap-1">
          <span data-testid="memory-role-badge">
            <NodeBadge
              variant="status"
              color={role === 'primary' ? 'primary' : 'default'}
            >
              {role}
            </NodeBadge>
          </span>
          <span
            className="text-[11px] leading-tight text-muted-foreground"
            data-testid="memory-priority"
          >
            P{priority}
          </span>
        </div>
      )}
    </div>
  )
})
