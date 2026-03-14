import { memo } from 'react'
import { Maximize, RefreshCw } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type LayoutMode = 'dagre' | 'force'

interface EvidenceGraphControlsProps {
  layoutMode: LayoutMode
  onLayoutChange: (mode: LayoutMode) => void
  onFitView: () => void
  onRefresh: () => void
  isRefreshing?: boolean
  className?: string
}

export const EvidenceGraphControls = memo(function EvidenceGraphControls({
  layoutMode,
  onLayoutChange,
  onFitView,
  onRefresh,
  isRefreshing = false,
  className,
}: EvidenceGraphControlsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg border border-border/60 bg-card/80 p-1',
        className,
      )}
      data-testid="evidence-graph-controls"
    >
      <button
        type="button"
        onClick={() => onLayoutChange('dagre')}
        className={cn(
          'rounded px-2 py-1 text-[10px] font-medium transition',
          layoutMode === 'dagre'
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        aria-label="层级布局"
        data-testid="layout-dagre"
      >
        层级
      </button>

      <button
        type="button"
        onClick={() => onLayoutChange('force')}
        className={cn(
          'rounded px-2 py-1 text-[10px] font-medium transition',
          layoutMode === 'force'
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        aria-label="力导向布局"
        data-testid="layout-force"
      >
        力导向
      </button>

      <div className="mx-0.5 h-4 w-px bg-border/60" />

      <button
        type="button"
        onClick={onFitView}
        className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="适应视图"
        data-testid="fit-view"
      >
        <Maximize className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          'rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground',
          isRefreshing && 'animate-spin',
        )}
        aria-label="刷新"
        data-testid="refresh-graph"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})
