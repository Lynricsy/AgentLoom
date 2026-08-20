import {
  BLOCK_CATEGORIES,
  type BlockCategory,
  type BlockDefinition,
  type BlockDefinitionEdge,
  type BlockDefinitionNode,
  type BlockMetadata,
  type BlockPort,
  type ReusableBlockDetail,
} from '../types';

export const EXPORT_SCHEMA_VERSION = 'agentloom-block-v1';
export const MAX_IMPORT_SIZE = 5 * 1024 * 1024;
export const EXPORT_FILE_EXTENSION = '.agentloom-block.json';

export interface ExportedBlock {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  block: {
    name: string;
    description: string | null;
    category: BlockCategory | null;
    tags: string[];
    definition: BlockDefinition;
    metadata: BlockMetadata | null;
  };
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  block?: ExportedBlock;
}

const VALID_PORT_DATA_TYPES = new Set<BlockPort['dataType']>([
  'model',
  'text',
  'json',
  'image',
  'audio',
  'tool',
  'sandbox',
  'knowledge',
]);

const VALID_BLOCK_CATEGORIES = new Set<BlockCategory>(BLOCK_CATEGORIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlockCategory(value: unknown): value is BlockCategory {
  return VALID_BLOCK_CATEGORIES.has(value as BlockCategory);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeFileNameSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-');

  return sanitized || 'block';
}

function normalizeExportFileName(filename: string): string {
  return filename.endsWith(EXPORT_FILE_EXTENSION)
    ? filename
    : `${filename}${EXPORT_FILE_EXTENSION}`;
}

function validateViewport(
  viewport: unknown,
  errors: string[],
): BlockDefinition['viewport'] | undefined {
  if (viewport === undefined) {
    return undefined;
  }

  if (!isRecord(viewport)) {
    errors.push('block.definition.viewport 必须是对象。');
    return undefined;
  }

  const x = viewport.x;
  const y = viewport.y;
  const zoom = viewport.zoom;

  if (
    typeof x !== 'number' ||
    Number.isNaN(x) ||
    typeof y !== 'number' ||
    Number.isNaN(y) ||
    typeof zoom !== 'number' ||
    Number.isNaN(zoom)
  ) {
    errors.push('block.definition.viewport.x/y/zoom 必须都是数字。');
    return undefined;
  }

  return { x, y, zoom };
}

function validatePorts(
  key: 'inputPorts' | 'outputPorts',
  rawPorts: unknown,
  errors: string[],
): BlockPort[] {
  if (!Array.isArray(rawPorts)) {
    errors.push(`block.definition.${key} 必须是数组。`);
    return [];
  }

  const ports: BlockPort[] = [];

  rawPorts.forEach((port, index) => {
    if (!isRecord(port)) {
      errors.push(`block.definition.${key}[${index}] 必须是对象。`);
      return;
    }

    if (!isNonEmptyString(port.id)) {
      errors.push(`block.definition.${key}[${index}].id 不能为空。`);
    }

    if (!isNonEmptyString(port.label)) {
      errors.push(`block.definition.${key}[${index}].label 不能为空。`);
    }

    if (!VALID_PORT_DATA_TYPES.has(port.dataType as BlockPort['dataType'])) {
      errors.push(`block.definition.${key}[${index}].dataType 无效。`);
    }

    if (
      port.sourceNodeId !== undefined &&
      !isNonEmptyString(port.sourceNodeId)
    ) {
      errors.push(
        `block.definition.${key}[${index}].sourceNodeId 必须是非空字符串。`,
      );
    }

    if (
      port.sourcePortId !== undefined &&
      !isNonEmptyString(port.sourcePortId)
    ) {
      errors.push(
        `block.definition.${key}[${index}].sourcePortId 必须是非空字符串。`,
      );
    }

    if (
      isNonEmptyString(port.id) &&
      isNonEmptyString(port.label) &&
      VALID_PORT_DATA_TYPES.has(port.dataType as BlockPort['dataType'])
    ) {
      ports.push({
        id: port.id,
        label: port.label,
        dataType: port.dataType as BlockPort['dataType'],
        ...(isNonEmptyString(port.sourceNodeId)
          ? { sourceNodeId: port.sourceNodeId }
          : {}),
        ...(isNonEmptyString(port.sourcePortId)
          ? { sourcePortId: port.sourcePortId }
          : {}),
      });
    }
  });

  return ports;
}

function validateMetadata(
  rawMetadata: unknown,
  nodeCount: number,
  errors: string[],
): BlockMetadata | null {
  if (rawMetadata === undefined || rawMetadata === null) {
    return null;
  }

  if (!isRecord(rawMetadata)) {
    errors.push('block.metadata 必须是对象或 null。');
    return null;
  }

  if (
    typeof rawMetadata.nodeCount !== 'number' ||
    Number.isNaN(rawMetadata.nodeCount)
  ) {
    errors.push('block.metadata.nodeCount 必须是数字。');
  }

  if (
    typeof rawMetadata.version !== 'number' ||
    Number.isNaN(rawMetadata.version)
  ) {
    errors.push('block.metadata.version 必须是数字。');
  }

  if (
    typeof rawMetadata.nodeCount === 'number' &&
    !Number.isNaN(rawMetadata.nodeCount) &&
    rawMetadata.nodeCount !== nodeCount
  ) {
    errors.push('block.metadata.nodeCount 与 definition.nodes 数量不一致。');
  }

  if (
    rawMetadata.author !== undefined &&
    typeof rawMetadata.author !== 'string'
  ) {
    errors.push('block.metadata.author 必须是字符串。');
  }

  if (
    rawMetadata.createdFromWorkflowId !== undefined &&
    typeof rawMetadata.createdFromWorkflowId !== 'string'
  ) {
    errors.push('block.metadata.createdFromWorkflowId 必须是字符串。');
  }

  if (
    rawMetadata.exportedAt !== undefined &&
    typeof rawMetadata.exportedAt !== 'string'
  ) {
    errors.push('block.metadata.exportedAt 必须是字符串。');
  }

  if (
    typeof rawMetadata.nodeCount === 'number' &&
    !Number.isNaN(rawMetadata.nodeCount) &&
    typeof rawMetadata.version === 'number' &&
    !Number.isNaN(rawMetadata.version)
  ) {
    return {
      nodeCount: rawMetadata.nodeCount,
      version: rawMetadata.version,
      ...(typeof rawMetadata.author === 'string'
        ? { author: rawMetadata.author }
        : {}),
      ...(typeof rawMetadata.createdFromWorkflowId === 'string'
        ? { createdFromWorkflowId: rawMetadata.createdFromWorkflowId }
        : {}),
      ...(typeof rawMetadata.exportedAt === 'string'
        ? { exportedAt: rawMetadata.exportedAt }
        : {}),
    };
  }

  return null;
}

export function exportBlock(block: ReusableBlockDetail): ExportedBlock {
  const exportedAt = new Date().toISOString();

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    block: {
      name: block.name,
      description: block.description,
      category: block.category,
      tags: [...block.tags],
      definition: {
        nodes: block.definition.nodes.map((node) => ({ ...node })),
        edges: block.definition.edges.map((edge) => ({ ...edge })),
        inputPorts: block.definition.inputPorts.map((port) => ({ ...port })),
        outputPorts: block.definition.outputPorts.map((port) => ({ ...port })),
        ...(block.definition.viewport
          ? { viewport: { ...block.definition.viewport } }
          : {}),
      },
      metadata: block.metadata
        ? {
            ...block.metadata,
            exportedAt,
          }
        : null,
    },
  };
}

