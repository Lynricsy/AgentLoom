import { memo } from 'react'
import { HeartPulse, RotateCw } from 'lucide-react'
import { useProviderHealth } from '@/features/smart-routing'
import {
  PROVIDER_HEALTH_META,
  formatRoutingTimestamp,
} from '../lib/presentation'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'

/**
 * 路由提供商熔断状态条。
 * 只读展示 `GET smart-routing/health`，不提供手动熔断/恢复操作。
 */
export const ProviderHealthBar = memo(function ProviderHealthBar() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useProviderHealth()

  return (
    <Card data-testid="provider-health-bar">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-foreground">
            <HeartPulse className="h-4 w-4" aria-hidden="true" />
            <h3 className="text-sm font-semibold">提供商健康</h3>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void refetch()}
            disabled={isFetching}
            data-testid="provider-health-refresh"
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            刷新
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-wrap gap-2" data-testid="provider-health-loading">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-32 rounded-full" />
            ))}
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="text-xs font-medium text-error" data-testid="provider-health-error">
            加载提供商健康状态失败：{error instanceof Error ? error.message : '未知错误'}
          </p>
        ) : null}

        {!isLoading && !isError && (data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted" data-testid="provider-health-empty">
            当前组织还没有提供商熔断记录，说明所有模型调用都未触发失败阈值。
          </p>
        ) : null}

        {!isLoading && !isError && data && data.length > 0 ? (
          <ul className="flex flex-wrap gap-2" data-testid="provider-health-list">
            {data.map((status) => {
              const meta = PROVIDER_HEALTH_META[status.status]

              return (
                <li
                  key={`${status.providerName}:${status.modelId ?? 'all'}`}
                  className="flex items-center gap-2 rounded-full border border-border bg-surface-elevated py-1 pl-2.5 pr-1.5"
                >
                  <span className="text-xs font-medium text-foreground">
                    {status.providerName}
                    {status.modelId ? (
                      <span className="text-muted"> · {status.modelId}</span>
                    ) : null}
                  </span>
                  <Badge variant={meta.variant} size="sm">
                    {meta.label}
                  </Badge>
                  {status.failureCount > 0 ? (
                    <span
                      className="text-[10px] text-muted"
                      title={`最近失败：${formatRoutingTimestamp(status.lastFailureAt)}`}
                    >
                      失败 {status.failureCount} 次
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
})
