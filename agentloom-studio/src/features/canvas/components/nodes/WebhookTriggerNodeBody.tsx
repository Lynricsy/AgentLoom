import { memo } from 'react'
import { Webhook } from 'lucide-react'

/**
 * 鉴权模式与 IP 白名单属于已部署的 workflow_triggers 记录，不在节点 data.config 中，
 * 节点卡片只展示入口方法；生效配置见节点配置面板。
 */
export const WebhookTriggerNodeBody = memo(function WebhookTriggerNodeBody() {
  return (
    <div className="flex items-center gap-1.5" data-testid="webhook-trigger-node-body">
      <Webhook className="h-3.5 w-3.5 shrink-0 text-warning" />
      <span className="rounded bg-success/15 px-1.5 py-0.5 text-2xs font-bold text-success">
        POST
      </span>
    </div>
  )
})
