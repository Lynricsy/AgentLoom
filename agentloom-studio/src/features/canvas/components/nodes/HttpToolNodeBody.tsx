import { memo } from 'react'
import { Globe } from 'lucide-react'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-info/15 text-info',
  PUT: 'bg-warning/15 text-warning',
  PATCH: 'bg-warning/15 text-warning',
  DELETE: 'bg-error/15 text-error',
}

export const HttpToolNodeBody = memo(function HttpToolNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const method = typeof config.method === 'string' ? config.method : 'GET'
  const url = typeof config.url === 'string' ? config.url : ''

  return (
    <div className="flex flex-col gap-1" data-testid="http-tool-node-body">
      <div className="flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5 shrink-0 text-type-tool" />
        <span
          className={`rounded px-1.5 py-0.5 text-2xs font-bold ${
            METHOD_COLORS[method] ?? 'bg-muted text-muted-foreground'
          }`}
        >
          {method}
        </span>
      </div>
      {url ? (
        <p className="truncate font-mono text-2xs text-muted-foreground">
          {url.length > 50 ? `${url.slice(0, 50)}…` : url}
        </p>
      ) : (
        <p className="text-2xs text-muted-foreground/60">未配置 URL</p>
      )}
    </div>
  )
})
