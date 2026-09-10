import type { LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { DUR, EASE } from '@/shared/lib/motion'

export interface NavItemLinkProps {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
  /** 图标列模式：只渲染图标，文字改由 title 提示 */
  collapsed?: boolean
  /** 传入后 active 指示条在同组导航项之间滑动（motion layoutId） */
  indicatorLayoutId?: string
  onClick?: () => void
  /**
   * 精确匹配当前路由。TanStack 的 Link 默认按前缀判定并写入
   * `aria-current="page"`，会让父级路径在所有子页上都被读屏当作当前页。
   */
  exact?: boolean
}

/**
 * 主侧栏 / 移动抽屉 / 设置子导航共用的导航项。
 * 激活态（`bg-primary/10 text-primary`）此前在 4 处各写一遍，这里是唯一出口。
 */
export function NavItemLink({
  to,
  icon: Icon,
  label,
  active,
  collapsed = false,
  indicatorLayoutId,
  onClick,
  exact = false,
}: NavItemLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      activeOptions={
        exact ? { exact: true, includeSearch: false } : undefined
      }
      className={cn(
        'relative flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        collapsed && 'justify-center',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {active && indicatorLayoutId ? (
        <motion.span
          layoutId={indicatorLayoutId}
          transition={{ duration: DUR.base, ease: EASE }}
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      ) : null}
      <Icon className="size-[18px] shrink-0" />
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  )
}
