import { hasPermission } from "@agentloom/contracts";
import { useAuthToken } from "@/features/auth";
import { getInterventionPolicyRoleFromToken } from "@/features/intervention-policy";

/**
 * 当前角色能否接入、测试、导入、修改、删除 MCP 服务（server `mcp:manage`）。
 * creator 只有 `mcp:read`：能浏览已脱敏的配置与工具，管理操作不渲染。
 */
export function useCanManageMcp(): boolean {
  const role = getInterventionPolicyRoleFromToken(useAuthToken());
  return role !== null && hasPermission(role, "mcp:manage");
}
