import {
  Activity,
  AppWindow,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  Code,
  Compass,
  Container,
  Cpu,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Puzzle,
  Server,
  Sparkles,
  Store,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  hasPermission,
  type OrgRole,
  type Permission,
} from "@agentloom/contracts";

/** 导航项可见角色：租户角色枚举，与 server RolesGuard 同源（`@agentloom/contracts`）。 */
export type NavRole = OrgRole;

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** 路径前缀匹配，决定 active 态 */
  matchPrefix: string;
  /** 页面主接口所需权限；按 RBAC_PERMISSION_MATRIX 判定可见性，与 server 同一份矩阵 */
  permission?: Permission;
  /** 尚未纳入权限矩阵的入口按角色列表判定 */
  roles?: readonly NavRole[];
}

export interface NavGroup {
  /** 分组标识，同时作为折叠状态的持久化 key */
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * 全局主导航模型 — AppSidebar、移动端导航 Sheet 与命令面板共用此唯一来源。
 * 新增页面时只需在此追加，三处入口自动同步。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "build",
    label: "构建",
    items: [
      {
        label: "工作流",
        icon: Workflow,
        to: "/workflows",
        matchPrefix: "/workflows",
      },
      { label: "Agent", icon: Bot, to: "/agents", matchPrefix: "/agents" },
      {
        label: "生成应用",
        icon: AppWindow,
        to: "/generated-apps",
        matchPrefix: "/generated-apps",
      },
    ],
  },
  {
    id: "discover",
    label: "探索",
    items: [
      {
        label: "发现",
        icon: Compass,
        to: "/discover",
        matchPrefix: "/discover",
      },
      {
        label: "市场",
        icon: Store,
        to: "/marketplace",
        matchPrefix: "/marketplace",
      },
      {
        label: "模板",
        icon: LayoutTemplate,
        to: "/templates",
        matchPrefix: "/templates",
      },
      // 开发者控制台按角色落到有权限的第一个 tab：
      // owner/admin 能看收益，creator 只能管自己的签名公钥。
      {
        label: "开发者",
        icon: Code,
        to: "/developer-console/earnings",
        matchPrefix: "/developer-console",
        roles: ["owner", "admin"],
      },
      {
        label: "开发者",
        icon: Code,
        to: "/developer-console/keys",
        matchPrefix: "/developer-console",
        roles: ["creator"],
      },
    ],
  },
  {
    id: "resources",
    label: "资源",
    items: [
      {
        label: "MCP 服务",
        icon: Server,
        to: "/resources/mcp-servers",
        matchPrefix: "/resources/mcp-servers",
        permission: "mcp:read",
      },
      {
        label: "LLM 模型",
        icon: Cpu,
        to: "/resources/llm-models",
        matchPrefix: "/resources/llm-models",
      },
      {
        label: "技能",
        icon: Sparkles,
        to: "/resources/skills",
        matchPrefix: "/resources/skills",
      },
      {
        label: "知识库",
        icon: BookOpen,
        to: "/resources/knowledge-bases",
        matchPrefix: "/resources/knowledge-bases",
      },
      {
        label: "记忆",
        icon: BrainCircuit,
        to: "/resources/memory-instances",
        matchPrefix: "/resources/memory-instances",
      },
      {
        label: "工作区",
        icon: FolderOpen,
        to: "/resources/workspaces",
        matchPrefix: "/resources/workspaces",
      },
      {
        label: "沙箱",
        icon: Container,
        to: "/resources/sandboxes",
        matchPrefix: "/resources/sandboxes",
      },
      {
        label: "插件",
        icon: Puzzle,
        to: "/resources/plugins",
        matchPrefix: "/resources/plugins",
      },
      {
        label: "Runtime 插件",
        icon: Cpu,
        to: "/resources/runtime-plugins",
        matchPrefix: "/resources/runtime-plugins",
      },
    ],
  },
  {
    id: "operations",
    label: "运维",
    items: [
      {
        label: "监控",
        icon: Activity,
        to: "/settings/monitoring",
        matchPrefix: "/settings/monitoring",
        permission: "monitoring:read",
      },
      {
        label: "审计日志",
        icon: FileText,
        to: "/settings/audit-logs",
        matchPrefix: "/settings/audit-logs",
        permission: "audit:read",
      },
      {
        label: "通知",
        icon: Bell,
        to: "/notifications",
        matchPrefix: "/notifications",
      },
    ],
  },
];

function isNavItemVisible(item: NavItem, role: NavRole | null): boolean {
  if (item.permission) {
    return role !== null && hasPermission(role, item.permission);
  }
  return !item.roles || (role !== null && item.roles.includes(role));
}

/**
 * 按当前角色裁剪导航模型 —— AppSidebar、移动端抽屉与命令面板共用同一份可见性判定。
 * role 为 null（token 未解析出角色）时只保留无权限/角色限制的入口。
 */
export function filterNavGroupsByRole(role: NavRole | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item, role)),
  })).filter((group) => group.items.length > 0);
}
