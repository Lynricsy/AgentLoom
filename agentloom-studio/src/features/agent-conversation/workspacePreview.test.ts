import { describe, expect, it } from "vitest";

import type { AgentGlobalSandboxConfig } from "@/features/agent/types";

import { resolveConversationWorkspacePreviewId } from "./workspacePreview";

/** contracts `SandboxConfig` 的 cpu / memory / disk / timeout 均为必需字段。 */
function sandboxConfig(
  overrides: Partial<AgentGlobalSandboxConfig> = {},
): AgentGlobalSandboxConfig {
  return { cpu: 1, memory: 512, disk: 1, timeout: 0, ...overrides };
}

describe("resolveConversationWorkspacePreviewId", () => {
  it("存在 restoreWorkspaceId 时应优先使用实际恢复工作区", () => {
    expect(
      resolveConversationWorkspacePreviewId({
        workspaceSnapshotId: "preview-ws",
        sandboxConfig: sandboxConfig({ restoreWorkspaceId: "live-ws" }),
      }),
    ).toBe("live-ws");
  });

  it("没有 restoreWorkspaceId 时应回退到 workspaceSnapshotId", () => {
    expect(
      resolveConversationWorkspacePreviewId({
        workspaceSnapshotId: "preview-ws",
        sandboxConfig: null,
      }),
    ).toBe("preview-ws");
  });

  it("两者都缺失时应返回 null", () => {
    expect(
      resolveConversationWorkspacePreviewId({
        workspaceSnapshotId: null,
        sandboxConfig: null,
      }),
    ).toBeNull();
  });
});
