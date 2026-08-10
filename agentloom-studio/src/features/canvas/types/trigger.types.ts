import type { WorkflowInputFieldDefinition } from '@/features/workflow/types'
import { type PortDefinition } from './nodeTypeRegistry'
import { createPort } from './portSchema'

/**
 * Manual trigger 输出字段 — 存储在 trigger 节点 config 中的工作简化副本。
 */
export interface ManualTriggerOutputField {
  id: string
  label: string
  type: 'text' | 'number' | 'single_select' | 'multi_select'
}

function fieldTypeToPortDataType(fieldType: string): 'text' | 'json' {
  return fieldType === 'text' ? 'text' : 'json'
}

/**
 * 从 outputFields 构建 manual trigger 输出端口。
 * 始终保留 exec-out，每个 field 生成一个命名输出端口。
 */
export function buildManualTriggerOutputPorts(
  fields: readonly ManualTriggerOutputField[],
): PortDefinition[] {
  const execPort = createPort('exec-out', '', 'output', 'exec', {
    description: '执行流出口，触发后启动工作流的后续节点',
  })

  if (fields.length === 0) {
    return [
      execPort,
      createPort('payload-out', '触发数据', 'output', 'json', {
        description: '手动触发时传入的表单参数数据',
      }),
    ]
  }

  return [
    execPort,
    ...fields.map((field) =>
      createPort(field.id, field.label, 'output', fieldTypeToPortDataType(field.type), {
        description: `输入参数: ${field.label}`,
      }),
    ),
  ]
}

/**
 * 从 WorkflowInputSchema.fields 转换为 ManualTriggerOutputField[]
 */
export function inputSchemaFieldsToOutputFields(
  fields: readonly WorkflowInputFieldDefinition[],
): ManualTriggerOutputField[] {
  return fields.map((field) => ({
    id: field.id,
    label: field.label,
    type: field.type,
  }))
}

/**
 * 从 trigger config 解析 outputFields
 */
export function parseManualTriggerConfig(
  config: Record<string, unknown>,
): { outputFields: ManualTriggerOutputField[] } {
  const raw = config.outputFields
  if (!Array.isArray(raw)) {
    return { outputFields: [] }
  }

  const outputFields = raw
    .filter(
      (item): item is { id: string; label: string; type: string } =>
        typeof item === 'object'
        && item !== null
        && typeof (item as any).id === 'string'
        && typeof (item as any).label === 'string',
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      type: (['text', 'number', 'single_select', 'multi_select'].includes(item.type)
        ? item.type
        : 'text') as ManualTriggerOutputField['type'],
    }))

  return { outputFields }
}
