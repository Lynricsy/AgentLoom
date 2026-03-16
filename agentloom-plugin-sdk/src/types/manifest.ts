const pluginPermissions = [
  'network:outbound',
  'storage:read',
  'storage:write',
  'knowledge:read',
  'knowledge:write',
  'llm:invoke',
] as const;

const customNodeCategories = ['transform', 'filter', 'aggregator', 'connector', 'utility'] as const;

/**
 * 插件在平台上可声明的权限范围。
 */
export type PluginPermission =
  | 'network:outbound'
  | 'storage:read'
  | 'storage:write'
  | 'knowledge:read'
  | 'knowledge:write'
  | 'llm:invoke';

/**
 * 所有合法的 {@link PluginPermission} 值。
 */
export const PLUGIN_PERMISSIONS: readonly PluginPermission[] = pluginPermissions;

/**
 * 自定义节点的分类枚举。
 */
export type CustomNodeCategory = 'transform' | 'filter' | 'aggregator' | 'connector' | 'utility';

/**
 * 所有合法的 {@link CustomNodeCategory} 值。
 */
export const CUSTOM_NODE_CATEGORIES: readonly CustomNodeCategory[] = customNodeCategories;

/**
 * 插件发布清单。
 */
export interface PluginManifest {
  /** 反向域名格式的插件 ID。 */
  id: string;
  /** 插件名称。 */
  name: string;
  /** 插件版本号，必须符合 semver。 */
  version: string;
  /** 插件作者。 */
  author: string;
  /** 插件简介。 */
  description: string;
  /** 许可证标识。 */
  license: string;
  /** 最低支持的平台版本，必须符合 semver。 */
  minPlatformVersion: string;
  /** 插件所需权限。 */
  permissions: PluginPermission[];
  /** 检索关键字。 */
  keywords?: string[];
  /** 图标路径或 URL。 */
  icon?: string;
  /** 主页地址。 */
  homepage?: string;
  /** 仓库地址。 */
  repository?: string;
}
