import { z } from 'zod';

/**
 * 端口数据类型的 canonical 全集。
 *
 * 取值规则：agentloom-server、agentloom-studio、agentloom-type-engine
 * (`src/types/port.rs`)、agentloom-plugin-sdk (`src/types/port.ts`) 四处实际使用值的并集。
 * 任何一端新增取值必须先加到这里，`port-data-type-sync.test.ts` 是机械闸门。
 */
export const PORT_DATA_TYPES = [
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

export const PortDataTypeSchema = z.enum(PORT_DATA_TYPES);

export type PortDataType = z.infer<typeof PortDataTypeSchema>;

export const PORT_DIRECTIONS = ['input', 'output'] as const;

export const PortDirectionSchema = z.enum(PORT_DIRECTIONS);

export type PortDirection = z.infer<typeof PortDirectionSchema>;
