export const RESOURCE_SOURCE_KINDS = ["manual", "share_imported"] as const;
export type ResourceSourceKind = (typeof RESOURCE_SOURCE_KINDS)[number];
export type ResourceSourceFilter = ResourceSourceKind | "all";

export const RESOURCE_SOURCE_LABELS: Record<ResourceSourceKind, string> = {
  manual: "自己创建",
  share_imported: "分享导入",
};

export const RESOURCE_SOURCE_CATEGORY_OPTIONS: Array<{
  value: ResourceSourceKind;
  label: string;
}> = RESOURCE_SOURCE_KINDS.map((value) => ({
  value,
  label: RESOURCE_SOURCE_LABELS[value],
}));

export const RESOURCE_SOURCE_FILTER_OPTIONS: Array<{
  value: ResourceSourceFilter;
  label: string;
}> = [{ value: "all", label: "全部来源" }, ...RESOURCE_SOURCE_CATEGORY_OPTIONS];

export function getResourceSourceLabel(kind: ResourceSourceKind): string {
  return RESOURCE_SOURCE_LABELS[kind];
}
