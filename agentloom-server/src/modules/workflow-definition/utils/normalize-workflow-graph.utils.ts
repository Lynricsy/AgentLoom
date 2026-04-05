import type {
  ReactFlowEdge,
  ReactFlowNode,
} from '../../../database/schema/workflow-definitions.schema';

type WorkflowNodeCategory =
  | 'agent'
  | 'tool'
  | 'trigger'
  | 'knowledge'
  | 'output'
  | 'control'
  | 'plugin'
  | 'memory';

type PortDirection = 'input' | 'output';

type PortDataType =
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

interface BaseTypeSchema {
  kind: PortDataType;
  title?: string;
  description?: string;
  nullable?: boolean;
}

interface ScalarTypeSchema extends BaseTypeSchema {
  kind: Exclude<PortDataType, 'json'>;
  format?: string;
  examples?: unknown[];
}

interface ObjectTypeSchema extends BaseTypeSchema {
  kind: 'json';
  shape: 'object';
  properties: Record<string, TypeSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

interface ArrayTypeSchema extends BaseTypeSchema {
  kind: 'json';
  shape: 'array';
  items: TypeSchema;
  minItems?: number;
  maxItems?: number;
}

type TypeSchema = ScalarTypeSchema | ObjectTypeSchema | ArrayTypeSchema;

interface PortTemplate {
  id: string;
  label: string;
  direction: PortDirection;
  dataType: PortDataType;
  acceptsAnyDataType?: boolean;
  description?: string;
  required?: boolean;
  multiple?: boolean;
  maxConnections?: number | null;
  schema?: TypeSchema;
}

type JsonRecord = Record<string, unknown>;

const WORKFLOW_NODE_CATEGORY_BY_NODE_TYPE: Record<
  string,
  WorkflowNodeCategory
> = {
  'chat-agent': 'agent',
  'llm-model': 'agent',
  'smart-routing': 'agent',
  agent: 'agent',
  skill: 'agent',
  'http-tool': 'tool',
  'code-tool': 'tool',
  'mcp-tool': 'tool',
  sandbox: 'tool',
  'input-preprocessor': 'tool',
  workspace: 'tool',
  'manual-trigger': 'trigger',
  'schedule-trigger': 'trigger',
  'webhook-trigger': 'trigger',
  'api-event-trigger': 'trigger',
  'knowledge-base': 'knowledge',
  'text-output': 'output',
  'json-output': 'output',
  condition: 'control',
  loop: 'control',
  iteration: 'control',
  'loop-start': 'control',
  'iteration-start': 'control',
  'loop-state': 'control',
  result: 'control',
  break: 'control',
  continue: 'control',
  'reusable-block': 'control',
  merge: 'control',
  plugin: 'plugin',
  memory: 'memory',
};

const WORKFLOW_NODE_CATEGORY_VALUES = new Set<WorkflowNodeCategory>([
  'agent',
  'tool',
  'trigger',
  'knowledge',
  'output',
  'control',
  'plugin',
  'memory',
]);

const PORT_DATA_TYPE_VALUES = new Set<PortDataType>([
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
]);

const NODE_CONFIG_KEY_ALIASES: Record<string, string> = {
  output_fields: 'outputFields',
  port_labels: 'portLabels',
  default_state: 'defaultState',
  output_mode: 'outputMode',
  is_collapsed: 'isCollapsed',
  output_key: 'outputKey',
  expose_previous_result: 'exposePreviousResult',
  expose_is_first: 'exposeIsFirst',
  expose_total: 'exposeTotal',
  expose_is_last: 'exposeIsLast',
  query_params: 'queryParams',
  auth_type: 'authType',
  auth_config: 'authConfig',
  ip_whitelist: 'ipWhitelist',
  event_source: 'eventSource',
  event_type: 'eventType',
  filter_expression: 'filterExpression',
  knowledge_base_id: 'knowledgeBaseId',
  skill_id: 'skillId',
  skill_name: 'skillName',
  skill_description: 'skillDescription',
  workspace_id: 'workspaceId',
  workspace_name: 'workspaceName',
  memory_instance_id: 'memoryInstanceId',
  merge_key: 'mergeKey',
  transform_type: 'transformType',
  output_format: 'outputFormat',
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPortDataType(value: unknown): value is PortDataType {
  return (
    typeof value === 'string' &&
    PORT_DATA_TYPE_VALUES.has(value as PortDataType)
  );
}

function isPortDirection(value: unknown): value is PortDirection {
  return value === 'input' || value === 'output';
}

function readNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function readBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return undefined;
}

function readNumber(...values: unknown[]): number | null | undefined {
  for (const value of values) {
    if (value === null) {
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function readOptionalHandle(
  primary: unknown,
  secondary: unknown,
): string | null | undefined {
  if (typeof primary === 'string') {
    const normalized = primary.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (primary === null) {
    return null;
  }

  if (typeof secondary === 'string') {
    const normalized = secondary.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (secondary === null) {
    return null;
  }

  return undefined;
}

function readNodePortRecords(
  nodeData: JsonRecord,
  direction: PortDirection,
): JsonRecord[] {
  const rawPorts =
    direction === 'input'
      ? Array.isArray(nodeData.inputPorts)
        ? nodeData.inputPorts
        : Array.isArray(nodeData.input_ports)
          ? nodeData.input_ports
          : []
      : Array.isArray(nodeData.outputPorts)
        ? nodeData.outputPorts
        : Array.isArray(nodeData.output_ports)
          ? nodeData.output_ports
          : [];

  return rawPorts.filter(isRecord);
}

function normalizeHandleIdentity(handle: string): string {
  return handle
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/-input$/, '')
    .replace(/-output$/, '')
    .replace(/-in$/, '')
    .replace(/-out$/, '');
}

function normalizeHandleAgainstPorts(
  rawHandle: string | null | undefined,
  portRecords: JsonRecord[],
): string | null | undefined {
  if (rawHandle === null || rawHandle === undefined) {
    return rawHandle;
  }

  const portIds = portRecords
    .map((port) => readNonEmptyString(port.id))
    .filter((portId): portId is string => typeof portId === 'string');

  if (portIds.length === 0 || portIds.includes(rawHandle)) {
    return rawHandle;
  }

  const normalizedHandle = normalizeHandleIdentity(rawHandle);
  const matches = portIds.filter(
    (portId) => normalizeHandleIdentity(portId) === normalizedHandle,
  );

  if (matches.length === 1) {
    return matches[0];
  }

  return rawHandle;
}

function normalizeLegacyPortDataType(value: unknown): PortDataType | null {
  if (isPortDataType(value)) {
    return value;
  }

  return value === 'number' || value === 'boolean' ? 'json' : null;
}

function createScalarSchema(
  kind: Exclude<PortDataType, 'json'>,
  title: string,
  description?: string,
): ScalarTypeSchema {
  return {
    kind,
    title,
    description,
  };
}

function createJsonSchema(
  title: string,
  description?: string,
): ObjectTypeSchema {
  return {
    kind: 'json',
    shape: 'object',
    title,
    description,
    properties: {},
    additionalProperties: true,
  };
}

function createArraySchema(
  title: string,
  description?: string,
): ArrayTypeSchema {
  return {
    kind: 'json',
    shape: 'array',
    title,
    description,
    items: createJsonSchema(`${title} Item`),
  };
}

function createDefaultSchemaForDataType(
  dataType: PortDataType,
  title: string,
  description?: string,
): TypeSchema {
  if (dataType === 'json') {
    return createJsonSchema(title, description);
  }

  if (dataType === 'array') {
    return createArraySchema(title, description);
  }

  return createScalarSchema(dataType, title, description);
}

function cloneTypeSchema(schema: TypeSchema): TypeSchema {
  if (schema.kind === 'json') {
    if (schema.shape === 'object') {
      return {
        ...schema,
        properties: Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            cloneTypeSchema(value),
          ]),
        ),
        required: schema.required ? [...schema.required] : undefined,
      };
    }

    return {
      ...schema,
      items: cloneTypeSchema(schema.items),
    };
  }

  return {
    ...schema,
    examples: schema.examples ? [...schema.examples] : undefined,
  };
}

function normalizeTypeSchema(
  schema: unknown,
  fallbackTitle: string,
  fallbackDescription?: string,
): TypeSchema | null {
  if (!isRecord(schema)) {
    return null;
  }

  const kind = normalizeLegacyPortDataType(schema.kind);
  if (!kind) {
    return null;
  }

  const title = readNonEmptyString(schema.title) ?? fallbackTitle;
  const description =
    readNonEmptyString(schema.description) ?? fallbackDescription;
  const nullable = readBoolean(schema.nullable);

  if (kind !== 'json') {
    return {
      kind,
      title,
      description,
      ...(nullable !== undefined ? { nullable } : {}),
      ...(readNonEmptyString(schema.format)
        ? { format: readNonEmptyString(schema.format) }
        : {}),
      ...(Array.isArray(schema.examples) ? { examples: schema.examples } : {}),
    };
  }

  if (schema.shape === 'array') {
    return {
      kind: 'json',
      shape: 'array',
      title,
      description,
      ...(nullable !== undefined ? { nullable } : {}),
      items:
        normalizeTypeSchema(schema.items, `${title} Item`, description) ??
        createJsonSchema(`${title} Item`),
      ...(typeof schema.minItems === 'number'
        ? { minItems: schema.minItems }
        : {}),
      ...(typeof schema.maxItems === 'number'
        ? { maxItems: schema.maxItems }
        : {}),
    };
  }

  const properties = isRecord(schema.properties)
    ? Object.fromEntries(
        Object.entries(schema.properties).flatMap(([key, value]) => {
          const normalizedValue = normalizeTypeSchema(value, key);
          return normalizedValue ? [[key, normalizedValue]] : [];
        }),
      )
    : {};

  return {
    kind: 'json',
    shape: 'object',
    title,
    description,
    ...(nullable !== undefined ? { nullable } : {}),
    properties,
    ...(Array.isArray(schema.required)
      ? {
          required: schema.required.filter(
            (item): item is string =>
              typeof item === 'string' && item.trim().length > 0,
          ),
        }
      : {}),
    additionalProperties:
      readBoolean(schema.additionalProperties, schema.additional_properties) ??
      true,
  };
}

function inferDataTypeFromSchema(schema: unknown): PortDataType | null {
  if (!isRecord(schema)) {
    return null;
  }

  const kind = normalizeLegacyPortDataType(schema.kind);
  if (!kind) {
    return null;
  }

  if (kind !== 'json') {
    return kind;
  }

  return schema.shape === 'array' ? 'array' : 'json';
}

function normalizeKnownConfig(rawConfig: unknown): JsonRecord | undefined {
  if (!isRecord(rawConfig)) {
    return undefined;
  }

  const normalizedConfig: JsonRecord = { ...rawConfig };

  for (const [legacyKey, canonicalKey] of Object.entries(
    NODE_CONFIG_KEY_ALIASES,
  )) {
    if (
      normalizedConfig[canonicalKey] === undefined &&
      normalizedConfig[legacyKey] !== undefined
    ) {
      normalizedConfig[canonicalKey] = normalizedConfig[legacyKey];
    }

    delete normalizedConfig[legacyKey];
  }

  return normalizedConfig;
}

function createPortTemplate(
  id: string,
  label: string,
  direction: PortDirection,
  dataType: PortDataType,
  options: Omit<PortTemplate, 'id' | 'label' | 'direction' | 'dataType'> = {},
): PortTemplate {
  return {
    id,
    label,
    direction,
    dataType,
    ...options,
    schema:
      options.schema ??
      createDefaultSchemaForDataType(dataType, label, options.description),
  };
}

function createExecInPortTemplate(): PortTemplate {
  return createPortTemplate('exec-in', '', 'input', 'exec');
}

function createExecOutPortTemplate(): PortTemplate {
  return createPortTemplate('exec-out', '', 'output', 'exec');
}

function createAnyJsonPortTemplate(
  id: string,
  label: string,
  direction: PortDirection,
): PortTemplate {
  return createPortTemplate(id, label, direction, 'json', {
    acceptsAnyDataType: true,
    schema: {
      kind: 'json',
      shape: 'object',
      title: label,
      properties: {},
      additionalProperties: true,
    },
  });
}

const DEFAULT_PORT_TEMPLATES_BY_NODE_TYPE: Record<
  string,
  { input: PortTemplate[]; output: PortTemplate[] }
> = {
  'chat-agent': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('messages-in', '消息', 'input', 'json'),
      createPortTemplate('model-in', '模型', 'input', 'model'),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('reply-out', '回复', 'output', 'text'),
      createPortTemplate('structured-out', '结构化', 'output', 'json'),
    ],
  },
  'llm-model': {
    input: [createExecInPortTemplate()],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('model-out', '模型', 'output', 'model', {
        multiple: true,
        maxConnections: 5,
      }),
    ],
  },
  'http-tool': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('request-in', '请求体', 'input', 'json'),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('response-out', '响应体', 'output', 'json'),
    ],
  },
  'code-tool': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('input-in', '参数', 'input', 'json'),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('result-out', '返回值', 'output', 'json'),
      createPortTemplate('stdout-out', 'stdout', 'output', 'text'),
    ],
  },
  'mcp-tool': {
    input: [createExecInPortTemplate()],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('tool-out', '工具', 'output', 'tool'),
    ],
  },
  sandbox: {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('volume-in', '工作区', 'input', 'volume'),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('sandbox-out', '沙箱', 'output', 'sandbox', {
        multiple: true,
        maxConnections: null,
      }),
    ],
  },
  'manual-trigger': {
    input: [],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('payload-out', '触发数据', 'output', 'json'),
    ],
  },
  'schedule-trigger': {
    input: [],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('payload-out', '触发数据', 'output', 'json'),
    ],
  },
  'webhook-trigger': {
    input: [],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('payload-out', '触发数据', 'output', 'json'),
    ],
  },
  'api-event-trigger': {
    input: [],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('payload-out', '触发数据', 'output', 'json'),
    ],
  },
  'knowledge-base': {
    input: [createExecInPortTemplate()],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('knowledge-out', '知识库', 'output', 'knowledge'),
    ],
  },
  'text-output': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('content-in', '文本', 'input', 'text'),
    ],
    output: [],
  },
  'json-output': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('content-in', 'JSON', 'input', 'json'),
    ],
    output: [],
  },
  condition: {
    input: [
      createExecInPortTemplate(),
      createAnyJsonPortTemplate('input-0', '输入 1', 'input'),
    ],
    output: [
      createPortTemplate('branch-0', 'IF', 'output', 'json'),
      createPortTemplate('else', 'ELSE', 'output', 'json'),
    ],
  },
  loop: {
    input: [
      createExecInPortTemplate(),
      createAnyJsonPortTemplate('state-in', '初始状态', 'input'),
    ],
    output: [createExecOutPortTemplate()],
  },
  iteration: {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('items-in', '数组', 'input', 'array'),
    ],
    output: [createExecOutPortTemplate()],
  },
  'loop-start': {
    input: [],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('round', '轮次', 'output', 'json', {
        acceptsAnyDataType: true,
      }),
      createAnyJsonPortTemplate('state', '当前状态', 'output'),
    ],
  },
  'iteration-start': {
    input: [],
    output: [
      createExecOutPortTemplate(),
      createAnyJsonPortTemplate('item', '当前项', 'output'),
      createPortTemplate('index', '索引', 'output', 'json', {
        acceptsAnyDataType: true,
      }),
    ],
  },
  'loop-state': {
    input: [
      createExecInPortTemplate(),
      createAnyJsonPortTemplate('state-in', '下一轮状态', 'input'),
    ],
    output: [createExecOutPortTemplate()],
  },
  result: {
    input: [
      createExecInPortTemplate(),
      createAnyJsonPortTemplate('value-in', '结果值', 'input'),
    ],
    output: [],
  },
  break: {
    input: [createExecInPortTemplate()],
    output: [],
  },
  continue: {
    input: [createExecInPortTemplate()],
    output: [],
  },
  'reusable-block': {
    input: [],
    output: [],
  },
  'smart-routing': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('model-in-0', '模型 1', 'input', 'model', {
        required: true,
      }),
      createPortTemplate('model-in-1', '模型 2', 'input', 'model', {
        required: true,
      }),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('model-out', '选定模型', 'output', 'model', {
        multiple: true,
        maxConnections: 5,
      }),
    ],
  },
  plugin: {
    input: [],
    output: [],
  },
  'input-preprocessor': {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('text-in', '文本', 'input', 'text'),
      createPortTemplate('json-in', 'JSON', 'input', 'json'),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('text-out', '文本', 'output', 'text', {
        multiple: true,
        maxConnections: null,
      }),
      createPortTemplate('json-out', 'JSON', 'output', 'json', {
        multiple: true,
        maxConnections: null,
      }),
    ],
  },
  memory: {
    input: [createExecInPortTemplate()],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('memory-out', '记忆', 'output', 'memory'),
    ],
  },
  agent: {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('text-in', '文本', 'input', 'text', {
        required: true,
      }),
      createPortTemplate('sandbox-in', '沙箱', 'input', 'sandbox', {
        maxConnections: 1,
      }),
      createPortTemplate('context-in', '上下文', 'input', 'json'),
      createPortTemplate('skills-in', 'Skills', 'input', 'skill', {
        multiple: true,
        maxConnections: null,
      }),
      createPortTemplate('tools-in', '扩展工具', 'input', 'tool', {
        multiple: true,
        maxConnections: null,
      }),
      createPortTemplate('sub-agents-in', '子 Agent', 'input', 'agent', {
        multiple: true,
        maxConnections: null,
      }),
      createPortTemplate('schema-in', 'Schema', 'input', 'json', {
        maxConnections: 1,
      }),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('agent-out', '回复', 'output', 'text', {
        multiple: true,
        maxConnections: null,
      }),
      createPortTemplate('structured-out', '结构化', 'output', 'json', {
        multiple: true,
        maxConnections: null,
      }),
    ],
  },
  skill: {
    input: [createExecInPortTemplate()],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('skill-out', 'Skill', 'output', 'skill'),
    ],
  },
  workspace: {
    input: [createExecInPortTemplate()],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('volume-out', '工作区', 'output', 'volume'),
    ],
  },
  merge: {
    input: [
      createExecInPortTemplate(),
      createPortTemplate('input-0', '输入 1', 'input', 'json'),
      createPortTemplate('input-1', '输入 2', 'input', 'json'),
    ],
    output: [
      createExecOutPortTemplate(),
      createPortTemplate('merged-out', '合并结果', 'output', 'json'),
    ],
  },
};

