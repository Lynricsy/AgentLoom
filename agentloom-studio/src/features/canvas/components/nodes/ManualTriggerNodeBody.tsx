import { memo } from 'react'
import { Play } from 'lucide-react'

export const ManualTriggerNodeBody = memo(function ManualTriggerNodeBody() {
  return (
    <div className="flex items-center gap-1.5" data-testid="manual-trigger-node-body">
      <Play className="h-3 w-3 text-warning" />
      <span className="text-[10px] text-muted-foreground">点击执行以手动触发工作流</span>
    </div>
  )
})
