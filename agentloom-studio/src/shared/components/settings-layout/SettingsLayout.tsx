import { Link, useRouterState } from '@tanstack/react-router'
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
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-xl">
      {/* Back button */}
      <div className="flex h-14 items-center px-3">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
        >
          <ArrowLeft size={16} />
          <span>返回</span>
        </Link>
      </div>

      {/* Settings nav groups */}
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item.matchPrefix)
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`relative flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                    )}
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
