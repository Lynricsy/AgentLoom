import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import {
  workflowInputSchemaSchema,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';
import { APP_SPEC_CANDIDATES_MAX } from './generated-app.app-spec-prompt';
import type {
  AppSpecReferenceIssue,
  GeneratedAppBinding,
  GeneratedAppField,
  GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type {
  AgentBindingCandidate,
  GeneratedAppBindingCandidate,
  GeneratedAppBindingResolver,
  GeneratedAppBindingTargetRef,
  ResolvedGeneratedAppBinding,
  WorkflowBindingCandidate,
} from './types/generation-v2.ports';

type WorkflowBinding = Extract<GeneratedAppBinding, { kind: 'workflow' }>;
type AgentBinding = Extract<GeneratedAppBinding, { kind: 'agent' }>;
type WorkflowInputField = WorkflowInputSchema['fields'][number];

const OUTPUT_NODE_TYPES: Record<string, true> = {
  'text-output': true,
  'json-output': true,
};

/** 表单字段类型 → 可承接它的工作流输入类型 */
const COMPATIBLE_WORKFLOW_INPUT_TYPE: Record<
  GeneratedAppField['type'],
  WorkflowInputField['type']
> = {
  text: 'text',
  textarea: 'text',
  number: 'number',
  single_select: 'single_select',
  multi_select: 'multi_select',
};

/**
 * 生成应用绑定的候选与解析（ADR-0007 §3）。Gate 0 生成时用它固定版本并校验映射，Gate 4 用它复核。
 * 每次读库都在自己的短租户事务里完成（已在事务内时复用），不跨模型调用持有事务。
 */
@Injectable()
export class GeneratedAppBindingResolverService
  implements GeneratedAppBindingResolver
{
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listCandidates(
    tenantId: string,
    target: GeneratedAppBindingTargetRef | null,
  ): Promise<GeneratedAppBindingCandidate[]> {
    return runInTenantTransaction(this.db, tenantId, async () => {
      const [workflows, agents] = await Promise.all([
        target?.kind === 'agent'
          ? []
          : this.listPublishedWorkflowCandidates(
              tenantId,
              target?.workflowDefinitionId ?? null,
            ),
        target?.kind === 'workflow'
          ? []
          : this.listPublishedAgentCandidates(
              tenantId,
              target?.agentDefinitionId ?? null,
            ),
      ]);

      return [...workflows, ...agents]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, APP_SPEC_CANDIDATES_MAX)
        .map((entry) => entry.candidate);
    });
  }

  async resolve(
    tenantId: string,
    appSpec: Pick<GeneratedAppSpecV2, 'binding' | 'inputForm'>,
  ): Promise<
    | { ok: true; resolved: ResolvedGeneratedAppBinding }
    | { ok: false; issues: AppSpecReferenceIssue[] }
  > {
    return runInTenantTransaction(this.db, tenantId, () =>
      appSpec.binding.kind === 'workflow'
        ? this.resolveWorkflowBinding(
            tenantId,
            appSpec.binding,
            appSpec.inputForm.fields,
          )
        : this.resolveAgentBinding(tenantId, appSpec.binding),
    );
  }

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  private async listPublishedWorkflowCandidates(
    tenantId: string,
    workflowDefinitionId: string | null,
  ): Promise<Array<{ updatedAt: Date; candidate: WorkflowBindingCandidate }>> {
    const definitions = await this.tenantDb
      .select({
        id: schema.workflowDefinitions.id,
        name: schema.workflowDefinitions.name,
        description: schema.workflowDefinitions.description,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        updatedAt: schema.workflowDefinitions.updatedAt,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.tenantId, tenantId),
          eq(schema.workflowDefinitions.status, 'published'),
          isNotNull(schema.workflowDefinitions.publishedVersionId),
          // 生成应用自己创建的运行时/包装工作流不能再被选作绑定目标
          sql`${schema.workflowDefinitions.metadata}->>'generatedAppId' IS NULL`,
          ...(workflowDefinitionId
            ? [eq(schema.workflowDefinitions.id, workflowDefinitionId)]
            : []),
        ),
      )
      .orderBy(desc(schema.workflowDefinitions.updatedAt))
      .limit(APP_SPEC_CANDIDATES_MAX);

    const versionIds = definitions
      .map((definition) => definition.publishedVersionId)
      .filter((id): id is string => id !== null);
    if (versionIds.length === 0) {
      return [];
    }

    const versions = await this.tenantDb
      .select({
        id: schema.workflowVersions.id,
        workflowDefinitionId: schema.workflowVersions.workflowDefinitionId,
        snapshot: schema.workflowVersions.snapshot,
      })
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.tenantId, tenantId),
          inArray(schema.workflowVersions.id, versionIds),
        ),
      );
    const versionById = new Map(versions.map((version) => [version.id, version]));

    return definitions.flatMap((definition) => {
      const version = definition.publishedVersionId
        ? versionById.get(definition.publishedVersionId)
        : undefined;
      if (!version || version.workflowDefinitionId !== definition.id) {
        return [];
      }
      return [
        {
          updatedAt: definition.updatedAt,
          candidate: buildWorkflowCandidate(definition, version),
        },
      ];
    });
  }

  private async listPublishedAgentCandidates(
    tenantId: string,
    agentDefinitionId: string | null,
  ): Promise<Array<{ updatedAt: Date; candidate: AgentBindingCandidate }>> {
    const definitions = await this.tenantDb
      .select({
        id: schema.agentDefinitions.id,
        name: schema.agentDefinitions.name,
        description: schema.agentDefinitions.description,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
        updatedAt: schema.agentDefinitions.updatedAt,
      })
      .from(schema.agentDefinitions)
      .where(
        and(
          eq(schema.agentDefinitions.tenantId, tenantId),
          eq(schema.agentDefinitions.status, 'published'),
          isNotNull(schema.agentDefinitions.publishedVersionId),
          ...(agentDefinitionId
            ? [eq(schema.agentDefinitions.id, agentDefinitionId)]
            : []),
        ),
      )
      .orderBy(desc(schema.agentDefinitions.updatedAt))
      .limit(APP_SPEC_CANDIDATES_MAX);

    return definitions.flatMap((definition) =>
      definition.publishedVersionId
        ? [
            {
              updatedAt: definition.updatedAt,
              candidate: {
                kind: 'agent' as const,
                agentDefinitionId: definition.id,
                agentVersionId: definition.publishedVersionId,
                name: definition.name,
                description: definition.description,
              },
            },
          ]
        : [],
    );
  }

  private async resolveWorkflowBinding(
    tenantId: string,
    binding: WorkflowBinding,
    fields: readonly GeneratedAppField[],
  ): Promise<
    | { ok: true; resolved: ResolvedGeneratedAppBinding }
    | { ok: false; issues: AppSpecReferenceIssue[] }
  > {
    const [definition] = await this.tenantDb
      .select({
        id: schema.workflowDefinitions.id,
        name: schema.workflowDefinitions.name,
        description: schema.workflowDefinitions.description,
        status: schema.workflowDefinitions.status,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.tenantId, tenantId),
          eq(schema.workflowDefinitions.id, binding.workflowDefinitionId),
        ),
      )
      .limit(1);

    if (!definition) {
      return failure(
        ['binding', 'workflowDefinitionId'],
        `绑定的工作流 ${binding.workflowDefinitionId} 不存在或不属于当前租户`,
      );
    }
    if (definition.status !== 'published' || !definition.publishedVersionId) {
      return failure(
        ['binding', 'workflowDefinitionId'],
        `绑定的工作流「${definition.name}」当前不是已发布状态（${definition.status}）`,
      );
    }

    const [version] = await this.tenantDb
      .select({
        id: schema.workflowVersions.id,
        workflowDefinitionId: schema.workflowVersions.workflowDefinitionId,
        snapshot: schema.workflowVersions.snapshot,
        archivedAt: schema.workflowVersions.archivedAt,
      })
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.tenantId, tenantId),
          eq(schema.workflowVersions.id, binding.workflowVersionId),
          eq(schema.workflowVersions.workflowDefinitionId, definition.id),
        ),
      )
      .limit(1);

    if (!version || version.archivedAt) {
      return failure(
        ['binding', 'workflowVersionId'],
        `绑定的工作流「${definition.name}」固定版本 ${binding.workflowVersionId} 不存在或已归档`,
      );
    }

    const candidate = buildWorkflowCandidate(definition, version);
    const issues = collectWorkflowBindingIssues(binding, fields, candidate);
    if (issues.length > 0) {
      return { ok: false, issues };
    }

    return {
      ok: true,
      resolved: { kind: 'workflow', binding, candidate },
    };
  }

  private async resolveAgentBinding(
    tenantId: string,
    binding: AgentBinding,
  ): Promise<
    | { ok: true; resolved: ResolvedGeneratedAppBinding }
    | { ok: false; issues: AppSpecReferenceIssue[] }
  > {
    const [definition] = await this.tenantDb
      .select({
        id: schema.agentDefinitions.id,
        name: schema.agentDefinitions.name,
        description: schema.agentDefinitions.description,
        status: schema.agentDefinitions.status,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
      })
      .from(schema.agentDefinitions)
      .where(
        and(
          eq(schema.agentDefinitions.tenantId, tenantId),
          eq(schema.agentDefinitions.id, binding.agentDefinitionId),
        ),
      )
      .limit(1);

    if (!definition) {
      return failure(
        ['binding', 'agentDefinitionId'],
        `绑定的 Agent ${binding.agentDefinitionId} 不存在或不属于当前租户`,
      );
    }
    if (definition.status !== 'published' || !definition.publishedVersionId) {
      return failure(
        ['binding', 'agentDefinitionId'],
        `绑定的 Agent「${definition.name}」当前不是已发布状态（${definition.status}）`,
      );
    }

    const [version] = await this.tenantDb
      .select({
        id: schema.agentVersions.id,
        archivedAt: schema.agentVersions.archivedAt,
      })
      .from(schema.agentVersions)
      .where(
        and(
          eq(schema.agentVersions.tenantId, tenantId),
          eq(schema.agentVersions.id, binding.agentVersionId),
          eq(schema.agentVersions.agentDefinitionId, definition.id),
        ),
      )
      .limit(1);

    if (!version || version.archivedAt) {
      return failure(
        ['binding', 'agentVersionId'],
        `绑定的 Agent「${definition.name}」固定版本 ${binding.agentVersionId} 不存在或已归档`,
      );
    }

    return {
      ok: true,
      resolved: {
        kind: 'agent',
        binding,
        candidate: {
          kind: 'agent',
          agentDefinitionId: definition.id,
          agentVersionId: binding.agentVersionId,
          name: definition.name,
          description: definition.description,
        },
      },
    };
  }
}

