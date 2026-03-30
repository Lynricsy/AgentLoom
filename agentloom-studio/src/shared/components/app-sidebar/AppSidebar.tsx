import { useCallback, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Compass,
  Container,
  Cpu,
  FolderOpen,
  Server,
  Settings,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { NotificationBell } from '@/features/notification'
import { UserMenu } from './UserMenu'

const STORAGE_KEY = 'agentloom-sidebar-collapsed'
const GROUP_EXPANDED_KEY = 'agentloom-sidebar-group-expanded'

interface NavItem {
  label: string
  icon: typeof Workflow
  to: string
  params?: Record<string, string>
  matchPrefix: string
}

interface NavGroup {
  label: string
  icon: typeof Workflow
  matchPrefix: string
  children: NavItem[]
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

const NAV_GROUPS: NavGroup[] = [
  {
    label: '资源',
    icon: Server,
    matchPrefix: '/resources',
    children: [
      {
        label: 'MCP Servers',
        icon: Server,
        to: '/resources/mcp-servers',
        matchPrefix: '/resources/mcp-servers',
      },
      {
        label: 'LLM Models',
        icon: Cpu,
        to: '/resources/llm-models',
        matchPrefix: '/resources/llm-models',
      },
      {
        label: 'Skills',
        icon: Sparkles,
        to: '/resources/skills',
        matchPrefix: '/resources/skills',
      },
      {
        label: 'Knowledge Bases',
        icon: BookOpen,
        to: '/resources/knowledge-bases',
        matchPrefix: '/resources/knowledge-bases',
      },
      {
        label: 'Memory',
        icon: BrainCircuit,
        to: '/resources/memory-instances',
        matchPrefix: '/resources/memory-instances',
      },
      {
        label: 'Workspaces',
        icon: FolderOpen,
        to: '/resources/workspaces',
        matchPrefix: '/resources/workspaces',
      },
      {
        label: 'Sandboxes',
        icon: Container,
        to: '/resources/sandboxes',
        matchPrefix: '/resources/sandboxes',
      },
    ],
  },
]

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function getInitialGroupExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUP_EXPANDED_KEY)
    if (raw) return JSON.parse(raw) as Record<string, boolean>
  } catch {
    /* noop */
  }
  return {}
}

function persistGroupExpanded(state: Record<string, boolean>) {
  try {
    localStorage.setItem(GROUP_EXPANDED_KEY, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const [groupExpanded, setGroupExpanded] = useState(getInitialGroupExpanded)
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setGroupExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      persistGroupExpanded(next)
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
        {/* Flat nav items */}
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

        {/* Nav groups */}
        {NAV_GROUPS.map((group) => {
          const groupActive = isActive(group.matchPrefix)
          const expanded = groupExpanded[group.matchPrefix] ?? groupActive
          const GroupIcon = group.icon

          // When sidebar is collapsed, show children directly as icon-only items
          if (collapsed) {
            return group.children.map((child) => {
              const childActive = isActive(child.matchPrefix)
              const ChildIcon = child.icon
              return (
                <Link
                  key={child.to}
                  to={child.to}
                  className={`group relative flex items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                    childActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                  }`}
                  title={child.label}
                >
                  {childActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <ChildIcon size={18} className="shrink-0" />
                </Link>
              )
            })
          }

          return (
            <div key={group.matchPrefix}>
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.matchPrefix)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  groupActive
                    ? 'text-primary/80'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <GroupIcon size={16} className="shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {expanded ? (
                  <ChevronDown size={14} className="shrink-0" />
                ) : (
                  <ChevronRight size={14} className="shrink-0" />
                )}
              </button>

              {/* Group children with collapse animation */}
              <div
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{
                  maxHeight: expanded ? `${group.children.length * 40}px` : '0px',
                  opacity: expanded ? 1 : 0,
                }}
              >
                {group.children.map((child) => {
                  const childActive = isActive(child.matchPrefix)
                  const ChildIcon = child.icon
                  return (
                    <Link
                      key={child.to}
                      to={child.to}
                      className={`group relative flex items-center gap-3 rounded-lg py-1.5 pl-5 pr-2 text-sm font-medium transition-colors ${
                        childActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                      }`}
                    >
                      {childActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                      )}
                      <ChildIcon size={16} className="shrink-0" />
                      <span className="truncate">{child.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
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
