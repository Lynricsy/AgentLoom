/**
 * 组织角色与权限矩阵的唯一来源，供三方共用：
 * - server `@RequirePermission(permission)` + RolesGuard 判定路由访问；
 * - 平台 API Token（`al_`）的 scopes 词表：scope 名即权限名，scopes 只能在角色之上再收窄；
 * - Studio 导航等 UI 门控。
 *
 * 角色之间没有继承，每个权限显式列出允许的角色。
 */
export const ORG_ROLES = ['owner', 'admin', 'creator', 'operator', 'viewer'] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

const ALL_ROLES = ORG_ROLES;
const OPERATORS = ['owner', 'admin', 'creator', 'operator'] as const;
const CREATORS = ['owner', 'admin', 'creator'] as const;
const ADMINS = ['owner', 'admin'] as const;

export const RBAC_PERMISSION_MATRIX = {
  /** 工作流定义、版本、已发布版本的读取 */
  'workflow:read': ALL_ROLES,
  /** 启动工作流（含读取启动所需的输入契约） */
  'workflow:run': OPERATORS,
  /** 导出工作流、校验导入文件 */
  'workflow:export': OPERATORS,
  /** 创建、导入、编辑工作流定义 */
  'workflow:edit': CREATORS,
  /** 删除、发布、归档、版本快照与回滚 */
  'workflow:manage': ADMINS,
  /** 触发器与触发历史的读取 */
  'trigger:read': ALL_ROLES,
  /** 创建、修改、启停、删除触发器 */
  'trigger:edit': CREATORS,
  /** 执行记录、步骤工作区与终端输出的读取 */
  'execution:read': ALL_ROLES,
  /** 取消、恢复、人工介入、工具授权、终端写入 */
  'execution:control': OPERATORS,
  /** 死信队列的查看、重试与丢弃 */
  'execution:dlq': ADMINS,
  /** Agent 定义、版本、会话与会话工作区的读取 */
  'agent:read': ALL_ROLES,
  /** 发起与操作 Agent 会话 */
  'agent:run': OPERATORS,
  /** 创建、编辑、编译 Agent */
  'agent:edit': CREATORS,
  /** 归档、发布、版本快照与回滚 Agent */
  'agent:manage': ADMINS,
  /** 查看 Agent 对外 API Key */
  'agent-api-key:read': CREATORS,
  /** 创建、吊销 Agent 对外 API Key */
  'agent-api-key:manage': ADMINS,
  /** 读取模型配置与提供商 */
  'llm:read': ALL_ROLES,
  /** 连通性测试、模型发现与元数据查询 */
  'llm:use': OPERATORS,
  /** 管理模型配置与提供商凭据 */
  'llm:manage': ADMINS,
  /** 读取 MCP 服务配置（已脱敏）与工具 */
  'mcp:read': CREATORS,
  /** 接入、测试、导入、修改、删除 MCP 服务 */
  'mcp:manage': ADMINS,
  /** 组织监控面板 */
  'monitoring:read': ADMINS,
  /** 审计日志 */
  'audit:read': ADMINS,
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof RBAC_PERMISSION_MATRIX;

export const PERMISSIONS = Object.keys(RBAC_PERMISSION_MATRIX) as Permission[];

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return (RBAC_PERMISSION_MATRIX[permission] as readonly OrgRole[]).includes(role);
}