function failure(
  path: Array<string | number>,
  message: string,
): { ok: false; issues: AppSpecReferenceIssue[] } {
  return { ok: false, issues: [{ path, message }] };
}

/** 从版本快照取输入契约与顶层 text-output / json-output 节点 */
export function buildWorkflowCandidate(
  definition: { id: string; name: string; description: string | null },
  version: { id: string; snapshot: schema.WorkflowVersionSnapshot },
): WorkflowBindingCandidate {
  const parsedInputSchema = version.snapshot.inputSchema
    ? workflowInputSchemaSchema.safeParse(version.snapshot.inputSchema)
    : null;
  const outputNodes = (version.snapshot.nodes ?? []).flatMap((node) => {
    const nodeType = node.data?.nodeType ?? node.data?.node_type;
    if (
      node.parentId ||
      typeof nodeType !== 'string' ||
      !OUTPUT_NODE_TYPES[nodeType]
    ) {
      return [];
    }
    const label =
      typeof node.data.label === 'string' && node.data.label.trim()
        ? node.data.label.trim()
        : node.id;
    return [
      {
        nodeId: node.id,
        nodeType: nodeType as 'text-output' | 'json-output',
        label,
      },
    ];
  });

  return {
    kind: 'workflow',
    workflowDefinitionId: definition.id,
    workflowVersionId: version.id,
    name: definition.name,
    description: definition.description,
    inputSchema: parsedInputSchema?.success ? parsedInputSchema.data : null,
    outputNodes,
  };
}

