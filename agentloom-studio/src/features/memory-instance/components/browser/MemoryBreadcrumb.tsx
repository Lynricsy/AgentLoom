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
    <nav aria-label="记忆路径" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onNavigate('')}
        aria-label="返回根路径"
        className="text-muted-foreground hover:text-primary"
      >
        <Home />
      </Button>

      {items.map((crumb, i) => {
        const isCurrent = i === items.length - 1
        return (
          <Fragment key={crumb.path}>
            <ChevronRight aria-hidden className="size-3 shrink-0 text-subtle-foreground" />
            {/* 所有项都带 1px 边框（非当前项透明），当前项高亮时高度不变 */}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onNavigate(crumb.path)}
              aria-current={isCurrent ? 'page' : undefined}
              title={crumb.label}
              className={cn(
                'max-w-[12rem] shrink-0 border',
                isCurrent
                  ? 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="truncate">{crumb.label}</span>
            </Button>
          </Fragment>
        )
      })}
    </nav>
  )
}
