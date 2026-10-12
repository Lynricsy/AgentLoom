import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import type { AgentStatus } from '@/features/agent'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Alert } from '@/shared/ui/alert'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

import { useAgentApiKeyAccess } from '../lib/agentApiKeyAccess'
import { AgentApiKeyList } from './AgentApiKeyList'
import { AgentApiUsageGuide } from './AgentApiUsageGuide'

type AccessTab = 'keys' | 'usage'

interface AgentApiAccessSheetProps {
  agentId: string
  agentStatus: AgentStatus
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 只有已发布的 Agent 能被外部调用；其余状态给出对应的 409 problem type */
const UNAVAILABLE_NOTICE: Partial<Record<AgentStatus, string>> = {
  draft:
    '这个 Agent 还没有发布，外部调用会返回 409 agent-not-published。可以先创建 Key，发布后即可使用。',
  archived: '这个 Agent 已归档，外部调用会返回 409 agent-archived。',
}

export function AgentApiAccessSheet({
  agentId,
  agentStatus,
  open,
  onOpenChange,
}: AgentApiAccessSheetProps) {
  const access = useAgentApiKeyAccess()
  const [tab, setTab] = useState<AccessTab>('keys')
  const unavailableNotice = UNAVAILABLE_NOTICE[agentStatus]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="max-w-2xl"
        data-testid="agent-api-access-sheet"
      >
        <SheetHeader>
          <SheetTitle>API 访问</SheetTitle>
          <SheetDescription>
            第三方系统使用 Agent 专属 API Key 调用这个 Agent 的已发布版本，对话与 run 会出现在对话列表的「API」来源下。
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {access === 'none' ? (
            <EmptyState
              icon={ShieldAlert}
              title="没有查看权限"
              description="API Key 只对组织的 owner、admin 与 creator 开放，请联系管理员。"
            />
          ) : (
            <>
              {unavailableNotice ? (
                <Alert
                  variant="warning"
                  role="status"
                  data-testid="agent-api-unpublished-notice"
                >
                  {unavailableNotice}
                </Alert>
              ) : null}

              <Tabs
                value={tab}
                defaultValue="keys"
                onValueChange={(next) => setTab(next as AccessTab)}
              >
                <TabsList aria-label="API 访问分区">
                  <TabsTrigger value="keys" aria-pressed={tab === 'keys'}>
                    API Key
                  </TabsTrigger>
                  <TabsTrigger value="usage" aria-pressed={tab === 'usage'}>
                    调用示例
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="keys">
                  <AgentApiKeyList agentId={agentId} canManage={access === 'manage'} />
                </TabsContent>
                <TabsContent value="usage">
                  <AgentApiUsageGuide />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
