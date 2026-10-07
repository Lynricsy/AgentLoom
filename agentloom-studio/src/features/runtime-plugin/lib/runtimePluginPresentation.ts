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

const BYTES_PER_KB = 1024
const BYTES_PER_MB = 1024 * 1024

export function formatRuntimePluginSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} KB`
}
