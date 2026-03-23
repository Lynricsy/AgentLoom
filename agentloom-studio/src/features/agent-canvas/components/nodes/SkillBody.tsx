import { memo } from 'react'
import { useViewport } from '@xyflow/react'
import { BookOpenText } from 'lucide-react'
import type { CanvasNodeData } from '@/features/canvas/types'

interface SkillBodyProps {
  data: CanvasNodeData
}

export const SkillBody = memo(function SkillBody({ data }: SkillBodyProps) {
  const { zoom } = useViewport()
  const config = data.config ?? {}

  const skillId = typeof config.skillId === 'string' ? config.skillId : ''
  const skillName = typeof config.skillName === 'string' ? config.skillName : ''
  const skillDescription =
    typeof config.skillDescription === 'string' ? config.skillDescription : ''

  if (!skillId) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <BookOpenText className="h-3.5 w-3.5 shrink-0" />
        <span>选择 Skill</span>
      </div>
    )
  }

  const displayName = skillName || skillId
  const lod = zoom >= 0.7 ? 'high' : zoom >= 0.4 ? 'medium' : 'low'

  if (lod === 'low') {
    return (
      <div className="flex items-center gap-2">
        <BookOpenText className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate text-xs font-medium text-foreground">
          {displayName}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <BookOpenText className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate text-xs font-medium text-foreground">
          {displayName}
        </span>
      </div>
      {lod === 'high' && skillDescription && (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">
          {skillDescription}
        </p>
      )}
    </div>
  )
})