/**
 * 工作流绑定与固定版本快照的兼容性（ADR-0007 §3）：输入映射指向已声明的输入、类型与选项/范围兼容、
 * 必填输入都被必填字段映射；输出映射指向快照中的 text-output / json-output 节点。
 */
export function collectWorkflowBindingIssues(
  binding: WorkflowBinding,
  fields: readonly GeneratedAppField[],
  candidate: WorkflowBindingCandidate,
): AppSpecReferenceIssue[] {
  return [
    ...collectInputMappingIssues(binding, fields, candidate.inputSchema),
    ...collectOutputMappingIssues(binding, candidate),
  ];
}

function collectInputMappingIssues(
  binding: WorkflowBinding,
  fields: readonly GeneratedAppField[],
  inputSchema: WorkflowInputSchema | null,
): AppSpecReferenceIssue[] {
  const declaredInputs = inputSchema?.fields ?? [];
  // 未声明输入契约：表单值按映射键写入顶层 inputParams，没有可比对的类型
  if (declaredInputs.length === 0) {
    return [];
  }

  const issues: AppSpecReferenceIssue[] = [];
  const formFields = new Map(fields.map((field) => [field.id, field]));
  const inputsById = new Map(declaredInputs.map((input) => [input.id, input]));
  const mappedInputs = new Map<string, GeneratedAppField>();

  binding.inputMapping.forEach((mapping, index) => {
    const path = ['binding', 'inputMapping', index];
    const input = inputsById.get(mapping.workflowInputFieldId);
    if (!input) {
      issues.push({
        path: [...path, 'workflowInputFieldId'],
        message: `工作流输入契约中没有字段 ${mapping.workflowInputFieldId}（可用：${declaredInputs.map((item) => item.id).join('、')}）`,
      });
      return;
    }
    const field = formFields.get(mapping.fieldId);
    if (!field) {
      // 引用不存在的表单字段由 collectAppSpecReferenceIssues 报告
      return;
    }
    mappedInputs.set(input.id, field);
    issues.push(
      ...collectFieldCompatibilityIssues(field, input).map((message) => ({
        path,
        message,
      })),
    );
  });

  for (const input of declaredInputs) {
    if (!input.required) continue;
    const field = mappedInputs.get(input.id);
    if (!field) {
      issues.push({
        path: ['binding', 'inputMapping'],
        message: `工作流必填输入 ${input.id}（${input.label}）没有被任何表单字段映射`,
      });
    } else if (!field.required) {
      issues.push({
        path: ['binding', 'inputMapping'],
        message: `工作流必填输入 ${input.id} 映射的表单字段 ${field.id} 不是必填，留空提交会被工作流拒绝`,
      });
    }
  }

  return issues;
}

