import { memo } from 'react'
import { Webhook } from 'lucide-react'

export const WebhookTriggerNodeBody = memo(function WebhookTriggerNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const authMode =
    typeof config.authMode === 'string' && (config.authMode === 'simple' || config.authMode === 'signed')
      ? config.authMode
      : 'simple'
  const ipWhitelist = typeof config.ipWhitelist === 'string' ? config.ipWhitelist : ''
  const ipCount = ipWhitelist
    ? ipWhitelist.split('\n').filter((line) => line.trim().length > 0).length
    : 0

  return (
    <div className="flex flex-col gap-1" data-testid="webhook-trigger-node-body">
      <div className="flex items-center gap-1.5">
        <Webhook className="h-3.5 w-3.5 shrink-0 text-warning" />
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
          POST
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            authMode === 'signed'
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {authMode === 'signed' ? 'Signed' : 'Simple'}
        </span>
      </div>
      {ipCount > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {ipCount} IP{ipCount > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
})
