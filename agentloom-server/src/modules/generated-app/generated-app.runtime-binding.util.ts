/**
 * 生成应用运行时绑定的纯函数（ADR-0007 §3）：Agent 包装工作流图、提交投影、结果分区抽取。
 * 无依赖注入，供运行时绑定服务、公开提交与 Gate 2/3 合约检查共用。
 */
import * as crypto from 'crypto';

import type * as schema from '../../database/schema';
import type {
  InputFieldDefinition,
  WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';
import { normalizeWorkflowNodesAndEdges } from '../workflow-definition/utils/normalize-workflow-graph.utils';
import { isRecord } from './generated-app.plan-validation.util';
import { sanitizePublicSubmissionValue } from './generated-app.public-sanitizer.util';
import type {
  GeneratedAppField,
  GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type {
  GeneratedAppRunRequest,
  GeneratedAppRuntimeResult,
  GeneratedAppRuntimeResultSection,
} from './types/generation-v2.ports';

export interface GeneratedAppPrivatePluginBuildReport {
  toolId: string;
  manifestValid: boolean;
  nodeDefinitionsValid: boolean;
  contentHash: string;
  signature: string;
  developerKeyFingerprint: string;
  generatedSigningPublicKeyPem: string;
  signingVerification: {
    requiredBeforePrivateActivation?: boolean;
    status?: string;
    contentHashMatches?: boolean;
    verified?: boolean;
  };
  declaredPermissions: string[];
  artifactPath: string;
  wasmEntry?: string;
  wasmRuntime?: string;
  wasmSizeBytes?: number;
  wasmSha256?: string;
  passed: boolean;
}

/** Agent 包装工作流的固定节点 id；结果抽取按 reply 节点取 Agent 回复 */
export const GENERATED_APP_AGENT_WRAPPER_NODE_IDS = {
  trigger: 'generated-app-input',
  agent: 'generated-app-agent',
  reply: 'generated-app-reply',
} as const;

/** 公开结果中单个文本分区的字符上限 */
export const GENERATED_APP_RESULT_TEXT_MAX_LENGTH = 20_000;
/** citations 分区最多保留的条目数与每个属性的字符上限 */
export const GENERATED_APP_RESULT_CITATIONS_MAX = 20;
export const GENERATED_APP_RESULT_CITATION_TEXT_MAX_LENGTH = 1000;
/** json 分区序列化后的字节上限 */
export const GENERATED_APP_RESULT_JSON_MAX_BYTES = 32 * 1024;

const PUBLIC_RESULT_REDACTION = '[已移除内部内容]';
/** 公开结果里逐段替换（不整段丢弃）：凭据、64 位十六进制、宿主机绝对路径 */
const PUBLIC_RESULT_UNSAFE_TEXT_PATTERN =
  /\bBearer\s+[A-Za-z0-9._~+/=-]+|\b(?:sk|pk)-[A-Za-z0-9_-]{12,}|\b[a-f0-9]{64}\b|(?<![\w.:/])\/(?:root|home|Users|tmp|var|etc|workspace|opt|mnt)\/[^\s"'<>)\]]*|\b[A-Za-z]:\\[^\s"'<>]*/g;

const EXECUTION_RUNNING_STATUSES = new Set(['pending', 'running', 'paused']);

type WorkflowInputFieldType = InputFieldDefinition['type'];

const WORKFLOW_INPUT_TYPE_BY_FIELD_TYPE: Record<
  GeneratedAppField['type'],
  WorkflowInputFieldType
> = {
  text: 'text',
  textarea: 'text',
  number: 'number',
  single_select: 'single_select',
  multi_select: 'multi_select',
};

/**
 * Agent 包装工作流的输入契约：一个表单字段对应一个输入字段，id 相同，
 * 因此表单值无需改键即可作为 inputParams。version 由调用方按已存契约维护。
 */
export function buildAgentWrapperInputSchema(
  appSpec: GeneratedAppSpecV2,
): WorkflowInputSchema {
  return {
    version: 1,
    collectionMode: 'form',
    fields: appSpec.inputForm.fields.map((field) => ({
      id: field.id,
      type: WORKFLOW_INPUT_TYPE_BY_FIELD_TYPE[field.type],
      label: field.label,
      ...(field.helpText ? { description: field.helpText } : {}),
      required: field.required,
      ...(field.type === 'text' || field.type === 'textarea'
        ? { validation: { maxLength: field.maxLength } }
        : {}),
      ...(field.type === 'number' &&
      (field.min !== undefined || field.max !== undefined)
        ? {
            validation: {
              ...(field.min !== undefined ? { min: field.min } : {}),
              ...(field.max !== undefined ? { max: field.max } : {}),
            },
          }
        : {}),
      ...(field.type === 'single_select' || field.type === 'multi_select'
        ? { options: field.options.map((option) => option.value) }
        : {}),
    })),
  };
}

/**
 * 包装图对应的 AppSpec 指纹：记在 Agent 节点上并随版本快照固化，运行时据此找到与当前
 * AppSpec 一致的已发布版本；绑定的 Agent 版本或表单字段变化都会得到新指纹。
 */
export function computeAgentWrapperFingerprint(
  appSpec: GeneratedAppSpecV2,
): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        binding: appSpec.binding,
        fields: appSpec.inputForm.fields,
      }),
    )
    .digest('hex');
}

