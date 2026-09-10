import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { NavItemLink } from './NavItemLink'
import { filterNavGroupsByRole, type NavRole } from './navigation'

/** active 指示条共享 layoutId，切换路由时在各项之间滑动 */
const INDICATOR_LAYOUT_ID = 'app-nav-indicator'

export interface SidebarNavProps {
  pathname: string
  /** 当前租户角色，决定按角色收敛的入口是否渲染 */
  role: NavRole | null
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
  role,
  collapsed = false,
  groupExpanded,
  onToggleGroup,
  onNavigate,
  indicatorScope = 'sidebar',
}: SidebarNavProps) {
  return (
    <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-2">
      {filterNavGroupsByRole(role).map((group) => {
        const expanded = collapsed || (groupExpanded?.[group.id] ?? true)

        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div
                aria-hidden
                className="mx-auto my-1 h-px w-6 bg-border first:hidden"
              />
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onToggleGroup?.(group.id)}
                className="w-full justify-start px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-transparent"
              >
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={cn(
                    'size-3 shrink-0 transition-transform duration-200',
                    expanded ? 'rotate-0' : '-rotate-90',
                  )}
                />
              </Button>
            )}

            {expanded
              ? group.items.map((item) => (
                  <NavItemLink
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    active={pathname.startsWith(item.matchPrefix)}
                    collapsed={collapsed}
                    onClick={onNavigate}
                    indicatorLayoutId={`${indicatorScope}-${INDICATOR_LAYOUT_ID}`}
                  />
                ))
              : null}
          </div>
        )
      })}
    </nav>
  )
}
