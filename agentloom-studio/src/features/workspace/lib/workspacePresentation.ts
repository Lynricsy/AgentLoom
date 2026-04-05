import type { Workspace } from "../types";

type WorkspaceSourceKind = NonNullable<Workspace["sourceKind"]>;

export const WORKSPACE_SOURCE_BADGE: Record<WorkspaceSourceKind, string> = {
  manual: "bg-slate-500/10 text-slate-300",
  sandbox_snapshot: "bg-blue-500/10 text-blue-400",
  execution_archive: "bg-amber-500/10 text-amber-400",
};

export const WORKSPACE_SOURCE_LABEL: Record<WorkspaceSourceKind, string> = {
  manual: "手动工作区",
  sandbox_snapshot: "沙箱快照",
  execution_archive: "执行归档",
};