/** Agent 包装工作流的画布与输入契约（节点端口已按模板补齐） */
export interface GeneratedAppAgentWrapperGraph {
  nodes: schema.ReactFlowNode[];
  edges: schema.ReactFlowEdge[];
  inputSchema: WorkflowInputSchema;
}

/**
 * Agent 绑定的包装工作流：manual-trigger → agent（固定已发布版本，无沙箱）→ text-output。
 * 触发数据（表单值对象）接到 Agent 的「文本」端口，执行期按 json → text 规则序列化为 JSON
 * 作为用户消息。返回的图已按节点模板补齐端口，可直接做发布前的图结构校验。
 */
export function buildAgentWrapperWorkflowGraph(
  appSpec: GeneratedAppSpecV2,
  params: { appId: string },
): GeneratedAppAgentWrapperGraph {
  const binding = appSpec.binding;
  if (binding.kind !== 'agent') {
    throw new Error('只有 Agent 绑定的 AppSpec 需要包装工作流');
  }

  const ids = GENERATED_APP_AGENT_WRAPPER_NODE_IDS;
  const nodes: schema.ReactFlowNode[] = [
    {
      id: ids.trigger,
      type: 'trigger',
      position: { x: 0, y: 80 },
      data: {
        label: '表单输入',
        nodeType: 'manual-trigger',
        category: 'trigger',
        config: {},
      },
    },
    {
      id: ids.agent,
      type: 'agent',
      position: { x: 320, y: 80 },
      data: {
        label: appSpec.appName,
        nodeType: 'agent',
        category: 'agent',
        agentDefinitionId: binding.agentDefinitionId,
        agentVersionId: binding.agentVersionId,
        agentRuntimeMode: 'no_sandbox',
        generatedAppId: params.appId,
        generatedAppSpecFingerprint: computeAgentWrapperFingerprint(appSpec),
        config: {},
      },
    },
    {
      id: ids.reply,
      type: 'output',
      position: { x: 640, y: 80 },
      data: {
        label: '回复',
        nodeType: 'text-output',
        category: 'output',
        config: {},
      },
    },
  ];
  const edges: schema.ReactFlowEdge[] = [
    {
      id: `${ids.trigger}-exec-to-${ids.agent}`,
      source: ids.trigger,
      target: ids.agent,
      sourceHandle: 'exec-out',
      targetHandle: 'exec-in',
    },
    {
      id: `${ids.trigger}-payload-to-${ids.agent}-text`,
      source: ids.trigger,
      target: ids.agent,
      sourceHandle: 'payload-out',
      targetHandle: 'text-in',
    },
    {
      id: `${ids.agent}-exec-to-${ids.reply}`,
      source: ids.agent,
      target: ids.reply,
      sourceHandle: 'exec-out',
      targetHandle: 'exec-in',
    },
    {
      id: `${ids.agent}-reply-to-${ids.reply}-content`,
      source: ids.agent,
      target: ids.reply,
      sourceHandle: 'agent-out',
      targetHandle: 'content-in',
    },
  ];

  return {
    ...normalizeWorkflowNodesAndEdges(nodes, edges),
    inputSchema: buildAgentWrapperInputSchema(appSpec),
  };
}

