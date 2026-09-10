import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { BreadcrumbItem } from '@/shared/components/page-header/PageHeader'

export interface WorkbenchHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** 最后一项由 title 表达，这里只渲染祖先层级 */
  breadcrumb?: BreadcrumbItem[]
  /** 标题左侧插槽：返回按钮、实体图标等 */
  leading?: ReactNode
  /** 标题右侧、操作区左侧的状态插槽 */
  status?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * 工作台型页面（画布、会话、执行调试）的 56px 头条。
 *
 * 与 `PageHeader` 的分工：文档型页面用 `PageContainer` + `PageHeader`
 * （大标题、可滚动）；工作台型页面主体是不滚动的操作区，头条必须固定且紧凑。
 * 全站 `<h1>` 只由这两个组件产生。
 */
export function WorkbenchHeader({
  title,
  description,
  breadcrumb,
  leading,
  status,
  actions,
  className,
}: WorkbenchHeaderProps) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6',
        className,
      )}
    >
      {leading}

      {breadcrumb?.length ? (
        <nav
          aria-label="面包屑"
          className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"
        >
          {breadcrumb.map((item, index) => (
            <span
              key={`${item.label}-${index}`}
              className="flex items-center gap-1"
            >
              {index > 0 ? (
                <ChevronRight className="size-3 shrink-0" />
              ) : null}
              {item.to ? (
                <Link
                  to={item.to}
                  params={item.params}
                  className="transition-colors duration-150 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </span>
          ))}
          <ChevronRight className="size-3 shrink-0" />
        </nav>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {status}

      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
