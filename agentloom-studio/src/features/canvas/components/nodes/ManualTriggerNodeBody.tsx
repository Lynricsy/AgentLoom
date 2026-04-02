import { memo } from 'react'
import { Play } from 'lucide-react'
import { parseManualTriggerConfig } from '../../types/trigger.types'

interface ManualTriggerNodeBodyProps {
  config: Record<string, unknown>
}

export const ManualTriggerNodeBody = memo(function ManualTriggerNodeBody({
  config,
}: ManualTriggerNodeBodyProps) {
  const { outputFields } = parseManualTriggerConfig(config)

  return (
    <div className="flex flex-col gap-1" data-testid="manual-trigger-node-body">
      <div className="flex items-center gap-1.5">
        <Play className="h-3 w-3 text-warning" />
        <span className="text-[10px] text-muted-foreground">
          {outputFields.length > 0
            ? `${outputFields.length} 个输入参数`
            : '点击执行以手动触发工作流'}
        </span>
      </div>
    </div>
  )
})
