import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { DUR, EASE } from '@/shared/lib/motion'
import { NAV_GROUPS, type NavItem } from './navigation'

/** active 指示条共享 layoutId，切换路由时在各项之间滑动 */
const INDICATOR_LAYOUT_ID = 'app-nav-indicator'

export interface SidebarNavProps {
  pathname: string
  /** 图标列模式：隐藏文字与分组标题 */
  collapsed?: boolean
  /** 分组折叠状态；collapsed 模式下忽略 */
  groupExpanded?: Record<string, boolean>
  onToggleGroup?: (groupId: string) => void
  /** 点击导航项后的回调，移动端用于关闭抽屉 */
  onNavigate?: () => void
  /** 指示条 layoutId 前缀，避免侧栏与移动抽屉同时挂载时争抢同一个 id */
  indicatorScope?: string
}

export function SidebarNav({
  pathname,
  collapsed = false,
  groupExpanded,
  onToggleGroup,
  onNavigate,
  indicatorScope = 'sidebar',
}: SidebarNavProps) {
  return (
    <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-2">
      {NAV_GROUPS.map((group) => {
        const groupActive = group.items.some((item) =>
          pathname.startsWith(item.matchPrefix),
        )
        const expanded = collapsed || (groupExpanded?.[group.id] ?? true)

        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div
                aria-hidden
                className="mx-auto my-1 h-px w-6 bg-border first:hidden"
              />
            ) : (
              <button
                type="button"
                onClick={() => onToggleGroup?.(group.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                  groupActive
                    ? 'text-muted'
                    : 'text-muted-foreground hover:text-muted',
                )}
              >
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  size={12}
                  className={cn(
                    'shrink-0 transition-transform duration-200',
                    expanded ? 'rotate-0' : '-rotate-90',
                  )}
                />
              </button>
            )}

            {expanded
              ? group.items.map((item) => (
                  <SidebarNavLink
                    key={item.to}
                    item={item}
                    active={pathname.startsWith(item.matchPrefix)}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                    indicatorScope={indicatorScope}
                  />
                ))
              : null}
          </div>
        )
      })}
    </nav>
  )
}

interface SidebarNavLinkProps {
  item: NavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
  indicatorScope: string
}

function SidebarNavLink({
  item,
  active,
  collapsed,
  onNavigate,
  indicatorScope,
}: SidebarNavLinkProps) {
  const Icon = item.icon

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
        collapsed && 'justify-center',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted hover:bg-surface-elevated hover:text-foreground',
      )}
    >
      {active ? (
        <motion.span
          layoutId={`${indicatorScope}-${INDICATOR_LAYOUT_ID}`}
          transition={{ duration: DUR.base, ease: EASE }}
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      ) : null}
      <Icon size={18} className="shrink-0" />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  )
}