/** 版本快照中的包装图是否与当前 AppSpec 一致（按 Agent 节点上的指纹判断） */
export function isAgentWrapperSnapshotCurrent(
  appSpec: GeneratedAppSpecV2,
  snapshotNodes: schema.ReactFlowNode[] | null | undefined,
): boolean {
  const agentNode = (snapshotNodes ?? []).find(
    (node) => node.id === GENERATED_APP_AGENT_WRAPPER_NODE_IDS.agent,
  );

  return (
    agentNode?.data?.generatedAppSpecFingerprint ===
    computeAgentWrapperFingerprint(appSpec)
  );
}

/**
 * 校验通过的表单值 → 运行请求。工作流绑定按 inputMapping 改键（只传映射到的字段）；
 * Agent 绑定的包装工作流输入字段与表单字段同 id，原样传入。
 */
export function mapGeneratedAppSubmission(
  appSpec: GeneratedAppSpecV2,
  runtime: {
    workflowDefinitionId: string;
    workflowVersionId: string;
    inputSchemaVersion: number | undefined;
  },
  values: Record<string, string | number | string[]>,
): GeneratedAppRunRequest {
  const binding = appSpec.binding;
  const inputParams: Record<string, unknown> =
    binding.kind === 'workflow'
      ? Object.fromEntries(
          binding.inputMapping
            .filter((mapping) => Object.hasOwn(values, mapping.fieldId))
            .map((mapping) => [
              mapping.workflowInputFieldId,
              values[mapping.fieldId],
            ]),
        )
      : { ...values };

  return {
    workflowDefinitionId: runtime.workflowDefinitionId,
    workflowVersionId: runtime.workflowVersionId,
    inputParams,
    schemaVersion: runtime.inputSchemaVersion,
  };
}

/**
 * 执行结束后按 outputMapping 取步骤结果，转换为结果分区并公开脱敏。
 * 任一分区没有取到输出时整体判失败（页面承诺的结果没有产出），已取到的分区照常返回。
 * 失败原因只给公开可见的通用说明，不含节点、错误栈等内部细节。
 */
export function extractGeneratedAppRuntimeResult(
  appSpec: GeneratedAppSpecV2,
  execution: {
    status: string;
    steps: Array<{
      nodeId: string;
      status: string;
      result: Record<string, unknown> | null;
    }>;
  },
): GeneratedAppRuntimeResult {
  if (EXECUTION_RUNNING_STATUSES.has(execution.status)) {
    return { status: 'running', sections: [], publicError: null };
  }

  if (execution.status !== 'completed') {
    return {
      status: 'failed',
      sections: [],
      publicError:
        execution.status === 'cancelled'
          ? '本次处理已取消，请重新提交。'
          : '本次处理未能完成，请稍后重试。',
    };
  }

  const binding = appSpec.binding;
  const sourceBySectionId = new Map<string, { nodeId: string; path?: string }>(
    binding.kind === 'workflow'
      ? binding.outputMapping.map((mapping) => [
          mapping.sectionId,
          { nodeId: mapping.nodeId, path: mapping.path },
        ])
      : [
          [
            binding.replySectionId,
            { nodeId: GENERATED_APP_AGENT_WRAPPER_NODE_IDS.reply },
          ],
        ],
  );
  // 同一节点在循环中可能执行多次，取最后一次完成的结果
  const completedResultByNodeId = new Map<string, Record<string, unknown>>();
  for (const step of execution.steps) {
    if (step.status === 'completed' && step.result) {
      completedResultByNodeId.set(step.nodeId, step.result);
    }
  }

  const sections: GeneratedAppRuntimeResultSection[] = [];
  const missingLabels: string[] = [];
  for (const section of appSpec.resultView.sections) {
    const source = sourceBySectionId.get(section.id);
    const stepResult = source
      ? completedResultByNodeId.get(source.nodeId)
      : undefined;
    const value = stepResult
      ? formatResultSectionValue(
          section.format,
          readStepOutput(stepResult, source?.path),
        )
      : null;

    if (value === null) {
      missingLabels.push(section.label);
      continue;
    }
    sections.push({
      sectionId: section.id,
      label: section.label,
      format: section.format,
      value,
    });
  }

  return missingLabels.length > 0
    ? {
        status: 'failed',
        sections,
        publicError: `应用没有生成以下结果：${missingLabels.join('、')}。`,
      }
    : { status: 'completed', sections, publicError: null };
}

