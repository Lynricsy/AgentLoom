import { z } from 'zod';

import {
  CUSTOM_NODE_CATEGORIES,
  PORT_DATA_TYPES,
  type CustomNodeCategory,
  type PortDataType,
} from '../types';

const portDataTypeValues = [...PORT_DATA_TYPES] as [PortDataType, ...PortDataType[]];
const customNodeCategoryValues = [...CUSTOM_NODE_CATEGORIES] as [
  CustomNodeCategory,
  ...CustomNodeCategory[],
];

/**
 * 端口数据类型枚举校验器。
 */
export const PortDataTypeSchema = z.enum(portDataTypeValues);

/**
 * 端口定义运行时校验器。
 */
export const PortDefinitionSchema = z.object({
  id: z.string().trim().min(1, { message: 'id 不能为空。' }),
  label: z.string().trim().min(1, { message: 'label 不能为空。' }),
  dataType: PortDataTypeSchema,
  required: z.boolean().optional(),
  description: z.string().optional(),
});

/**
 * 自定义节点定义的可序列化部分校验器。
 */
export const CustomNodeDefinitionSchema = z
  .object({
    type: z.string().trim().min(1, { message: 'type 不能为空。' }),
    label: z.string().trim().min(1, { message: 'label 不能为空。' }),
    category: z.enum(customNodeCategoryValues),
    description: z.string().trim().min(1, { message: 'description 不能为空。' }),
    inputPorts: z.array(PortDefinitionSchema),
    outputPorts: z.array(PortDefinitionSchema),
    configSchema: z.record(z.unknown()).optional(),
  })
  .strip();
