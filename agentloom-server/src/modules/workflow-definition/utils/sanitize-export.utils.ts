import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
} from '../../../database/schema/workflow-definitions.schema';

type ExportableWorkflowDefinition = {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport | null;
};

const SENSITIVE_CONFIG_KEYS = new Set([
  'apiKey',
  'api_key',
  'secretKey',
  'secret_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'password',
  'credentials',
  'connectionString',
  'connection_string',
]);

const TENANT_SPECIFIC_KEYS = new Set([
  'tenantId',
  'tenant_id',
  'organizationId',
  'organization_id',
  'orgId',
  'org_id',
  'userId',
  'user_id',
  'createdBy',
  'created_by',
  'updatedBy',
  'updated_by',
]);

const MCP_SENSITIVE_KEYS = new Set(['apiKey', 'api_key', 'env']);

export function sanitizeDefinition(
  definition: ExportableWorkflowDefinition,
): ExportableWorkflowDefinition {
  return {
    nodes: definition.nodes.map((node) => sanitizeNode(node)),
    edges: definition.edges.map((edge) => sanitizeEdge(edge)),
    viewport: definition.viewport,
  };
}

function sanitizeNode(node: ReactFlowNode): ReactFlowNode {
  const sanitized: ReactFlowNode = { ...node };

  if (sanitized.data) {
    sanitized.data = sanitizeObject(sanitized.data) as ReactFlowNode['data'];
  }

  return sanitized;
}

function sanitizeEdge(edge: ReactFlowEdge): ReactFlowEdge {
  const sanitized: ReactFlowEdge = { ...edge };

  if (sanitized.data) {
    sanitized.data = sanitizeObject(sanitized.data) as ReactFlowEdge['data'];
  }

  return sanitized;
}

function sanitizeValue(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, parentKey));
  }

  if (!isRecord(value)) {
    return value;
  }

  return sanitizeObject(value, parentKey);
}

function sanitizeObject(
  value: Record<string, unknown>,
  parentKey?: string,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (shouldStripKey(key, parentKey)) {
      continue;
    }

    sanitized[key] = sanitizeValue(nestedValue, key);
  }

  return sanitized;
}

function shouldStripKey(key: string, parentKey?: string): boolean {
  if (SENSITIVE_CONFIG_KEYS.has(key)) {
    return true;
  }

  if (TENANT_SPECIFIC_KEYS.has(key)) {
    return true;
  }

  if (parentKey === 'mcpConfig' && MCP_SENSITIVE_KEYS.has(key)) {
    return true;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
