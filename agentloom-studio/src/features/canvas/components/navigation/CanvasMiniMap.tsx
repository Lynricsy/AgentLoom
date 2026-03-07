import { memo, useCallback } from 'react'
import { MiniMap } from '@xyflow/react'
import { Minimize2, Maximize2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { CanvasNode } from '../../types'
import { NODE_CATEGORIES } from '../nodeCategories'
import { useCanvasActions, useIsMiniMapCollapsed } from '../../stores/canvasStore'

export const CanvasMiniMap = memo(function CanvasMiniMap() {
  const isMiniMapCollapsed = useIsMiniMapCollapsed()
  const { toggleMiniMap } = useCanvasActions()

  const getMiniMapNodeColor = useCallback(
    (node: CanvasNode) => NODE_CATEGORIES[node.data.category]?.color ?? 'var(--color-surface-elevated)',
    []
  )

  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 z-20 rounded-lg border bg-surface shadow-md transition-all',
        isMiniMapCollapsed ? 'h-8 w-8' : 'h-[140px] w-[200px]'
      )}
      data-testid="canvas-minimap"
    >
      <button
        type="button"
        onClick={toggleMiniMap}
        className="absolute right-1 top-1 z-30 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={isMiniMapCollapsed ? '展开小地图' : '折叠小地图'}
      >
        {isMiniMapCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
      </button>
      {!isMiniMapCollapsed && (
        <MiniMap
          className="!bg-transparent !border-0 !shadow-none !m-0 !p-0 !static !h-full !w-full"
          nodeColor={getMiniMapNodeColor}
          maskColor="rgba(0,0,0,0.6)"
          pannable
          zoomable
        />
      )}
    </div>
  )
})
