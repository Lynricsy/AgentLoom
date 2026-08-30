/** 自进化模块共享的无状态值解析与 JSON 复制工具。 */
import { DomainException } from '../../common/exceptions/domain.exception';
import type { SkillUploadFile } from '../skill/skill.service';
import type {
  GraphEdgeOperation,
  GraphNodeOperation,
  SelfEvolutionCategory,
  SelfEvolutionGraphProposal,
  SelfEvolutionTargetKind,
  SelfEvolutionToolResult,
} from './self-evolution.types';
import {
  SELF_EVOLUTION_CATEGORY_VALUES,
  SELF_EVOLUTION_DOMAIN,
} from './self-evolution.types';

export type EvolutionRecord = Record<string, unknown>;

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0,
      )
    : [];
}
export function readRecord(value: unknown): EvolutionRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as EvolutionRecord)
    : null;
}
export function readNodeType(
  value: EvolutionRecord | undefined,
): string | undefined {
  if (!value) return undefined;
  return readString(readRecord(value.data)?.nodeType) ?? readString(value.type);
}
export function findNodeById(
  nodes: EvolutionRecord[],
  nodeId: string | undefined,
): EvolutionRecord | undefined {
  return nodeId
    ? nodes.find((node) => readString(node.id) === nodeId)
    : undefined;
}
export function findEdgeById(
  edges: EvolutionRecord[],
  edgeId: string | undefined,
): EvolutionRecord | undefined {
  return edgeId
    ? edges.find((edge) => readString(edge.id) === edgeId)
    : undefined;
}
export function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = readString(value);
  if (!normalized) throw new Error(`${fieldName} 是必填字符串`);
  return normalized;
}
export function readRequiredRecord(
  value: unknown,
  fieldName: string,
): EvolutionRecord {
  const normalized = readRecord(value);
  if (!normalized) throw new Error(`${fieldName} 必须是对象`);
  return normalized;
}
export function readRequiredStringArray(
  value: unknown,
  fieldName: string,
): string[] {
  const normalized = readStringArray(value);
  if (normalized.length === 0)
    throw new Error(`${fieldName} 至少需要包含一个字符串`);
  return normalized;
}
export function readPositiveInt(
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized < 1 ? fallback : Math.min(normalized, max);
}
export function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
export function cloneJsonRecord(value: unknown): EvolutionRecord {
  return readRecord(value)
    ? (JSON.parse(JSON.stringify(value)) as EvolutionRecord)
    : {};
}
export function cloneJsonArray(value: unknown): EvolutionRecord[] {
  return Array.isArray(value) ? value.map(cloneJsonRecord) : [];
}
export function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function readTargetKind(value: unknown): SelfEvolutionTargetKind {
  if (value === 'self' || value === 'agent' || value === 'workflow')
    return value;
  throw new Error('targetKind 必须是 self / agent / workflow');
}
function readGraphOperation(
  value: unknown,
  fieldName: string,
): 'add' | 'update' | 'remove' {
  if (value === 'add' || value === 'update' || value === 'remove') return value;
  throw new Error(`${fieldName} 必须是 add / update / remove`);
}
export function readNodeOperations(value: unknown): GraphNodeOperation[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = readRequiredRecord(entry, 'nodeOperations[*]');
    return {
      op: readGraphOperation(record.op, 'nodeOperations[*].op'),
      ...(readString(record.nodeId)
        ? { nodeId: readString(record.nodeId) }
        : {}),
      ...(readRecord(record.node) ? { node: readRecord(record.node)! } : {}),
      ...(readRecord(record.patch) ? { patch: readRecord(record.patch)! } : {}),
    };
  });
}
export function readEdgeOperations(value: unknown): GraphEdgeOperation[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = readRequiredRecord(entry, 'edgeOperations[*]');
    return {
      op: readGraphOperation(record.op, 'edgeOperations[*].op'),
      ...(readString(record.edgeId)
        ? { edgeId: readString(record.edgeId) }
        : {}),
      ...(readRecord(record.edge) ? { edge: readRecord(record.edge)! } : {}),
      ...(readRecord(record.patch) ? { patch: readRecord(record.patch)! } : {}),
    };
  });
}
export function readProposal(
  value: unknown,
): SelfEvolutionGraphProposal | null {
  const record = readRecord(value);
  if (!record || record.domain !== SELF_EVOLUTION_DOMAIN) return null;
  const category = readString(record.category);
  if (
    !category ||
    !(SELF_EVOLUTION_CATEGORY_VALUES as readonly string[]).includes(category)
  )
    return null;
  const targetKind = readString(record.targetKind);
  if (
    targetKind !== 'self' &&
    targetKind !== 'agent' &&
    targetKind !== 'workflow'
  )
    return null;
  return {
    domain: SELF_EVOLUTION_DOMAIN,
    targetKind,
    targetId: readRequiredString(record.targetId, 'proposal.targetId'),
    targetLabel: readRequiredString(record.targetLabel, 'proposal.targetLabel'),
    baseVersion: readPositiveInt(
      record.baseVersion,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    publishTarget: Boolean(record.publishTarget),
    nodeOperations: readNodeOperations(record.nodeOperations),
    edgeOperations: readEdgeOperations(record.edgeOperations),
    ...(readRecord(record.viewport)
      ? { viewport: readRecord(record.viewport)! }
      : {}),
    ...(readRecord(record.metadataPatch)
      ? { metadataPatch: readRecord(record.metadataPatch)! }
      : {}),
    summary: readRequiredString(record.summary, 'proposal.summary'),
    category: category as SelfEvolutionCategory,
    riskLevel:
      record.riskLevel === 'low' || record.riskLevel === 'high'
        ? record.riskLevel
        : 'medium',
    requiresConfirmation: Boolean(record.requiresConfirmation),
    diffPreview: readRecord(record.diffPreview) ?? {
      summary: 'No diff preview',
    },
  };
}
export function buildSkillFiles(
  filesValue: unknown,
  contentValue: unknown,
): SkillUploadFile[] | undefined {
  const files = readRecord(filesValue);
  const entries = files
    ? Object.entries(files).filter(
        (entry): entry is [string, string] =>
          entry[0].length > 0 && typeof entry[1] === 'string',
      )
    : [];
  if (entries.length === 0 && typeof contentValue !== 'string')
    return undefined;
  const normalized =
    entries.length > 0
      ? entries
      : [['SKILL.md', String(contentValue ?? '')] as const];
  return normalized.map(([filename, content]) => ({
    fieldname: 'files',
    filename,
    buffer: Buffer.from(content, 'utf-8'),
    mimetype: 'text/markdown',
  }));
}
export function hasNewPublishedVersion(
  previous: string | null | undefined,
  next: string | null | undefined,
): next is string {
  return typeof next === 'string' && next.length > 0 && next !== previous;
}
export function toFailureResult(error: unknown): SelfEvolutionToolResult {
  if (error instanceof DomainException) {
    return {
      success: false,
      data: {
        problemDetails: {
          type: error.type,
          title: error.message,
          status: error.getStatus(),
          detail: error.detail,
          ...(error.errors ? { errors: error.errors } : {}),
          ...(error.extensions ? { extensions: error.extensions } : {}),
        },
      },
      error: error.detail,
    };
  }
  return {
    success: false,
    data: null,
    error: error instanceof Error ? error.message : String(error),
  };
}
