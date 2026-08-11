import type { Workspace } from "../types";

type WorkspaceSourceKind = NonNullable<Workspace["sourceKind"]>;

/** 来源着色统一取数据类型令牌，与画布端口体系同源 */
export const WORKSPACE_SOURCE_TONE: Record<WorkspaceSourceKind, string> = {
  manual: "var(--color-type-volume)",
  sandbox_snapshot: "var(--color-type-sandbox)",
  execution_archive: "var(--color-type-exec)",
};

export const WORKSPACE_SOURCE_LABEL: Record<WorkspaceSourceKind, string> = {
  manual: "手动工作区",
  sandbox_snapshot: "沙箱快照",
  execution_archive: "执行归档",
};
