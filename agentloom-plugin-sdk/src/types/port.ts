const portDataTypes = ['model', 'text', 'json', 'image', 'audio', 'tool', 'sandbox', 'knowledge', 'skill'] as const;

/**
 * Canonical 9 个端口数据类型，必须与 server/studio/type-engine 保持同步。
 */
export type PortDataType =
  | 'model'
  | 'text'
  | 'json'
  | 'image'
  | 'audio'
  | 'tool'
  | 'sandbox'
  | 'knowledge'
  | 'skill';

/**
 * 所有合法的 {@link PortDataType} 值。
 */
export const PORT_DATA_TYPES: readonly PortDataType[] = portDataTypes;

/**
 * 插件节点的输入或输出端口定义。
 */
export interface PortDefinition {
  /** 端口唯一标识。 */
  id: string;
  /** 端口展示名称。 */
  label: string;
  /** 端口承载的数据类型。 */
  dataType: PortDataType;
  /** 输入端口是否必填。 */
  required?: boolean;
  /** 端口用途说明。 */
  description?: string;
}
