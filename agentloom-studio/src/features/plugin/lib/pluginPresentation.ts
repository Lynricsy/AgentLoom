import { z } from 'zod'

import type { InterventionRole } from '@/features/intervention-policy'
import type { BadgeProps } from '@/shared/ui/badge'
import type {
  PluginListItem,
  PluginMarketplaceSource,
  PluginOrigin,
  PluginStatus,
} from '../types'

/** POST /plugins 的 @Roles('owner','admin','creator') */
export function canRegisterPlugins(role: InterventionRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'creator'
}

/** PATCH /plugins/:id/status 与 DELETE /plugins/:id 收紧到 @Roles('owner','admin') */
export function canAdministerPlugins(role: InterventionRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

export type PluginMarketplaceAction = 'uninstall' | 'upgrade' | 'upgradeCheck'

/**
 * 市场来源操作的可见角色，对齐 marketplace controller 的 @Roles：
 * - `upgradeCheck`：`GET /marketplace/listings/:id/upgrade-check` 放到 operator，只读
 * - `upgrade`：`POST .../upgrade` 服务端只给 owner/admin —— 升级会整行重写副本的
 *   version/产物，属于 owner/admin 级别的变更
 * - `uninstall`：服务端还允许 creator，UI 收紧到 owner/admin —— 停用会让全租户
 *   用到该插件节点的工作流停摆，和启停/删除插件同一量级的破坏性
 */
export const PLUGIN_MARKETPLACE_ACTION_ROLES: Record<
  PluginMarketplaceAction,
  readonly InterventionRole[]
> = {
  uninstall: ['owner', 'admin'],
  upgrade: ['owner', 'admin'],
  upgradeCheck: ['owner', 'admin', 'creator', 'operator'],
}

export function canRunPluginMarketplaceAction(
  role: InterventionRole | null,
  action: PluginMarketplaceAction,
): boolean {
  return role !== null && PLUGIN_MARKETPLACE_ACTION_ROLES[action].includes(role)
}

export const PLUGIN_STATUS_LABEL: Record<PluginStatus, string> = {
  registered: '已注册',
  active: '已启用',
  disabled: '已停用',
  error: '异常',
}

export const PLUGIN_STATUS_VARIANT: Record<
  PluginStatus,
  NonNullable<BadgeProps['variant']>
> = {
  registered: 'secondary',
  active: 'success',
  disabled: 'outline',
  error: 'error',
}

export const PLUGIN_ORIGIN_LABEL: Record<PluginOrigin, string> = {
  marketplace: '市场安装',
  upload: '本地上传',
}

const PLUGIN_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * 时间戳缺失（服务端对缺失字段下发空串）或无法解析时返回 null，
 * 由调用方决定隐藏整行，避免渲染出 Invalid Date。
 */
export function formatPluginTimestamp(value: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : PLUGIN_TIMESTAMP_FORMATTER.format(date)
}

/**
 * 服务端对缺失的可选字段下发空串而不是省略 key，因此空白串一律归一成 null；
 * 旧版本安装的副本没有价格/版本快照字段，同样落到 null。
 */
const OPTIONAL_TEXT = z.string().trim().min(1).nullable().catch(null)

/**
 * 市场安装来源的解析契约。listingId 是硬要求：拿不到它就调不了 listing 端点，
 * 这条 metadata 对来源区块毫无用处，直接视同非市场安装。
 */
const MARKETPLACE_SOURCE_SCHEMA = z.object({
  listingId: z.string().trim().min(1),
  listingTitle: OPTIONAL_TEXT,
  clonedAt: OPTIONAL_TEXT,
  upgradedAt: OPTIONAL_TEXT,
  pricingModel: z.enum(['free', 'per_execution']).nullable().catch(null),
  pricePerExecution: OPTIONAL_TEXT,
})

/**
 * 从插件 metadata 解析市场安装来源。
 *
 * 服务端在市场安装时往 metadata 写 cloned_from_marketplace，
 * 经全局 ky hook 转换后前端看到的是 clonedFromMarketplace。
 */
export function readPluginMarketplaceSource(plugin: {
  metadata: Record<string, unknown> | null
}): PluginMarketplaceSource | null {
  const parsed = MARKETPLACE_SOURCE_SCHEMA.safeParse(
    plugin.metadata?.clonedFromMarketplace,
  )

  return parsed.success ? parsed.data : null
}

export function getPluginOrigin(plugin: PluginListItem): PluginOrigin {
  return readPluginMarketplaceSource(plugin) ? 'marketplace' : 'upload'
}
