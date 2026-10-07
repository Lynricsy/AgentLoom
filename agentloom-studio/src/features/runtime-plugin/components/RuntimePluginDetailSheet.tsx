import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { formatPluginTimestamp } from '@/features/plugin'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import { Badge } from '@/shared/ui/badge'
import { Separator } from '@/shared/ui/separator'
import { Skeleton } from '@/shared/ui/skeleton'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { JsonTreeView } from '@/shared/components/json/JsonTreeView'
import { useRuntimePlugin } from '../api/runtimePluginQueries'
import {
  RUNTIME_PLUGIN_STATUS_LABEL,
  RUNTIME_PLUGIN_STATUS_VARIANT,
  formatRuntimePluginSize,
} from '../lib/runtimePluginPresentation'

interface RuntimePluginDetailSheetProps {
  runtimePluginId: string | null
  onOpenChange: (open: boolean) => void
}

export function RuntimePluginDetailSheet({
  runtimePluginId,
  onOpenChange,
}: RuntimePluginDetailSheetProps) {
  const { data, isLoading, isError } = useRuntimePlugin(runtimePluginId ?? '')
  const plugin = data?.data

  return (
    <Sheet open={runtimePluginId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{plugin?.name ?? 'Runtime 插件详情'}</SheetTitle>
          <SheetDescription>
            {plugin ? `${plugin.pluginId} · v${plugin.version}` : '查看清单摘要与配置 Schema'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {isLoading ? (
            <div className="space-y-3" data-testid="runtime-plugin-detail-skeleton">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : isError || !plugin ? (
            <EmptyState
              icon={AlertCircle}
              tone="var(--color-error)"
              title="Runtime 插件详情加载失败"
              description="插件可能已被删除，或服务暂时不可用。"
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="状态">
                  <Badge variant={RUNTIME_PLUGIN_STATUS_VARIANT[plugin.status]}>
                    {RUNTIME_PLUGIN_STATUS_LABEL[plugin.status]}
                  </Badge>
                </Field>
                <Field label="版本">v{plugin.version}</Field>
                <Field label="作者">{plugin.author}</Field>
                <Field label="许可协议">{plugin.license ?? '未声明'}</Field>
                <Field label="包大小">{formatRuntimePluginSize(plugin.sizeBytes)}</Field>
                <Field label="更新时间">
                  {formatPluginTimestamp(plugin.updatedAt) ?? '未记录'}
                </Field>
              </dl>

              {plugin.description ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{plugin.description}</p>
              ) : null}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  内容哈希（SHA-256）
                </h3>
                <code
                  className="block break-all rounded-lg border border-border bg-muted p-3 text-2xs text-foreground"
                  data-testid="runtime-plugin-content-hash"
                >
                  {plugin.contentHash}
                </code>
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  配置 Schema
                </h3>
                {plugin.configSchema ? (
                  <div className="rounded-lg border border-border bg-muted p-3">
                    <JsonTreeView
                      value={plugin.configSchema}
                      defaultExpandedDepth={2}
                      dataTestId="runtime-plugin-config-schema-tree"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    该插件未声明 configSchema，画布节点不提供配置表单。
                  </p>
                )}
              </section>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{children}</dd>
    </div>
  )
}
