import type { CustomNodeDefinition, PortDataType, PortDefinition } from '../types';

/**
 * 创建带类型约束的输入端口定义。
 */
export function defineInputPort(options: {
  id: string;
  label: string;
  dataType: PortDataType;
  required?: boolean;
  description?: string;
}): PortDefinition {
  return { ...options };
}

/**
 * 创建带类型约束的输出端口定义。
 */
export function defineOutputPort(options: {
  id: string;
  label: string;
  dataType: PortDataType;
  description?: string;
}): PortDefinition {
  return { ...options };
}

/**
 * 创建一个浅冻结的节点定义对象。
 */
export function defineNode(definition: CustomNodeDefinition): Readonly<CustomNodeDefinition> {
  return Object.freeze(definition);
}
