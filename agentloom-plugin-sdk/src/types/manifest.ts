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
  /** RSA-PSS 签名 (base64)。 */
  signature?: string;
  /** 归档文件内容哈希 (SHA-256 hex)。 */
  contentHash?: string;
  /** 开发者密钥指纹 (SHA-256 hex)。 */
  developerKeyFingerprint?: string;
  /** WASM 入口文件路径 (相对于归档根目录)。 */
  wasmEntry?: string;
  /** WASM 沙箱配置。 */
  sandbox?: {
    /** 允许的 HTTP 主机白名单。 */
    allowedHosts?: string[];
    /** 最大内存页数 (1页=64KB, 默认 4096=256MB)。 */
    maxMemoryPages?: number;
    /** 执行超时毫秒 (默认 30000)。 */
    timeoutMs?: number;
  };
}