function inferPortDirectionFromId(
  portId: string,
  fallback: PortDirection,
): PortDirection {
  if (portId.endsWith('-in') || portId.endsWith('_in')) {
    return 'input';
  }

  if (portId.endsWith('-out') || portId.endsWith('_out')) {
    return 'output';
  }

  return fallback;
}

function inferPortDataTypeFromId(portId: string): PortDataType {
  if (portId.startsWith('exec')) return 'exec';
  if (portId.startsWith('model')) return 'model';
  if (portId === 'messages-in') return 'json';
  if (
    portId === 'reply-out' ||
    portId === 'agent-out' ||
    portId === 'stdout-out' ||
    portId === 'content-in' ||
    portId.startsWith('text-')
  ) {
    return 'text';
  }
  if (portId.startsWith('volume')) return 'volume';
  if (portId.startsWith('sandbox')) return 'sandbox';
  if (portId.startsWith('knowledge')) return 'knowledge';
  if (portId.startsWith('skill')) return 'skill';
  if (portId.startsWith('tool') || portId.startsWith('tools')) return 'tool';
  if (portId.startsWith('memory')) return 'memory';
  if (portId.startsWith('sub-agents')) return 'agent';
  if (
    portId.startsWith('payload') ||
    portId.startsWith('json') ||
    portId.startsWith('request') ||
    portId.startsWith('response') ||
    portId.startsWith('result') ||
    portId.startsWith('structured') ||
    portId.startsWith('context') ||
    portId.startsWith('schema') ||
    portId.startsWith('input-') ||
    portId.startsWith('branch-') ||
    portId === 'else' ||
    portId === 'item' ||
    portId === 'index' ||
    portId === 'total' ||
    portId === 'round' ||
    portId === 'state' ||
    portId === 'state-in' ||
    portId === 'value-in' ||
    portId === 'merged-out' ||
    portId === 'previous-result' ||
    portId === 'is-first' ||
    portId === 'is-last'
  ) {
    return 'json';
  }

  return 'json';
}

