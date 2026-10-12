import { memo, useCallback } from 'react'
import { MiniMap } from '@xyflow/react'
import { AnimatePresence, motion } from 'motion/react'
import { Minimize2, Maximize2 } from 'lucide-react'
import { fadeIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { CANVAS_FLOATING_CLASS } from '../canvasChrome'
import type { CanvasNode } from '../../types'
import { NODE_CATEGORIES } from '../nodeCategories'
import { useCanvasActions, useIsMiniMapCollapsed } from '../../stores/canvasStore'

export const CanvasMiniMap = memo(function CanvasMiniMap() {
  const isMiniMapCollapsed = useIsMiniMapCollapsed()
  const { toggleMiniMap } = useCanvasActions()

  /** 缩略图节点按类别着色，与画布节点保持同一套类别色 */
  const getMiniMapNodeColor = useCallback(
    (node: CanvasNode) =>
      NODE_CATEGORIES[node.data.category]?.color ?? 'var(--color-muted-foreground)',
    [],
  )

  return (
    <div
      className={cn(
        CANVAS_FLOATING_CLASS,
        'absolute bottom-11 right-4 z-20 overflow-hidden transition-[height,width] duration-300 ease-out-expo',
        isMiniMapCollapsed ? 'h-8 w-8' : 'h-[140px] w-[200px]',
      )}
      data-testid="canvas-minimap"
    >
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={toggleMiniMap}
        className="absolute right-px top-px z-30 text-muted-foreground"
        aria-label={isMiniMapCollapsed ? '展开小地图' : '折叠小地图'}
      >
        {isMiniMapCollapsed ? <Maximize2 /> : <Minimize2 />}
      </Button>
      <AnimatePresence initial={false}>
        {isMiniMapCollapsed ? null : (
          <motion.div key="minimap" {...fadeIn} className="h-full w-full">
            <MiniMap
              className="!static !m-0 !h-full !w-full !border-0 !bg-transparent !p-0"
              nodeColor={getMiniMapNodeColor}
              nodeBorderRadius={4}
              maskColor="color-mix(in srgb, var(--color-background) 72%, transparent)"
              pannable
              zoomable
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
