import { Outlet, useRouterState } from '@tanstack/react-router'
import {
  FileText,
  LayoutDashboard,
  Lock,
  MonitorCog,
  Shield,
  SlidersHorizontal,
  KeyRound,
  Activity,
  Server,
  Gauge,
  Bell,
  Building2,
} from 'lucide-react'
import { NavItemLink } from '@/shared/components/app-sidebar/NavItemLink'

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
      { label: '个人偏好', to: '/settings/preferences', icon: SlidersHorizontal, matchPrefix: '/settings/preferences' },
      { label: 'API Token', to: '/settings/api-tokens', icon: KeyRound, matchPrefix: '/settings/api-tokens' },
      { label: '通知', to: '/settings/notifications', icon: Bell, matchPrefix: '/settings/notifications' },
      { label: '组织', to: '/settings/organization', icon: Building2, matchPrefix: '/settings/organization' },
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

/**
 * 设置区二级布局。
 *
 * 设置区不再替换主侧栏：主侧栏由 `__root` 常驻，这里只提供二级子导航 +
 * `<Outlet />`。因此也不再需要「返回工作台」链接、壳层「设置」标题，
 * 以及小屏 fixed 顶条带来的 56px 让位补偿。
 */
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
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-[var(--spacing-settings-nav)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <nav
          aria-label="设置导航"
          className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] lg:flex-col lg:gap-4 lg:px-2 lg:py-4"
        >
          {SETTINGS_GROUPS.map((group) => (
            // 小屏用 contents 摊平分组，让所有导航项成为横向条的直接子项
            <div key={group.label} className="contents lg:flex lg:flex-col lg:gap-0.5">
              <p className="hidden px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground lg:block">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavItemLink
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.matchPrefix)}
                  exact
                  indicatorLayoutId={INDICATOR_LAYOUT_ID}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
