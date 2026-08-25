import type { CustomNodeCategory } from './manifest';
import type { NodeExecutionContext, NodeExecutionResult } from './execution';
import type { PortDefinition } from './port';

/**
 * 轻量 JSON Schema 结构定义，用于描述节点配置模型。
 */
export interface JsonSchemaDefinition {
  /** JSON Schema 类型。 */
  type?: string;
  /** 标题。 */
  title?: string;
  /** 说明文本。 */
  description?: string;
  /** 对象属性定义。 */
  properties?: Record<string, JsonSchemaDefinition>;
  /** 数组元素定义。 */
  items?: JsonSchemaDefinition | JsonSchemaDefinition[];
  /** 必填字段列表。 */
  required?: string[];
  /** 枚举值列表。 */
  enum?: string[];
  /** 默认值。 */
  default?: unknown;
  /** 允许透传附加 JSON Schema 字段。 */
  [key: string]: unknown;
}

/**
 * 自定义插件节点定义。
 */
export interface CustomNodeDefinition {
  /** 节点类型标识。 */
  type: string;
  /** 节点展示名称。 */
  label: string;
  /** 节点分类。 */
  category: CustomNodeCategory;
  /** 节点描述。 */
  description: string;
  /** 输入端口集合。 */
  inputPorts: PortDefinition[];
  /** 输出端口集合。 */
  outputPorts: PortDefinition[];
  /** 节点配置 Schema。 */
  configSchema?: Record<string, unknown>;
  /**
   * 节点执行函数，仅用于 CLI `dev` 本地预览，不是服务端执行契约。
   *
   * 服务端只执行 WASM：导出 `execute`，输入 JSON envelope
   * `{nodeType, inputs, config}`，输出为端口输出直出对象。
   */
  execute(context: NodeExecutionContext): Promise<NodeExecutionResult>;
}
