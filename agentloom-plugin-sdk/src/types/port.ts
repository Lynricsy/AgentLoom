const portDataTypes = [
  'model',
  'text',
  'json',
  'array',
  'image',
  'audio',
  'tool',
  'sandbox',
  'knowledge',
  'skill',
  'agent',
  'memory',
  'exec',
  'volume',
] as const;

/**
 * 端口数据类型全集。canonical 定义在 `@agentloom/contracts` 的 `PORT_DATA_TYPES`，
 * 本处为插件生态镜像；新增取值必须先加到 contracts，
 * 由 contracts 的 `port-data-type.test.ts` 做机械同步校验。
 */
export type PortDataType =
  | 'model'
  | 'text'
  | 'json'
  | 'array'
  | 'image'
  | 'audio'
  | 'tool'
  | 'sandbox'
  | 'knowledge'
  | 'skill'
  | 'agent'
  | 'memory'
  | 'exec'
  | 'volume';

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
