import { Fragment } from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

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
      <button
        type="button"
        onClick={() => onNavigate('')}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
      >
        <Home size={14} />
      </button>

      {items.map((crumb, i) => (
        <Fragment key={crumb.path}>
          <ChevronRight size={12} className="shrink-0 text-muted-foreground/50" />
          <button
            type="button"
            onClick={() => onNavigate(crumb.path)}
            className={cn(
              'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-all',
              i === items.length - 1
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {crumb.label}
          </button>
        </Fragment>
      ))}
    </div>
  )
}
