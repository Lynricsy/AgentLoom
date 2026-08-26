import { useCallback, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpCircle,
  PowerOff,
  Store,
} from 'lucide-react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Separator } from '@/shared/ui/separator'
import { Skeleton } from '@/shared/ui/skeleton'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { useToast } from '@/shared/ui/toast'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { JsonTreeView } from '@/shared/components/json/JsonTreeView'
import { useAuthToken } from '@/features/auth'
import { getInterventionPolicyRoleFromToken } from '@/features/intervention-policy'
import {
  MARKETPLACE_PRICING_VARIANT,
  formatMarketplacePrice,
  useMarketplaceListingUpgrade,
  useUninstallListing,
  useUpgradeListing,
} from '@/features/marketplace'
import type { MarketplaceListingUpgradeStatus } from '@/features/marketplace'
import { usePluginById } from '../api/pluginQueries'
import { resolvePluginErrorMessage } from '../lib/pluginErrors'
import {
  PLUGIN_STATUS_LABEL,
  PLUGIN_STATUS_VARIANT,
  canRunPluginMarketplaceAction,
  formatPluginTimestamp,
  readPluginMarketplaceSource,
} from '../lib/pluginPresentation'
import type {
  PluginMarketplaceSource,
  PluginNodeDefinition,
  PluginRecord,
} from '../types'

interface PluginDetailSheetProps {
  pluginId: string | null
  onOpenChange: (open: boolean) => void
}

