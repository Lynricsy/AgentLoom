import { z } from 'zod';

import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
} from '../../../database/schema/workflow-definitions.schema';
import {
  type WorkflowInputSchema,
  workflowInputSchemaSchema,
} from '../../workflow/dto/workflow-input-schema.dto';
import { WORKFLOW_EXPORT_VERSION } from '../dto/workflow-export.dto';

const passthroughObjectSchema = z.record(z.string(), z.unknown());

const ImportWorkflowSchema = z.object({
  schema_version: z.literal(WORKFLOW_EXPORT_VERSION),
  exported_at: z.iso.datetime(),
  workflow: z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(2000).nullable(),
    definition: z.object({
      nodes: z.array(passthroughObjectSchema).min(1, 'Workflow must have at least one node'),
      edges: z.array(passthroughObjectSchema),
      viewport: passthroughObjectSchema,
    }),
    input_schema: z.unknown().nullable(),
  }),
});

type LooseObject = z.infer<typeof passthroughObjectSchema>;

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  workflow?: {
    name: string;
    description: string | null;
    definition: {
      nodes: ReactFlowNode[];
      edges: ReactFlowEdge[];
      viewport: ReactFlowViewport;
    };
    inputSchema: WorkflowInputSchema | null;
    nodeCount: number;
    edgeCount: number;
  };
}

function isLooseObject(value: unknown): value is LooseObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getNodeLabel(node: LooseObject): string {
  return typeof node.id === 'string' && node.id.length > 0 ? node.id : 'unknown';
}

function getEdgeLabel(edge: LooseObject): string {
  return typeof edge.id === 'string' && edge.id.length > 0 ? edge.id : 'unknown';
}

function validateNode(node: LooseObject): string[] {
  const errors: string[] = [];
  const nodeLabel = getNodeLabel(node);

  if (typeof node.id !== 'string' || node.id.length === 0) {
    errors.push('Node missing id');
  }

  if (typeof node.type !== 'string' || node.type.length === 0) {
    errors.push(`Node ${nodeLabel} missing type`);
  }

  if (!isLooseObject(node.position)) {
    errors.push(`Node ${nodeLabel} missing position`);
    return errors;
  }

  if (!isFiniteNumber(node.position.x) || !isFiniteNumber(node.position.y)) {
    errors.push(`Node ${nodeLabel} has invalid position`);
  }

  return errors;
}

function normalizeNode(node: LooseObject): ReactFlowNode {
  const id = typeof node.id === 'string' ? node.id : '';
  const type = typeof node.type === 'string' ? node.type : '';
  const position = isLooseObject(node.position) ? node.position : {};
  const x = isFiniteNumber(position.x) ? position.x : 0;
  const y = isFiniteNumber(position.y) ? position.y : 0;
  const data = isLooseObject(node.data) ? node.data : {};

  return {
    ...node,
    id,
    type,
    position: { x, y },
    data,
  };
}

function validateEdge(edge: LooseObject): string[] {
  const errors: string[] = [];
  const edgeLabel = getEdgeLabel(edge);

  if (typeof edge.source !== 'string' || edge.source.length === 0) {
    errors.push(`Edge ${edgeLabel} references invalid source: ${String(edge.source)}`);
  }

  if (typeof edge.target !== 'string' || edge.target.length === 0) {
    errors.push(`Edge ${edgeLabel} references invalid target: ${String(edge.target)}`);
  }

  return errors;
}

function normalizeEdge(edge: LooseObject, index: number): ReactFlowEdge {
  const source = typeof edge.source === 'string' ? edge.source : '';
  const target = typeof edge.target === 'string' ? edge.target : '';
  const id =
    typeof edge.id === 'string' && edge.id.length > 0
      ? edge.id
      : `imported-edge-${index + 1}`;
  const sourceHandle =
    typeof edge.sourceHandle === 'string' || edge.sourceHandle === null
      ? edge.sourceHandle
      : undefined;
  const targetHandle =
    typeof edge.targetHandle === 'string' || edge.targetHandle === null
      ? edge.targetHandle
      : undefined;

  return {
    ...edge,
    id,
    source,
    target,
    ...(sourceHandle !== undefined ? { sourceHandle } : {}),
    ...(targetHandle !== undefined ? { targetHandle } : {}),
  };
}

function normalizeViewport(viewport: LooseObject): ReactFlowViewport | null {
  if (
    !isFiniteNumber(viewport.x) ||
    !isFiniteNumber(viewport.y) ||
    !isFiniteNumber(viewport.zoom)
  ) {
    return null;
  }

  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

export function validateImportFile(content: unknown): ImportValidationResult {
  const result = ImportWorkflowSchema.safeParse(content);

  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }

  const { workflow } = result.data;
  const inputSchemaResult =
    workflow.input_schema === null
      ? { success: true as const, data: null }
      : workflowInputSchemaSchema.safeParse(workflow.input_schema);

  if (!inputSchemaResult.success) {
    return {
      valid: false,
      errors: inputSchemaResult.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
        return `workflow.input_schema${path}: ${issue.message}`;
      }),
    };
  }

  const validationErrors: string[] = [];
  const nodes: ReactFlowNode[] = [];
  const nodeIds = new Set<string>();

  for (const node of workflow.definition.nodes) {
    const errors = validateNode(node);
    validationErrors.push(...errors);

    if (errors.length > 0) {
      continue;
    }

    const normalizedNode = normalizeNode(node);

    if (nodeIds.has(normalizedNode.id)) {
      validationErrors.push(`Duplicate node id: ${normalizedNode.id}`);
      continue;
    }

    nodeIds.add(normalizedNode.id);
    nodes.push(normalizedNode);
  }

  const edges: ReactFlowEdge[] = [];

  for (const [index, edge] of workflow.definition.edges.entries()) {
    const errors = validateEdge(edge);
    validationErrors.push(...errors);

    if (errors.length > 0) {
      continue;
    }

    edges.push(normalizeEdge(edge, index));
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      validationErrors.push(
        `Edge ${edge.id || 'unknown'} references invalid source: ${edge.source}`,
      );
    }

    if (!nodeIds.has(edge.target)) {
      validationErrors.push(
        `Edge ${edge.id || 'unknown'} references invalid target: ${edge.target}`,
      );
    }
  }

  const viewport = normalizeViewport(workflow.definition.viewport);

  if (viewport === null) {
    validationErrors.push('Workflow missing valid viewport');
  }

  if (validationErrors.length > 0 || viewport === null) {
    return {
      valid: false,
      errors: validationErrors,
    };
  }

  return {
    valid: true,
    errors: [],
    workflow: {
      name: workflow.name,
      description: workflow.description,
      definition: {
        nodes,
        edges,
        viewport,
      },
      inputSchema: inputSchemaResult.data,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
