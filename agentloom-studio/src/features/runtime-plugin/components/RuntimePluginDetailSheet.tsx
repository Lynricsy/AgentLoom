import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { formatBytes } from '@/shared/lib/format'
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
          <SheetDescription className="break-all">
            {plugin ? `${plugin.pluginId} · v${plugin.version}` : '查看清单摘要与配置 Schema'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {isLoading ? (
            <div className="space-y-5" data-testid="runtime-plugin-detail-skeleton">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
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
                  <Badge size="sm" variant={RUNTIME_PLUGIN_STATUS_VARIANT[plugin.status]}>
                    {RUNTIME_PLUGIN_STATUS_LABEL[plugin.status]}
                  </Badge>
                </Field>
                <Field label="版本">v{plugin.version}</Field>
                <Field label="作者" title={plugin.author}>
                  {plugin.author}
                </Field>
                <Field label="许可协议" title={plugin.license ?? undefined}>
                  {plugin.license ?? '未声明'}
                </Field>
                <Field label="包大小">{formatBytes(plugin.sizeBytes)}</Field>
                <Field label="更新时间">
                  {formatPluginTimestamp(plugin.updatedAt) ?? '未记录'}
                </Field>
              </dl>

              {plugin.description ? (
                <p className="break-words text-sm leading-relaxed text-muted-foreground">
                  {plugin.description}
                </p>
              ) : null}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
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
                <h3 className="text-sm font-semibold text-foreground">
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

function Field({
  label,
  title,
  children,
}: {
  label: string
  title?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground" title={title}>
        {children}
      </dd>
    </div>
  )
}
