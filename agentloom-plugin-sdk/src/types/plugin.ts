import type { PluginManifest } from './manifest';
import type { CustomNodeDefinition } from './node';

/**
 * AgentLoom 插件生命周期契约。
 */
export interface AgentLoomPlugin {
  /** 插件清单。 */
  manifest: PluginManifest;
  /** 插件提供的节点定义。 */
  nodes: CustomNodeDefinition[];
  /** 插件激活钩子。 */
  activate(): Promise<void>;
  /** 插件停用钩子。 */
  deactivate(): Promise<void>;
}
