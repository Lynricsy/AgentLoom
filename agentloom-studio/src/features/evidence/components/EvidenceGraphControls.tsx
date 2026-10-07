import { memo } from 'react'
import { Maximize, RefreshCw } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'

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
        'flex items-center gap-1 rounded-lg border border-border/60 bg-surface/80 p-1',
        className,
      )}
      data-testid="evidence-graph-controls"
    >
      <Tabs
        value={layoutMode}
        defaultValue="dagre"
        onValueChange={(value) => onLayoutChange(value as LayoutMode)}
      >
        <TabsList className="w-auto p-0.5">
          <TabsTrigger
            value="dagre"
            className="flex-none px-2 py-1 text-2xs"
            aria-label="层级布局"
            data-testid="layout-dagre"
          >
            层级
          </TabsTrigger>
          <TabsTrigger
            value="force"
            className="flex-none px-2 py-1 text-2xs"
            aria-label="力导向布局"
            data-testid="layout-force"
          >
            力导向
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mx-0.5 h-4 w-px bg-border/60" />

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onFitView}
        className="text-muted-foreground hover:text-foreground"
        aria-label="适应视图"
        data-testid="fit-view"
      >
        <Maximize />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          'text-muted-foreground hover:text-foreground',
          isRefreshing && 'animate-spin',
        )}
        aria-label="刷新"
        data-testid="refresh-graph"
      >
        <RefreshCw />
      </Button>
    </div>
  )
})
