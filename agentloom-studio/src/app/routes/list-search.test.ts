import { describe, expect, it } from "vitest";
import {
  parseAgentListSearch,
  resolveAgentListSearch,
} from "@/features/agent/lib/agentListSearch";
import {
  parseWorkflowListSearch,
  resolveWorkflowListSearch,
} from "@/features/workflow/lib/workflowListSearch";

describe("list route search persistence", () => {
  it("restores agent filters and pagination from a refreshed URL", () => {
    const rawSearch = Object.fromEntries(
      new URLSearchParams(
        "page=3&pageSize=24&status=published&search=planner&sourceKind=share_imported",
      ),
    );

    expect(resolveAgentListSearch(parseAgentListSearch(rawSearch))).toEqual({
      page: 3,
      pageSize: 24,
      status: "published",
      search: "planner",
      sourceKind: "share_imported",
    });
  });

  it("restores workflow filters and pagination from a refreshed URL", () => {
    const rawSearch = Object.fromEntries(
      new URLSearchParams(
        "page=2&pageSize=36&status=draft&search=approval&sourceKind=manual",
      ),
    );

    expect(resolveWorkflowListSearch(parseWorkflowListSearch(rawSearch))).toEqual({
      page: 2,
      pageSize: 36,
      status: "draft",
      search: "approval",
      sourceKind: "manual",
    });
  });
});