export function PluginDetailSheet({ pluginId, onOpenChange }: PluginDetailSheetProps) {
  const { data, isLoading, isError } = usePluginById(pluginId ?? '')
  const plugin = data?.data
  const marketplaceSource = plugin ? readPluginMarketplaceSource(plugin) : null

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

              {marketplaceSource ? (
                <>
                  <Separator />
                  <MarketplaceSourceSection
                    plugin={plugin}
                    source={marketplaceSource}
                  />
                </>
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

/**
 * 市场安装来源区块：来源信息 + 升级入口 + 卸载。
 *
 * 放在插件详情而不是市场页：卸载和升级作用于「租户里这一行插件副本」，
 * 用户带着「这个插件怎么了」的问题来的是插件管理页；市场页面对的是
 * 「有什么可装」，把副本级别的破坏性操作摆在那里既找不到也容易误伤。
 */
function MarketplaceSourceSection({
  plugin,
  source,
}: {
  plugin: PluginRecord
  source: PluginMarketplaceSource
}) {
  const { notify } = useToast()
  const role = getInterventionPolicyRoleFromToken(useAuthToken())
  const canUninstall = canRunPluginMarketplaceAction(role, 'uninstall')
  const canUpgrade = canRunPluginMarketplaceAction(role, 'upgrade')
  const canInspectUpgrade = canRunPluginMarketplaceAction(role, 'upgradeCheck')

  const [confirmingUninstall, setConfirmingUninstall] = useState(false)

  const upgradeCheck = useMarketplaceListingUpgrade(
    canInspectUpgrade ? plugin.id : null,
    source.listingId,
  )
  const uninstallMutation = useUninstallListing()
  const upgradeMutation = useUpgradeListing()

  const installedAt = formatPluginTimestamp(source.clonedAt)
  const upgradedAt = formatPluginTimestamp(source.upgradedAt)

  const handleUninstall = useCallback(() => {
    uninstallMutation.mutate(source.listingId, {
      onSuccess: (result) => {
        setConfirmingUninstall(false)
        const count = result.disabledPluginDbIds.length
        notify(
          count === 0
            ? {
                title: '没有可停用的副本',
                description: '来自该上架的插件副本已经全部处于停用状态。',
                variant: 'warning',
              }
            : {
                title: '插件副本已停用',
                description: `已停用 ${count} 个来自该上架的插件副本，记录与产物均已保留。`,
                variant: 'success',
              },
        )
      },
      onError: async (error) => {
        notify({
          title: '卸载失败',
          description: await resolvePluginErrorMessage(error, '请稍后重试。'),
          variant: 'error',
        })
      },
    })
  }, [notify, source.listingId, uninstallMutation])

  const handleUpgrade = useCallback(() => {
    upgradeMutation.mutate(source.listingId, {
      onSuccess: (result) => {
        notify({
          title: '插件已升级',
          description: `${plugin.name}：v${result.fromVersion} → v${result.toVersion}`,
          variant: 'success',
        })
      },
      onError: async (error) => {
        notify({
          title: '升级失败',
          description: await resolvePluginErrorMessage(error, '请稍后重试。'),
          variant: 'error',
        })
      },
    })
  }, [notify, plugin.name, source.listingId, upgradeMutation])

  return (
    <section className="space-y-3" data-testid="plugin-marketplace-source">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
        来自市场
      </h3>

      <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
        <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 break-words">
          {source.listingTitle ?? '未记录上架名称'}
        </span>
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field label="安装时间">{installedAt ?? '未记录'}</Field>
        {upgradedAt ? <Field label="最近升级">{upgradedAt}</Field> : null}
        <Field label="安装时计费口径">
          {source.pricingModel ? (
            <Badge variant={MARKETPLACE_PRICING_VARIANT[source.pricingModel]}>
              {formatMarketplacePrice(source.pricingModel, source.pricePerExecution)}
            </Badge>
          ) : (
            '未记录'
          )}
        </Field>
      </dl>

      {canInspectUpgrade ? (
        <UpgradeRow
          canUpgrade={canUpgrade}
          isPending={upgradeMutation.isPending}
          onUpgrade={handleUpgrade}
          isLoading={upgradeCheck.isLoading}
          isError={upgradeCheck.isError}
          status={upgradeCheck.data}
        />
      ) : null}

      {canUninstall ? (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            size="sm"
            data-testid="plugin-uninstall-btn"
            onClick={() => setConfirmingUninstall(true)}
          >
            <PowerOff className="h-3.5 w-3.5" aria-hidden />
            卸载（停用副本）
          </Button>
          <p className="text-xs leading-relaxed text-muted">
            卸载只把副本置为停用：插件记录与已上传产物都保留，随时可在插件管理页重新启用。
          </p>
        </div>
      ) : null}

      <AlertDialog
        open={confirmingUninstall}
        onOpenChange={setConfirmingUninstall}
      >
        <AlertDialogContent>
          <AlertDialogTitle>卸载插件副本</AlertDialogTitle>
          <AlertDialogDescription>
            {`将把来自「${source.listingTitle ?? '该上架'}」的插件副本全部置为停用。插件记录与产物不会删除，可随时重新启用；停用期间用到这些插件节点的工作流无法执行。`}
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={uninstallMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                handleUninstall()
              }}
            >
              {uninstallMutation.isPending ? (
                <Spinner size="sm" className="mr-1.5" />
              ) : null}
              停用副本
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/**
 * 升级入口按 upgrade-check 的 reason 分支。
 *
 * 只有 `upgrade_available` 给按钮：源不可用/已换绑都是发布方那侧的状态，
 * 点了必然 409，给个可点的按钮只会让人重复撞墙，所以只说明原因。
 */
function UpgradeRow({
  canUpgrade,
  isPending,
  onUpgrade,
  isLoading,
  isError,
  status,
}: {
  canUpgrade: boolean
  isPending: boolean
  onUpgrade: () => void
  isLoading: boolean
  isError: boolean
  status: MarketplaceListingUpgradeStatus | undefined
}) {
  if (isLoading) {
    return (
      <p className="text-xs text-muted" data-testid="plugin-upgrade-status">
        正在检查新版本…
      </p>
    )
  }

  if (isError || !status) {
    return (
      <p className="text-xs text-muted" data-testid="plugin-upgrade-status">
        暂时取不到升级信息，稍后重试。
      </p>
    )
  }

  const { currentVersion, latestVersion, reason } = status

  if (reason === 'not_installed') {
    return null
  }

  if (reason === 'upgrade_available') {
    const target = latestVersion ? `v${latestVersion}` : '最新版本'

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {canUpgrade ? (
          <Button
            size="sm"
            data-testid="plugin-upgrade-btn"
            disabled={isPending}
            onClick={onUpgrade}
          >
            {isPending ? (
              <Spinner size="sm" />
            ) : (
              <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden />
            )}
            升级到 {target}
          </Button>
        ) : (
          <span className="text-xs text-muted" data-testid="plugin-upgrade-status">
            有新版本 {target}，需要 owner/admin 执行升级。
          </span>
        )}
        {currentVersion ? (
          <span className="text-xs text-muted">当前 v{currentVersion}</span>
        ) : null}
      </div>
    )
  }

  if (reason === 'up_to_date') {
    return (
      <p className="text-xs text-muted" data-testid="plugin-upgrade-status">
        {currentVersion ? `已是最新版本 v${currentVersion}。` : '已是最新版本。'}
      </p>
    )
  }

  return (
    <p className="text-xs text-muted" data-testid="plugin-upgrade-status">
      {UPGRADE_BLOCKED_MESSAGE[reason]}
    </p>
  )
}

/** `up_to_date` 带当前版本号，在 UpgradeRow 内单独渲染，不进这张表 */
const UPGRADE_BLOCKED_MESSAGE: Record<
  'source_unavailable' | 'source_replaced',
  string
> = {
  source_unavailable: '源上架已下架或源插件已停用，无法升级。',
  source_replaced: '该上架已换绑到其他插件，无法原地升级。',
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