function portTemplateToRecord(template: PortTemplate): JsonRecord {
  return {
    id: template.id,
    label: template.label,
    direction: template.direction,
    dataType: template.dataType,
    ...(template.acceptsAnyDataType !== undefined
      ? { acceptsAnyDataType: template.acceptsAnyDataType }
      : {}),
    ...(template.description ? { description: template.description } : {}),
    required: template.required ?? false,
    multiple: template.multiple ?? false,
    maxConnections:
      template.maxConnections !== undefined ? template.maxConnections : 1,
    schema: cloneTypeSchema(
      template.schema ??
        createDefaultSchemaForDataType(
          template.dataType,
          template.label || template.id,
          template.description,
        ),
    ),
  };
}

function normalizePortRecord(
  port: JsonRecord,
  defaultTemplate: PortTemplate | undefined,
  fallbackDirection: PortDirection,
): JsonRecord | null {
  const portId = readNonEmptyString(port.id);
  if (!portId) {
    return null;
  }

  const label =
    readNonEmptyString(port.label) ?? defaultTemplate?.label ?? portId;
  const description =
    readNonEmptyString(port.description) ?? defaultTemplate?.description;
  const schemaFromData = normalizeTypeSchema(port.schema, label, description);
  const dataType =
    defaultTemplate?.dataType ??
    normalizeLegacyPortDataType(port.dataType) ??
    normalizeLegacyPortDataType(port.data_type) ??
    inferDataTypeFromSchema(port.schema) ??
    inferPortDataTypeFromId(portId);
  const direction =
    defaultTemplate?.direction ??
    (isPortDirection(port.direction)
      ? port.direction
      : inferPortDirectionFromId(portId, fallbackDirection));

  return {
    id: portId,
    label,
    direction,
    dataType,
    ...(readBoolean(
      port.acceptsAnyDataType,
      port.accepts_any_data_type,
      defaultTemplate?.acceptsAnyDataType,
    ) !== undefined
      ? {
          acceptsAnyDataType: readBoolean(
            port.acceptsAnyDataType,
            port.accepts_any_data_type,
            defaultTemplate?.acceptsAnyDataType,
          ),
        }
      : {}),
    ...(description ? { description } : {}),
    required: readBoolean(port.required, defaultTemplate?.required) ?? false,
    multiple: readBoolean(port.multiple, defaultTemplate?.multiple) ?? false,
    maxConnections:
      readNumber(
        port.maxConnections,
        port.max_connections,
        defaultTemplate?.maxConnections,
      ) ?? 1,
    schema: cloneTypeSchema(
      defaultTemplate?.schema ??
        schemaFromData ??
        createDefaultSchemaForDataType(dataType, label, description),
    ),
  };
}

