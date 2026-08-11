import { Link, useRouterState } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  FileText,
  LayoutDashboard,
  Lock,
  MonitorCog,
  Shield,
  KeyRound,
  Activity,
  Server,
  Gauge,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { DUR, EASE } from '@/shared/lib/motion'

/** active 指示条共享 layoutId，切换路由时在各项之间滑动 */
const INDICATOR_LAYOUT_ID = 'settings-nav-indicator'

interface SettingsNavGroup {
  label: string
  items: { label: string; to: string; icon: typeof Lock; matchPrefix: string }[]
}

const SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    label: '通用',
    items: [
      { label: '概览', to: '/settings', icon: LayoutDashboard, matchPrefix: '/settings' },
    ],
  },
  {
    label: '安全',
    items: [
      { label: '安全设置', to: '/settings/security', icon: Shield, matchPrefix: '/settings/security' },
      { label: '加密', to: '/settings/encryption', icon: KeyRound, matchPrefix: '/settings/encryption' },
      { label: '自治策略', to: '/settings/security/autonomy-policy', icon: MonitorCog, matchPrefix: '/settings/security/autonomy-policy' },
    ],
  },
  {
    label: '平台',
    items: [
      { label: '监控', to: '/settings/monitoring', icon: Activity, matchPrefix: '/settings/monitoring' },
      { label: '资源配额', to: '/settings/resource-quotas', icon: Gauge, matchPrefix: '/settings/resource-quotas' },
      { label: '私有部署', to: '/settings/private-deployment', icon: Server, matchPrefix: '/settings/private-deployment' },
    ],
  },
  {
    label: '审计',
    items: [
      { label: '审计日志', to: '/settings/audit-logs', icon: FileText, matchPrefix: '/settings/audit-logs' },
    ],
  },
]

export function SettingsLayout() {
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname

  const isActive = (prefix: string) => {
    // 精确匹配 /settings/security 但不匹配 /settings/security/autonomy-policy
    if (prefix === '/settings/security') {
      return pathname === '/settings/security'
    }
    // 概览仅在精确匹配 /settings 或 /settings/ 时高亮
    if (prefix === '/settings') {
      return pathname === '/settings' || pathname === '/settings/'
    }
    return pathname.startsWith(prefix)
  }

  return (
    <aside
      className={cn(
        'flex border-border bg-surface',
        // ≥lg：220px 竖直侧栏，作为 __root 横向 flex 行的第一个子项
        'lg:h-full lg:w-[220px] lg:shrink-0 lg:flex-col lg:border-r',
        // <lg：顶部固定横向滚动 tab 条。
        // __root.tsx 的外层是横向 flex 行，aside 若留在流内撑满宽度会把内容区挤成 0 宽，
        // 因此小屏用 fixed 让它退出该行布局；对应的 56px 顶部让位由 __root 的内容容器
        // 直接施加（`pt-14 lg:pt-0`），不依赖脆弱的兄弟选择器。
        'max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:z-30 max-lg:h-14 max-lg:w-full',
        'max-lg:flex-row max-lg:items-center max-lg:gap-1 max-lg:border-b max-lg:px-2',
      )}
    >
      {/* 头部：返回 + 「设置」标题；小屏用 contents 摊平进横向条，仅保留返回按钮 */}
      <div className="max-lg:contents lg:px-3 lg:pb-2 lg:pt-4">
        <Link
          to="/"
          aria-label="返回工作台"
          className={cn(
            'flex items-center gap-1.5 rounded-md text-xs font-medium text-muted transition-colors',
            'hover:bg-surface-elevated hover:text-foreground',
            'max-lg:size-9 max-lg:shrink-0 max-lg:justify-center',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
            'lg:w-fit lg:px-1.5 lg:py-1',
          )}
        >
          <ArrowLeft size={14} className="shrink-0" />
          <span className="max-lg:hidden">返回工作台</span>
        </Link>
        {/* 壳层标题：页面自身的 PageHeader 才是 h1，这里只作为侧栏标识，不参与标题层级 */}
        <p className="mt-2 px-1.5 text-base font-semibold tracking-tight text-foreground max-lg:hidden">
          设置
        </p>
        <div aria-hidden className="hidden h-5 w-px shrink-0 bg-border max-lg:block" />
      </div>

      <nav
        aria-label="设置导航"
        className={cn(
          'flex gap-0.5',
          'lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:px-2 lg:pb-3',
          // 小屏横向滚动；隐藏滚动条以免吃掉 56px 条高
          'max-lg:min-w-0 max-lg:flex-1 max-lg:items-center max-lg:overflow-x-auto',
          'max-lg:[scrollbar-width:none]',
        )}
      >
        {SETTINGS_GROUPS.map((group, groupIndex) => (
          // 小屏用 contents 摊平分组，让所有导航项成为横向条的直接子项
          <div key={group.label} className="max-lg:contents">
            {groupIndex > 0 ? (
              <div
                aria-hidden
                className="hidden h-4 w-px shrink-0 bg-border max-lg:block"
              />
            ) : null}
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground max-lg:hidden">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5 max-lg:contents">
              {group.items.map((item) => {
                const active = isActive(item.matchPrefix)
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    // Link 默认按前缀判定 active 并强制写入 aria-current="page"，
                    // 会让 /settings 在所有子页上都被读屏当作「当前页」；改为精确匹配后
                    // 与上面的视觉高亮一致（忽略 search，避免带查询参数时丢失标记）
                    activeOptions={{ exact: true, includeSearch: false }}
                    className={cn(
                      'relative flex items-center rounded-md text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                      'lg:gap-3 lg:px-2 lg:py-2',
                      'max-lg:h-9 max-lg:shrink-0 max-lg:gap-1.5 max-lg:whitespace-nowrap max-lg:px-2.5',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted hover:bg-surface-elevated hover:text-foreground',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId={INDICATOR_LAYOUT_ID}
                        transition={{ duration: DUR.base, ease: EASE }}
                        // <lg：底部 2px 下划线指示条；≥lg：左侧竖直指示条
                        className={cn(
                          'absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-primary',
                          'lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-1/2 lg:h-5 lg:w-0.5 lg:-translate-y-1/2',
                        )}
                      />
                    ) : null}
                    <Icon size={16} className="shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
