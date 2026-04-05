import { describe, expect, it } from "vitest";

import { resolveConversationWorkspacePreviewId } from "./workspacePreview";

describe("resolveConversationWorkspacePreviewId", () => {
  it("存在 restoreWorkspaceId 时应优先使用实际恢复工作区", () => {
    expect(
      resolveConversationWorkspacePreviewId({
        workspaceSnapshotId: "preview-ws",
        sandboxConfig: { restoreWorkspaceId: "live-ws" },
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