function buildDefaultPortTemplates(
  nodeType: string | undefined,
  nodeData: JsonRecord,
  direction: PortDirection,
): PortTemplate[] {
  if (!nodeType) {
    return [];
  }

  const templates = DEFAULT_PORT_TEMPLATES_BY_NODE_TYPE[nodeType];
  if (!templates) {
    return [];
  }

  if (nodeType === 'agent' && direction === 'input') {
    const runtimeMode = readNonEmptyString(
      nodeData.agentRuntimeMode,
      nodeData.agent_runtime_mode,
      isRecord(nodeData.config) ? nodeData.config.agentRuntimeMode : undefined,
      isRecord(nodeData.config)
        ? nodeData.config.agent_runtime_mode
        : undefined,
    );

    if (runtimeMode === 'no_sandbox') {
      return templates.input.filter((template) => template.id !== 'sandbox-in');
    }
  }

  return [...templates[direction]];
}

function hydratePortRecords(
  rawPorts: JsonRecord[],
  defaultTemplates: PortTemplate[],
  fallbackDirection: PortDirection,
): JsonRecord[] {
  const normalizedRawPorts = rawPorts
    .map((port) => {
      const portId = readNonEmptyString(port.id);
      const defaultTemplate = portId
        ? defaultTemplates.find((template) => template.id === portId)
        : undefined;

      return normalizePortRecord(port, defaultTemplate, fallbackDirection);
    })
    .filter((port): port is JsonRecord => port !== null);

  if (defaultTemplates.length === 0) {
    return normalizedRawPorts;
  }

  const normalizedById = new Map(
    normalizedRawPorts
      .map((port) => [readNonEmptyString(port.id), port] as const)
      .filter((entry): entry is readonly [string, JsonRecord] => !!entry[0]),
  );
  const defaultTemplateIds = new Set(
    defaultTemplates.map((template) => template.id),
  );
  const orderedPorts = defaultTemplates.map((template) => {
    const existingPort = normalizedById.get(template.id);
    return existingPort ?? portTemplateToRecord(template);
  });

  const extraPorts = normalizedRawPorts.filter((port) => {
    const portId = readNonEmptyString(port.id);
    return portId ? !defaultTemplateIds.has(portId) : false;
  });

  return [...orderedPorts, ...extraPorts];
}

