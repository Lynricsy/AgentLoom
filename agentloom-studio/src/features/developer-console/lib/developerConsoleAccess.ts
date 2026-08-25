import type { InterventionRole } from '@/features/intervention-policy'

export type DeveloperConsoleTab = 'earnings' | 'keys'

/**
 * 各 tab 的可见角色，对齐服务端 @Roles：
 * - 收益：`GET /plugins/marketplace/earnings/*` 收紧到 owner/admin
 * - 开发者密钥：`/plugin-developer-keys` 允许 creator 自助管理签名公钥
 */
export const DEVELOPER_CONSOLE_TAB_ROLES: Record<
  DeveloperConsoleTab,
  readonly InterventionRole[]
> = {
  earnings: ['owner', 'admin'],
  keys: ['owner', 'admin', 'creator'],
}

export function canAccessDeveloperConsoleTab(
  role: InterventionRole | null,
  tab: DeveloperConsoleTab,
): boolean {
  return role !== null && DEVELOPER_CONSOLE_TAB_ROLES[tab].includes(role)
}
