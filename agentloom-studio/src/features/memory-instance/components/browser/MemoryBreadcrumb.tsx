import { Fragment } from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

interface BreadcrumbItem {
  path: string
  label: string
}

interface MemoryBreadcrumbProps {
  items: BreadcrumbItem[]
  onNavigate: (path: string, domain?: string) => void
}

export function MemoryBreadcrumb({ items, onNavigate }: MemoryBreadcrumbProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onNavigate('')}
        aria-label="返回根路径"
        title="返回根路径"
        className="text-muted-foreground hover:text-primary"
      >
        <Home size={14} />
      </Button>

      {items.map((crumb, i) => (
        <Fragment key={crumb.path}>
          <ChevronRight size={12} className="shrink-0 text-muted-foreground/50" />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigate(crumb.path)}
            className={cn(
              'h-auto px-2 py-1 transition-all',
              i === items.length - 1
                ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {crumb.label}
          </Button>
        </Fragment>
      ))}
    </div>
  )
}