function resolveWorkflowNodeType(
  node: ReactFlowNode,
  nodeData: JsonRecord,
): string | undefined {
  const dataNodeType = readNonEmptyString(
    nodeData.nodeType,
    nodeData.node_type,
  );
  if (dataNodeType) {
    return dataNodeType;
  }

  if (
    typeof node.type === 'string' &&
    node.type.trim().length > 0 &&
    node.type !== 'workflow-node' &&
    Object.prototype.hasOwnProperty.call(
      WORKFLOW_NODE_CATEGORY_BY_NODE_TYPE,
      node.type,
    )
  ) {
    return node.type.trim();
  }

  return undefined;
}

function resolveWorkflowNodeCategory(
  nodeType: string | undefined,
  nodeData: JsonRecord,
  rawNodeType: string | undefined,
): string | undefined {
  return (
    readNonEmptyString(nodeData.category, nodeData.node_category) ??
    (nodeType ? WORKFLOW_NODE_CATEGORY_BY_NODE_TYPE[nodeType] : undefined) ??
    (rawNodeType &&
    WORKFLOW_NODE_CATEGORY_VALUES.has(rawNodeType as WorkflowNodeCategory)
      ? rawNodeType
      : undefined)
  );
}

function normalizeNodeData(
  nodeData: JsonRecord,
  nodeType: string | undefined,
  category: string | undefined,
): JsonRecord {
  const normalizedData: JsonRecord = { ...nodeData };
  const normalizedConfig = normalizeKnownConfig(nodeData.config);
  const portSourceData = normalizedConfig
    ? { ...nodeData, config: normalizedConfig }
    : nodeData;

  if (nodeType) {
    normalizedData.nodeType = nodeType;
    delete normalizedData.node_type;
  }

  if (category) {
    normalizedData.category = category;
    delete normalizedData.node_category;
  }

  normalizedData.inputPorts = hydratePortRecords(
    readNodePortRecords(portSourceData, 'input'),
    buildDefaultPortTemplates(nodeType, portSourceData, 'input'),
    'input',
  );
  delete normalizedData.input_ports;

  normalizedData.outputPorts = hydratePortRecords(
    readNodePortRecords(portSourceData, 'output'),
    buildDefaultPortTemplates(nodeType, portSourceData, 'output'),
    'output',
  );
  delete normalizedData.output_ports;

  const selectedAgentId = readNonEmptyString(
    nodeData.selectedAgentId,
    nodeData.selected_agent_id,
  );
  if (selectedAgentId) {
    normalizedData.selectedAgentId = selectedAgentId;
    delete normalizedData.selected_agent_id;
  }

  const agentVersionId = readNonEmptyString(
    nodeData.agentVersionId,
    nodeData.agent_version_id,
  );
  if (agentVersionId) {
    normalizedData.agentVersionId = agentVersionId;
    delete normalizedData.agent_version_id;
  }

  const agentName = readNonEmptyString(nodeData.agentName, nodeData.agent_name);
  if (agentName) {
    normalizedData.agentName = agentName;
    delete normalizedData.agent_name;
  }

  const transformType = readNonEmptyString(
    nodeData.transformType,
    nodeData.transform_type,
  );
  if (transformType) {
    normalizedData.transformType = transformType;
    delete normalizedData.transform_type;
  }

  const outputFormat = readNonEmptyString(
    nodeData.outputFormat,
    nodeData.output_format,
  );
  if (outputFormat) {
    normalizedData.outputFormat = outputFormat;
    delete normalizedData.output_format;
  }

  const agentRuntimeMode = readNonEmptyString(
    nodeData.agentRuntimeMode,
    nodeData.agent_runtime_mode,
  );
  if (agentRuntimeMode) {
    normalizedData.agentRuntimeMode = agentRuntimeMode;
    delete normalizedData.agent_runtime_mode;
  }

  if (normalizedConfig) {
    normalizedData.config = normalizedConfig;
  }

  return normalizedData;
}

