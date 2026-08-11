import type { InterventionRole } from '@/features/intervention-policy/types'
import type { BadgeProps } from '@/shared/ui/badge'
import type { PluginListItem, PluginOrigin, PluginStatus } from '../types'

/** POST /plugins 的 @Roles('owner','admin','creator') */
export function canRegisterPlugins(role: InterventionRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'creator'
}

/** PATCH /plugins/:id/status 与 DELETE /plugins/:id 收紧到 @Roles('owner','admin') */
export function canAdministerPlugins(role: InterventionRole | null): boolean {
  return role === 'owner' || role === 'admin'
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

/**
 * 服务端在市场安装时往 metadata 写 cloned_from_marketplace，
 * 经全局 ky hook 转换后前端看到的是 clonedFromMarketplace。
 */
export function getPluginOrigin(plugin: PluginListItem): PluginOrigin {
  return plugin.metadata?.clonedFromMarketplace ? 'marketplace' : 'upload'
}
