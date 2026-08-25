import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Code2, ShieldAlert } from 'lucide-react'

import { useAuthToken } from '@/features/auth'
import { getInterventionPolicyRoleFromToken } from '@/features/intervention-policy'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import {
  canAccessDeveloperConsoleTab,
  type DeveloperConsoleTab,
} from '../lib/developerConsoleAccess'

export type { DeveloperConsoleTab }

/**
 * tab 与路由一一对应：切换 tab 即导航，刷新后仍停在同一 tab。
 * 用 as const 保留字面量类型，供 TanStack Router 的类型化 `to` 校验。
 */
const TAB_ROUTES = {
  earnings: '/developer-console/earnings',
  keys: '/developer-console/keys',
} as const

const TAB_LABELS: Record<DeveloperConsoleTab, string> = {
  earnings: '收益',
  keys: '开发者密钥',
}

const NO_ACCESS_HINT: Record<DeveloperConsoleTab, string> = {
  earnings: '插件分成结算只对组织的 owner 与 admin 开放，请联系管理员查看收益数据。',
  keys: '开发者公钥管理需要 creator 及以上角色，请联系管理员为你提升权限。',
}

interface DeveloperConsoleLayoutProps {
  activeTab: DeveloperConsoleTab
  /** 页头右侧操作区，由各 tab 页面自行提供 */
  actions?: ReactNode
  children: ReactNode
}

export function DeveloperConsoleLayout({
  activeTab,
  actions,
  children,
}: DeveloperConsoleLayoutProps) {
  const navigate = useNavigate()
  const role = getInterventionPolicyRoleFromToken(useAuthToken())

  const visibleTabs = (
    Object.keys(TAB_ROUTES) as DeveloperConsoleTab[]
  ).filter((tab) => canAccessDeveloperConsoleTab(role, tab))
  const canViewActiveTab = canAccessDeveloperConsoleTab(role, activeTab)

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="developer-console"
    >
      <PageHeader
        icon={Code2}
        title="开发者控制台"
        description="查看插件分成结算，管理用于插件签名验签的开发者公钥。"
        actions={canViewActiveTab ? actions : undefined}
      />

      <Tabs
        value={activeTab}
        defaultValue={activeTab}
        onValueChange={(next) => {
          if (next === activeTab) {
            return
          }

          void navigate({ to: TAB_ROUTES[next as DeveloperConsoleTab] })
        }}
      >
        {visibleTabs.length > 0 ? (
          <TabsList className="sm:w-auto">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="sm:flex-none sm:px-5">
                {TAB_LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}

        <TabsContent value={activeTab}>
          {canViewActiveTab ? (
            children
          ) : (
            <div data-testid="developer-console-forbidden">
              <EmptyState
                icon={ShieldAlert}
                tone="var(--color-warning)"
                title={`无权访问「${TAB_LABELS[activeTab]}」`}
                description={NO_ACCESS_HINT[activeTab]}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