function normalizeWorkflowNode(node: ReactFlowNode): ReactFlowNode {
  const nodeData = isRecord(node.data) ? node.data : {};
  const nodeType = resolveWorkflowNodeType(node, nodeData);
  const category = resolveWorkflowNodeCategory(nodeType, nodeData, node.type);

  return {
    ...node,
    ...(category ? { type: category } : {}),
    data: normalizeNodeData(nodeData, nodeType, category),
  };
}

function normalizeWorkflowEdge(
  edge: ReactFlowEdge,
  nodesById: Map<string, ReactFlowNode>,
): ReactFlowEdge {
  const rawEdge = edge as unknown as JsonRecord;
  const sourceHandle = readOptionalHandle(
    edge.sourceHandle,
    rawEdge.source_handle,
  );
  const targetHandle = readOptionalHandle(
    edge.targetHandle,
    rawEdge.target_handle,
  );
  const sourceNodeData = isRecord(nodesById.get(edge.source)?.data)
    ? (nodesById.get(edge.source)!.data as JsonRecord)
    : {};
  const targetNodeData = isRecord(nodesById.get(edge.target)?.data)
    ? (nodesById.get(edge.target)!.data as JsonRecord)
    : {};
  const normalizedSourceHandle = normalizeHandleAgainstPorts(
    sourceHandle,
    readNodePortRecords(sourceNodeData, 'output'),
  );
  const normalizedTargetHandle = normalizeHandleAgainstPorts(
    targetHandle,
    readNodePortRecords(targetNodeData, 'input'),
  );
  const {
    source_handle: _legacySourceHandle,
    target_handle: _legacyTargetHandle,
    ...rest
  } = rawEdge;

  return {
    ...(rest as unknown as ReactFlowEdge),
    ...(normalizedSourceHandle !== undefined
      ? { sourceHandle: normalizedSourceHandle }
      : {}),
    ...(normalizedTargetHandle !== undefined
      ? { targetHandle: normalizedTargetHandle }
      : {}),
  };
}

export function normalizeWorkflowNodesAndEdges(
  nodes: ReactFlowNode[] | null | undefined,
  edges: ReactFlowEdge[] | null | undefined,
): {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
} {
  const normalizedNodes = Array.isArray(nodes)
    ? nodes.map(normalizeWorkflowNode)
    : [];
  const nodesById = new Map(normalizedNodes.map((node) => [node.id, node]));
  const normalizedEdges = Array.isArray(edges)
    ? edges.map((edge) => normalizeWorkflowEdge(edge, nodesById))
    : [];

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };
}
