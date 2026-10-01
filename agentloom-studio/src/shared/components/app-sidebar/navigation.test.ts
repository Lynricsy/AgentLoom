import { describe, expect, it } from "vitest";
import { filterNavGroupsByRole, type NavRole } from "./navigation";

function visibleLabels(role: NavRole | null): string[] {
  return filterNavGroupsByRole(role).flatMap((group) =>
    group.items.map((item) => item.label),
  );
}

describe("filterNavGroupsByRole", () => {
  it.each([
    ["owner", true, true],
    ["admin", true, true],
    ["creator", true, false],
    ["operator", false, false],
    ["viewer", false, false],
  ] as const)(
    "%s：MCP 服务可见=%s，监控/审计日志可见=%s，LLM 模型始终可见",
    (role, seesMcp, seesAdminPages) => {
      const labels = visibleLabels(role);
      expect(labels.includes("MCP 服务")).toBe(seesMcp);
      expect(labels.includes("监控")).toBe(seesAdminPages);
      expect(labels.includes("审计日志")).toBe(seesAdminPages);
      expect(labels).toContain("LLM 模型");
    },
  );

  it("token 未解析出角色时不展示任何受权限限制的入口", () => {
    const labels = visibleLabels(null);
    expect(labels).not.toContain("MCP 服务");
    expect(labels).not.toContain("监控");
    expect(labels).not.toContain("审计日志");
    expect(labels).toContain("LLM 模型");
  });
});
