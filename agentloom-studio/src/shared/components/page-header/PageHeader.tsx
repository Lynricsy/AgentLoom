import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface BreadcrumbItem {
  label: string
  /** 省略则渲染为纯文本（当前页） */
  to?: string
  params?: Record<string, string>
}

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  /** 图标芯片着色，默认品牌色；可传 `var(--color-node-agent)` 等类别色 */
  tone?: string
  actions?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  className?: string
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  tone,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const accent = tone ?? 'var(--color-primary)'

  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {breadcrumb?.length ? (
        <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1 text-xs text-muted">
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" /> : null}
              {item.to ? (
                <Link
                  to={item.to}
                  params={item.params}
                  className="transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-card"
              style={{
                backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                color: accent,
              }}
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}

          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
            {description ? (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