export function downloadExportedBlock(
  exported: ExportedBlock,
  filename?: string,
): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const exportFileName = normalizeExportFileName(
    filename ?? sanitizeFileNameSegment(exported.block.name),
  );

  anchor.href = url;
  anchor.download = exportFileName;
  anchor.rel = 'noopener';

  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

export function validateImportFile(content: string): ImportValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return {
      valid: false,
      errors: ['导入文件不是有效的 JSON。'],
    };
  }

  if (!isRecord(parsed)) {
    return {
      valid: false,
      errors: ['导入文件必须是 JSON 对象。'],
    };
  }

  const errors: string[] = [];

  if (parsed.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须是 "${EXPORT_SCHEMA_VERSION}"。`);
  }

  if (!isNonEmptyString(parsed.exportedAt)) {
    errors.push('exportedAt 必须是非空字符串。');
  }

  if (!isRecord(parsed.block)) {
    errors.push('block 必须是对象。');
    return { valid: false, errors };
  }

  const rawBlock = parsed.block;

  if (!isNonEmptyString(rawBlock.name)) {
    errors.push('block.name 不能为空。');
  }

  if (
    rawBlock.description !== undefined &&
    rawBlock.description !== null &&
    typeof rawBlock.description !== 'string'
  ) {
    errors.push('block.description 必须是字符串或 null。');
  }

  if (
    rawBlock.category !== undefined &&
    rawBlock.category !== null &&
    !isBlockCategory(rawBlock.category)
  ) {
    errors.push('block.category 必须是有效分类或 null。');
  }

  if (
    rawBlock.tags !== undefined &&
    (!Array.isArray(rawBlock.tags) ||
      rawBlock.tags.some((tag) => typeof tag !== 'string'))
  ) {
    errors.push('block.tags 必须是字符串数组。');
  }

  if (!isRecord(rawBlock.definition)) {
    errors.push('block.definition 必须是对象。');
    return { valid: false, errors };
  }

  const rawDefinition = rawBlock.definition;
  const nodes: BlockDefinitionNode[] = [];
  const edges: BlockDefinitionEdge[] = [];
  const nodeIds = new Set<string>();

  if (!Array.isArray(rawDefinition.nodes) || rawDefinition.nodes.length === 0) {
    errors.push('block.definition.nodes 必须是非空数组。');
  } else {
    rawDefinition.nodes.forEach((node, index) => {
      if (!isRecord(node)) {
        errors.push(`block.definition.nodes[${index}] 必须是对象。`);
        return;
      }

      if (!isNonEmptyString(node.id)) {
        errors.push(`block.definition.nodes[${index}].id 不能为空。`);
        return;
      }

      if (nodeIds.has(node.id)) {
        errors.push(`block.definition.nodes[${index}].id 不能重复。`);
        return;
      }

      nodeIds.add(node.id);
      nodes.push({ ...node, id: node.id });
    });
  }

  if (!Array.isArray(rawDefinition.edges)) {
    errors.push('block.definition.edges 必须是数组。');
  } else {
    rawDefinition.edges.forEach((edge, index) => {
      if (!isRecord(edge)) {
        errors.push(`block.definition.edges[${index}] 必须是对象。`);
        return;
      }

      // id 是 server `CreateReusableBlockDto` 对每条边的硬要求，缺失必须报错
      if (!isNonEmptyString(edge.id)) {
        errors.push(`block.definition.edges[${index}].id 不能为空。`);
      }

      if (!isNonEmptyString(edge.source)) {
        errors.push(`block.definition.edges[${index}].source 不能为空。`);
      }

      if (!isNonEmptyString(edge.target)) {
        errors.push(`block.definition.edges[${index}].target 不能为空。`);
      }

      if (
        !isNonEmptyString(edge.id) ||
        !isNonEmptyString(edge.source) ||
        !isNonEmptyString(edge.target)
      ) {
        return;
      }

      if (!nodeIds.has(edge.source)) {
        errors.push(
          `block.definition.edges[${index}].source 未指向已存在节点。`,
        );
      }

      if (!nodeIds.has(edge.target)) {
        errors.push(
          `block.definition.edges[${index}].target 未指向已存在节点。`,
        );
      }

      edges.push({
        ...edge,
        id: edge.id,
        source: edge.source,
        target: edge.target,
      });
    });
  }

  const inputPorts = validatePorts(
    'inputPorts',
    rawDefinition.inputPorts,
    errors,
  );
  const outputPorts = validatePorts(
    'outputPorts',
    rawDefinition.outputPorts,
    errors,
  );
  const viewport = validateViewport(rawDefinition.viewport, errors);
  const metadata = validateMetadata(rawBlock.metadata, nodes.length, errors);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const rawExportedAt = parsed.exportedAt;
  const rawName = rawBlock.name;

  if (!isNonEmptyString(rawExportedAt) || !isNonEmptyString(rawName)) {
    return {
      valid: false,
      errors: ['导入文件基础字段校验失败。'],
    };
  }

  const exportedAt: string = rawExportedAt;
  const name: string = rawName;
  const description: string | null =
    typeof rawBlock.description === 'string' ? rawBlock.description : null;
  const category: BlockCategory | null =
    rawBlock.category === null || rawBlock.category === undefined
      ? null
      : isBlockCategory(rawBlock.category)
        ? rawBlock.category
        : null;
  const tags = Array.isArray(rawBlock.tags)
    ? rawBlock.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  const normalizedBlock: ExportedBlock = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    block: {
      name,
      description,
      category,
      tags,
      definition: {
        nodes,
        edges,
        inputPorts,
        outputPorts,
        ...(viewport ? { viewport } : {}),
      },
      metadata,
    },
  };

  return {
    valid: true,
    errors: [],
    block: normalizedBlock,
  };
}

export async function parseImportFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error(
      `导入文件大小不能超过 ${MAX_IMPORT_SIZE / 1024 / 1024} MB。`,
    );
  }

  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('读取导入文件失败。'));
    };

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('读取导入文件失败。'));
    };

    reader.readAsText(file);
  });
}
