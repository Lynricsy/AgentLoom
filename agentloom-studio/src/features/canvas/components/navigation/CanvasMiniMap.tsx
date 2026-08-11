import { memo, useCallback } from 'react'
import { MiniMap } from '@xyflow/react'
import { Minimize2, Maximize2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { CanvasNode } from '../../types'
import { NODE_CATEGORIES } from '../nodeCategories'
import { useCanvasActions, useIsMiniMapCollapsed } from '../../stores/canvasStore'

export const CanvasMiniMap = memo(function CanvasMiniMap() {
  const isMiniMapCollapsed = useIsMiniMapCollapsed()
  const { toggleMiniMap } = useCanvasActions()

  /** 缩略图节点按类别着色，与画布节点保持同一套类别色 */
  const getMiniMapNodeColor = useCallback(
    (node: CanvasNode) =>
      NODE_CATEGORIES[node.data.category]?.color ?? 'var(--color-surface-elevated)',
    [],
  )

  return (
    <div
      className={cn(
        'absolute bottom-11 right-4 z-20 overflow-hidden rounded-panel border border-border bg-surface/90 shadow-popover backdrop-blur-sm transition-all',
        isMiniMapCollapsed ? 'h-8 w-8' : 'h-[140px] w-[200px]',
      )}
      data-testid="canvas-minimap"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleMiniMap}
        className="absolute right-0.5 top-0.5 z-30 h-7 w-7 text-muted-foreground"
        aria-label={isMiniMapCollapsed ? '展开小地图' : '折叠小地图'}
      >
        {isMiniMapCollapsed ? (
          <Maximize2 className="h-3.5 w-3.5" />
        ) : (
          <Minimize2 className="h-3.5 w-3.5" />
        )}
      </Button>
      {!isMiniMapCollapsed && (
        <MiniMap
          className="!static !m-0 !h-full !w-full !border-0 !bg-transparent !p-0"
          nodeColor={getMiniMapNodeColor}
          nodeBorderRadius={4}
          maskColor="color-mix(in srgb, var(--color-background) 72%, transparent)"
          pannable
          zoomable
        />
      )}
    </div>
  )
})
