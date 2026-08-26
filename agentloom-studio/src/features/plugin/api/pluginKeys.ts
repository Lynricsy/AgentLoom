export const pluginKeys = {
  all: ['plugins'] as const,
  lists: () => [...pluginKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...pluginKeys.lists(), filters] as const,
  details: () => [...pluginKeys.all, 'detail'] as const,
  detail: (id: string) => [...pluginKeys.details(), id] as const,
  /** 用量挂在插件详情层级下：插件失效时用量缓存一并失效 */
  usage: (id: string) => [...pluginKeys.detail(id), 'usage'] as const,
  usageList: (id: string, filters?: unknown) =>
    [...pluginKeys.usage(id), 'list', filters] as const,
  usageSummary: (id: string, period?: unknown) =>
    [...pluginKeys.usage(id), 'summary', period] as const,
  /**
   * 市场升级检查也挂在插件详情层级下：卸载/升级后失效 pluginKeys.all
   * 就能连带刷新这份判定，不必单独记住它的 key。
   */
  marketplaceUpgrade: (id: string, listingId: string) =>
    [...pluginKeys.detail(id), 'marketplace-upgrade', listingId] as const,
}
