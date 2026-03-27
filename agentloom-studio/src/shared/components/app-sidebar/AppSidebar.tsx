import { useCallback, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Bot,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Code,
  Compass,
  Settings,
  Workflow,
} from 'lucide-react'
import { NotificationBell } from '@/features/notification'
import { UserMenu } from './UserMenu'

const STORAGE_KEY = 'agentloom-sidebar-collapsed'

interface NavItem {
  label: string
  icon: typeof Workflow
  to: string
  params?: Record<string, string>
  matchPrefix: string
}

const NAV_ITEMS: NavItem[] = [
  {
    label: '工作流',
    icon: Workflow,
    to: '/workflows',
    matchPrefix: '/workflows',
  },
  {
    label: 'Agent',
    icon: Bot,
    to: '/agents',
    matchPrefix: '/agents',
  },
  {
    label: '知识库',
    icon: BookOpen,
    to: '/memory',
    matchPrefix: '/memory',
  },
  {
    label: '发现',
    icon: Compass,
    to: '/templates',
    matchPrefix: '/templates',
  },
  {
    label: '开发者',
    icon: Code,
    to: '/developer-console/earnings',
    matchPrefix: '/developer-console',
  },
]

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const isActive = (prefix: string) => pathname.startsWith(prefix)

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-xl"
      style={{
        width: collapsed ? 56 : 200,
        transition: 'width 250ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Logo + collapse */}
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && (
          <span className="bg-gradient-to-r from-primary to-[#8B5CF6] bg-clip-text text-sm font-bold text-transparent">
            AgentLoom
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.matchPrefix)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              params={item.params ?? {}}
              className={`group relative flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-surface-elevated hover:text-foreground'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {/* active indicator */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
              )}
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
        {/* Settings */}
        <Link
          to="/settings/tool-library"
          className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
            isActive('/settings')
              ? 'bg-primary/10 text-primary'
              : 'text-muted hover:bg-surface-elevated hover:text-foreground'
          }`}
          title={collapsed ? '设置' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>设置</span>}
        </Link>

        {/* Notifications */}
        <div
          className={`flex items-center ${collapsed ? 'justify-center' : 'px-2'}`}
          title={collapsed ? '通知' : undefined}
        >
          <NotificationBell />
        </div>

        {/* User */}
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  )
}
