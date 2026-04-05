import type { AgentDefinition } from "@/features/agent/types";

type WorkspacePreviewAgent = Pick<
  AgentDefinition,
  "workspaceSnapshotId" | "sandboxConfig"
>;

export function resolveConversationWorkspacePreviewId(
  agent: WorkspacePreviewAgent | null | undefined,
): string | null {
  const restoreWorkspaceId = agent?.sandboxConfig?.restoreWorkspaceId?.trim();
  if (restoreWorkspaceId) {
    return restoreWorkspaceId;
  }

  const workspaceSnapshotId = agent?.workspaceSnapshotId?.trim();
  return workspaceSnapshotId || null;
}
