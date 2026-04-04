export const RESOURCE_SOURCE_KINDS = ['manual', 'share_imported'] as const
export type ResourceSourceKind = (typeof RESOURCE_SOURCE_KINDS)[number]
export type ResourceSourceFilter = ResourceSourceKind | 'all'

export const RESOURCE_SOURCE_FILTER_OPTIONS: Array<{
  value: ResourceSourceFilter
  label: string
}> = [
  { value: 'all', label: '全部来源' },
  { value: 'manual', label: '自己创建' },
  { value: 'share_imported', label: '分享导入' },
]

export function getResourceSourceLabel(kind: ResourceSourceKind): string {
  return kind === 'share_imported' ? '分享导入' : '自己创建'
}

export function getResourceSourceBadgeClass(kind: ResourceSourceKind): string {
  return kind === 'share_imported'
    ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
}
