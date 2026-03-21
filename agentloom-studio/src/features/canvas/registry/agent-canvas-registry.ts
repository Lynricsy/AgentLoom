import { createPort, type NodeTypeConfig } from '../types/nodeTypeRegistry'

export const AGENT_CANVAS_NODE_REGISTRY = new Map<string, NodeTypeConfig>([
  [
    'input-preprocessor',
    {
      type: 'input-preprocessor',
      category: 'tool',
      label: '输入预处理器',
      icon: 'Filter',
      description: '对输入数据进行转换预处理（JMESPath / JSONata / 模板 / 脚本）',
      colorToken: 'var(--color-type-tool)',
      inputPorts: [
        createPort('text-in', '文本输入', 'input', 'text', {
          description: '文本格式输入数据',
        }),
        createPort('json-in', 'JSON 输入', 'input', 'json', {
          description: 'JSON 格式输入数据',
        }),
      ],
      outputPorts: [
        createPort('text-out', '文本输出', 'output', 'text', {
          description: '文本格式转换结果',
          multiple: true,
          maxConnections: null,
        }),
        createPort('json-out', 'JSON 输出', 'output', 'json', {
          description: 'JSON 格式转换结果',
          multiple: true,
          maxConnections: null,
        }),
      ],
      configSchema: {
        type: 'object',
        properties: {
          transformType: {
            type: 'string',
            title: '转换类型',
            enum: ['jmespath', 'jsonata', 'template', 'script'],
            default: 'jmespath',
          },
          expression: {
            type: 'string',
            title: '转换表达式',
          },
          outputFormat: {
            type: 'string',
            title: '输出格式',
          },
        },
        required: ['transformType', 'expression'],
      },
    },
  ],
])
