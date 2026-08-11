import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'
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
import { usePluginById } from '../api/pluginQueries'
import { PLUGIN_STATUS_LABEL, PLUGIN_STATUS_VARIANT } from '../lib/pluginPresentation'
import type { PluginNodeDefinition } from '../types'

interface PluginDetailSheetProps {
  pluginId: string | null
  onOpenChange: (open: boolean) => void
}

export function PluginDetailSheet({ pluginId, onOpenChange }: PluginDetailSheetProps) {
  const { data, isLoading, isError } = usePluginById(pluginId ?? '')
  const plugin = data?.data

  return (
    <Sheet open={pluginId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{plugin?.name ?? '插件详情'}</SheetTitle>
          <SheetDescription>
            {plugin ? `${plugin.pluginId} · v${plugin.version}` : '查看清单与节点定义'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {isLoading ? (
            <div className="space-y-3" data-testid="plugin-detail-skeleton">
              <Skeleton className="h-16 rounded-card" />
              <Skeleton className="h-24 rounded-card" />
              <Skeleton className="h-40 rounded-card" />
            </div>
          ) : isError || !plugin ? (
            <EmptyState
              icon={AlertCircle}
              tone="var(--color-error)"
              title="插件详情加载失败"
              description="插件可能已被删除，或服务暂时不可用。"
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="状态">
                  <Badge variant={PLUGIN_STATUS_VARIANT[plugin.status]}>
                    {PLUGIN_STATUS_LABEL[plugin.status]}
                  </Badge>
                </Field>
                <Field label="版本">v{plugin.version}</Field>
                <Field label="作者">{plugin.author}</Field>
                <Field label="许可协议">{plugin.license ?? '未声明'}</Field>
              </dl>

              {plugin.description ? (
                <p className="text-sm leading-relaxed text-muted">{plugin.description}</p>
              ) : null}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                  权限申请
                </h3>
                {plugin.permissions.length === 0 ? (
                  <p className="text-xs text-muted">未申请任何额外权限。</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {plugin.permissions.map((permission) => (
                      <Badge key={permission} variant="outline" size="sm">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                )}
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                  节点定义（{plugin.nodeDefinitions.length}）
                </h3>
                {plugin.nodeDefinitions.length === 0 ? (
                  <p className="text-xs text-muted">该插件未导出画布节点。</p>
                ) : (
                  <ul className="space-y-2">
                    {plugin.nodeDefinitions.map((node) => (
                      <li
                        key={node.type}
                        className="rounded-card border border-border bg-surface-elevated/40 p-3"
                      >
                        <NodeSummary node={node} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                  插件清单
                </h3>
                <div className="rounded-card border border-border bg-surface-elevated/40 p-3">
                  <JsonTreeView
                    value={plugin.manifest}
                    defaultExpandedDepth={1}
                    dataTestId="plugin-manifest-tree"
                  />
                </div>
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
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{children}</dd>
    </div>
  )
}

function NodeSummary({ node }: { node: PluginNodeDefinition }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{node.label}</span>
        <Badge variant="secondary" size="sm">
          {node.category}
        </Badge>
        <code className="text-[11px] text-muted">{node.type}</code>
      </div>

      {node.description ? (
        <p className="mt-1 text-xs leading-relaxed text-muted">{node.description}</p>
      ) : null}

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span>{node.inputPorts.length} 入参</span>
        <ArrowRight className="h-3 w-3" aria-hidden />
        <span>{node.outputPorts.length} 出参</span>
      </div>
    </>
  )
}