function collectFieldCompatibilityIssues(
  field: GeneratedAppField,
  input: WorkflowInputField,
): string[] {
  const expectedType = COMPATIBLE_WORKFLOW_INPUT_TYPE[field.type];
  if (expectedType !== input.type) {
    return [
      `表单字段 ${field.id}（${field.type}）不能映射到工作流输入 ${input.id}（${input.type}）`,
    ];
  }

  const issues: string[] = [];
  const validation = input.validation;
  if (field.type === 'single_select' || field.type === 'multi_select') {
    const allowed = new Set(input.options ?? []);
    const outside = field.options
      .map((option) => option.value)
      .filter((value) => !allowed.has(value));
    if (outside.length > 0) {
      issues.push(
        `表单字段 ${field.id} 的选项 ${outside.join('、')} 不在工作流输入 ${input.id} 的选项中（可用：${(input.options ?? []).join('、')}）`,
      );
    }
  } else if (field.type === 'number') {
    if (
      validation?.min !== undefined &&
      (field.min === undefined || field.min < validation.min)
    ) {
      issues.push(
        `表单字段 ${field.id} 的 min 必须不小于工作流输入 ${input.id} 的 min ${validation.min}`,
      );
    }
    if (
      validation?.max !== undefined &&
      (field.max === undefined || field.max > validation.max)
    ) {
      issues.push(
        `表单字段 ${field.id} 的 max 必须不大于工作流输入 ${input.id} 的 max ${validation.max}`,
      );
    }
  } else if (
    validation?.maxLength !== undefined &&
    field.maxLength > validation.maxLength
  ) {
    issues.push(
      `表单字段 ${field.id} 的 maxLength ${field.maxLength} 超过工作流输入 ${input.id} 的 maxLength ${validation.maxLength}`,
    );
  }
  return issues;
}

function collectOutputMappingIssues(
  binding: WorkflowBinding,
  candidate: WorkflowBindingCandidate,
): AppSpecReferenceIssue[] {
  const nodesById = new Map(
    candidate.outputNodes.map((node) => [node.nodeId, node]),
  );
  const issues: AppSpecReferenceIssue[] = [];
  if (candidate.outputNodes.length === 0) {
    issues.push({
      path: ['binding', 'outputMapping'],
      message: `工作流「${candidate.name}」的固定版本没有 text-output / json-output 节点，无法承接结果`,
    });
    return issues;
  }

  binding.outputMapping.forEach((mapping, index) => {
    const node = nodesById.get(mapping.nodeId);
    if (!node) {
      issues.push({
        path: ['binding', 'outputMapping', index, 'nodeId'],
        message: `工作流固定版本中没有输出节点 ${mapping.nodeId}（可用：${candidate.outputNodes.map((item) => item.nodeId).join('、')}）`,
      });
    } else if (mapping.path && node.nodeType !== 'json-output') {
      issues.push({
        path: ['binding', 'outputMapping', index, 'path'],
        message: `输出节点 ${mapping.nodeId} 是 text-output，不能用 path 取键`,
      });
    }
  });
  return issues;
}
