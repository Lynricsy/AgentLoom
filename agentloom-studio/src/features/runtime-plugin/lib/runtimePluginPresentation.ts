import type { BadgeProps } from '@/shared/ui/badge'
import type { RuntimePluginStatus } from '../types'

export const RUNTIME_PLUGIN_STATUS_LABEL: Record<RuntimePluginStatus, string> = {
  registered: '已注册',
  active: '已启用',
  disabled: '已停用',
}

export const RUNTIME_PLUGIN_STATUS_VARIANT: Record<
  RuntimePluginStatus,
  NonNullable<BadgeProps['variant']>
> = {
  registered: 'secondary',
  active: 'success',
  disabled: 'outline',
}

/** 平台当前支持的 dsh 版本，与服务端 RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION 一致 */
export const RUNTIME_PLUGIN_DSH_VERSION = '0.2.0-rc.2'