/**
 * text-output 步骤结果为 `{ content: string }`，json-output 为 `{ json: object }`
 * （非对象输出被包成 `{ value }`）。path 取对象中的一个键；文本输出带 path 时按 JSON 解析。
 */
function readStepOutput(
  result: Record<string, unknown>,
  path: string | undefined,
): unknown {
  let output: unknown;
  if (isRecord(result.json)) {
    output = result.json;
  } else if (typeof result.content === 'string') {
    output = path ? parseJsonOrSelf(result.content) : result.content;
  } else {
    return undefined;
  }

  if (path) {
    return isRecord(output) ? output[path] : undefined;
  }

  // 未取键时还原 json-output 对非对象值的包装
  if (
    isRecord(output) &&
    Object.keys(output).length === 1 &&
    Object.hasOwn(output, 'value')
  ) {
    return output.value;
  }

  return output;
}

function formatResultSectionValue(
  format: GeneratedAppRuntimeResultSection['format'],
  raw: unknown,
): unknown {
  if (raw === undefined || raw === null) {
    return null;
  }

  switch (format) {
    case 'text':
    case 'markdown': {
      const text =
        typeof raw === 'string'
          ? raw
          : typeof raw === 'number' || typeof raw === 'boolean'
            ? String(raw)
            : JSON.stringify(sanitizePublicSubmissionValue(raw), null, 2);
      const redacted = redactPublicResultText(text).trim();

      return redacted.length === 0
        ? null
        : redacted.slice(0, GENERATED_APP_RESULT_TEXT_MAX_LENGTH);
    }
    case 'citations':
      return normalizeCitations(raw);
    case 'json': {
      const sanitized = sanitizePublicSubmissionValue(raw);

      return Buffer.byteLength(JSON.stringify(sanitized), 'utf8') >
        GENERATED_APP_RESULT_JSON_MAX_BYTES
        ? null
        : sanitized;
    }
  }
}

/** 引用统一为 `{ title?, quote?, source? }` 数组；常见的 doc/content/url 等键名一并识别 */
function normalizeCitations(raw: unknown): Array<Record<string, string>> | null {
  const parsed = typeof raw === 'string' ? parseJsonOrSelf(raw) : raw;
  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.citations)
      ? parsed.citations
      : null;

  if (!items) {
    return null;
  }

  return items.slice(0, GENERATED_APP_RESULT_CITATIONS_MAX).flatMap((item) => {
    if (typeof item === 'string') {
      const quote = limitCitationText(item);
      return quote ? [{ quote }] : [];
    }
    if (!isRecord(item)) {
      return [];
    }

    const citation: Record<string, string> = {};
    const title = pickCitationText(item, [
      'title',
      'doc',
      'document',
      'documentName',
      'fileName',
      'name',
    ]);
    const quote = pickCitationText(item, [
      'quote',
      'content',
      'text',
      'snippet',
      'excerpt',
    ]);
    const source = pickCitationText(item, ['source', 'url', 'link', 'page']);
    if (title) citation.title = title;
    if (quote) citation.quote = quote;
    if (source) citation.source = source;

    return Object.keys(citation).length > 0 ? [citation] : [];
  });
}

function pickCitationText(
  item: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = limitCitationText(String(value));
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function limitCitationText(value: string): string | null {
  const text = redactPublicResultText(value).trim();

  return text.length === 0
    ? null
    : text.slice(0, GENERATED_APP_RESULT_CITATION_TEXT_MAX_LENGTH);
}

function redactPublicResultText(value: string): string {
  return value.replace(
    PUBLIC_RESULT_UNSAFE_TEXT_PATTERN,
    PUBLIC_RESULT_REDACTION,
  );
}

function parseJsonOrSelf(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
