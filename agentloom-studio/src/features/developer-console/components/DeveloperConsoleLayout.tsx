import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Code2 } from 'lucide-react'

import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

export type DeveloperConsoleTab = 'earnings' | 'keys'

/**
 * tab 与路由一一对应：切换 tab 即导航，刷新后仍停在同一 tab。
 * 用 as const 保留字面量类型，供 TanStack Router 的类型化 `to` 校验。
 */
const TAB_ROUTES = {
  earnings: '/developer-console/earnings',
  keys: '/developer-console/keys',
} as const

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

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="developer-console"
    >
      <PageHeader
        icon={Code2}
        title="开发者控制台"
        description="查看插件分成结算，管理用于插件签名验签的开发者公钥。"
        actions={actions}
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
        <TabsList className="sm:w-auto">
          <TabsTrigger value="earnings" className="sm:flex-none sm:px-5">
            收益
          </TabsTrigger>
          <TabsTrigger value="keys" className="sm:flex-none sm:px-5">
            开发者密钥
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>{children}</TabsContent>
      </Tabs>
    </div>
  )
}
