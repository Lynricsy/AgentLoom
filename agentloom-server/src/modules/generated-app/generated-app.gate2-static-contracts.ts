// Gate 2 静态合约（ADR-0007 §4）：公开输入 JSON Schema 由表单生成，结果合约由分区生成，
// 再对照 Gate 0 固定的绑定快照逐条复核兼容性；Agent 绑定的包装工作流图走现有图结构校验。
// 纯计算，失败码 static-contract-mismatch。

import type { ReactFlowEdge, ReactFlowNode } from '../../database/schema';
import { collectWorkflowGraphStructureErrors } from '../workflow-definition/utils/validate-workflow-graph-structure.utils';
import { normalizeWorkflowNodesAndEdges } from '../workflow-definition/utils/normalize-workflow-graph.utils';
import type {
  GeneratedAppField,
  GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type {
  GeneratedAppGateEvaluationV2,
  ResolvedGeneratedAppBinding,
} from './types/generation-v2.ports';
import type {
  GeneratedAppPublicInputContract,
  GeneratedAppResultContract,
  GeneratedAppStaticContractsV2,
} from './types/generation-plan-v2.types';
import { failedGate, gateEvidence } from './generated-app.gate-v2.util';

export function buildPublicInputJsonSchema(
  fields: readonly GeneratedAppField[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field.type) {
      case 'text':
      case 'textarea':
        properties[field.id] = {
          type: 'string',
          title: field.label,
          maxLength: field.maxLength,
          ...(field.required ? { minLength: 1 } : {}),
        };
        break;
      case 'number':
        properties[field.id] = {
          type: 'number',
          title: field.label,
          ...(field.min !== undefined ? { minimum: field.min } : {}),
          ...(field.max !== undefined ? { maximum: field.max } : {}),
        };
        break;
      case 'single_select':
        properties[field.id] = {
          type: 'string',
          title: field.label,
          enum: field.options.map((option) => option.value),
        };
        break;
      case 'multi_select':
        properties[field.id] = {
          type: 'array',
          title: field.label,
          uniqueItems: true,
          ...(field.required ? { minItems: 1 } : {}),
          items: {
            type: 'string',
            enum: field.options.map((option) => option.value),
          },
        };
        break;
    }
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: fields.filter((field) => field.required).map((field) => field.id),
    properties,
  };
}

const COMPATIBLE_WORKFLOW_INPUT_TYPE: Record<
  GeneratedAppField['type'],
  string
> = {
  text: 'text',
  textarea: 'text',
  number: 'number',
  single_select: 'single_select',
  multi_select: 'multi_select',
};

function checkBindingCompatibility(
  appSpec: GeneratedAppSpecV2,
  resolved: ResolvedGeneratedAppBinding,
): GeneratedAppStaticContractsV2['bindingCompatibility'] {
  const checks: GeneratedAppStaticContractsV2['bindingCompatibility'] = [];
  const binding = appSpec.binding;

  if (binding.kind === 'agent' || resolved.kind === 'agent') {
    const pinned =
      binding.kind === 'agent' &&
      resolved.kind === 'agent' &&
      binding.agentDefinitionId === resolved.candidate.agentDefinitionId &&
      binding.agentVersionId === resolved.candidate.agentVersionId;
    checks.push({
      check: 'binding-pinned-version',
      passed: pinned,
      detail: pinned
        ? `Agent ${binding.kind === 'agent' ? binding.agentDefinitionId : ''} 固定版本与 Gate 0 解析一致`
        : 'AppSpec 绑定与 Gate 0 解析出的候选不一致',
    });
    return checks;
  }

  const candidate = resolved.candidate;
  const pinned =
    binding.workflowDefinitionId === candidate.workflowDefinitionId &&
    binding.workflowVersionId === candidate.workflowVersionId;
  checks.push({
    check: 'binding-pinned-version',
    passed: pinned,
    detail: pinned
      ? `工作流固定版本 ${binding.workflowVersionId} 与 Gate 0 解析一致`
      : 'AppSpec 绑定的工作流或版本与 Gate 0 解析出的候选不一致',
  });

  const fieldsById = new Map(
    appSpec.inputForm.fields.map((field) => [field.id, field]),
  );
  const schemaFields = candidate.inputSchema
    ? new Map(candidate.inputSchema.fields.map((field) => [field.id, field]))
    : null;
  for (const mapping of binding.inputMapping) {
    const field = fieldsById.get(mapping.fieldId);
    if (!field) continue;
    if (!schemaFields) {
      checks.push({
        check: `input:${mapping.fieldId}`,
        passed: true,
        detail: `工作流未声明 inputSchema，${mapping.fieldId} 作为顶层 inputParams.${mapping.workflowInputFieldId} 传入`,
      });
      continue;
    }
    const target = schemaFields.get(mapping.workflowInputFieldId);
    if (!target) {
      checks.push({
        check: `input:${mapping.fieldId}`,
        passed: false,
        detail: `工作流输入 ${mapping.workflowInputFieldId} 不存在于固定版本 inputSchema`,
      });
      continue;
    }
    const expectedType = COMPATIBLE_WORKFLOW_INPUT_TYPE[field.type];
    const optionSubset =
      field.type === 'single_select' || field.type === 'multi_select'
        ? field.options.every((option) =>
            (target.options ?? []).includes(option.value),
          )
        : true;
    const passed = target.type === expectedType && optionSubset;
    checks.push({
      check: `input:${mapping.fieldId}`,
      passed,
      detail: passed
        ? `${field.id}(${field.type}) → ${target.id}(${target.type})`
        : target.type !== expectedType
          ? `${field.id}(${field.type}) 与工作流输入 ${target.id}(${target.type}) 类型不兼容`
          : `${field.id} 的选项不是工作流输入 ${target.id} 选项的子集`,
    });
  }
  if (schemaFields) {
    const mappedTargets = new Set(
      binding.inputMapping.map((mapping) => mapping.workflowInputFieldId),
    );
    for (const target of schemaFields.values()) {
      if (target.required && !mappedTargets.has(target.id)) {
        checks.push({
          check: `required-input:${target.id}`,
          passed: false,
          detail: `工作流必填输入 ${target.id} 没有被任何表单字段映射`,
        });
      }
    }
  }

  const outputNodes = new Map(
    candidate.outputNodes.map((node) => [node.nodeId, node]),
  );
  for (const mapping of binding.outputMapping) {
    const node = outputNodes.get(mapping.nodeId);
    const passed =
      node !== undefined &&
      (mapping.path === undefined || node.nodeType === 'json-output');
    checks.push({
      check: `output:${mapping.sectionId}`,
      passed,
      detail: !node
        ? `输出节点 ${mapping.nodeId} 不存在于固定版本快照`
        : passed
          ? `${mapping.sectionId} ← ${node.nodeType} ${node.nodeId}${mapping.path ? `.${mapping.path}` : ''}`
          : `text-output 节点 ${node.nodeId} 不支持 path 取值`,
    });
  }
  return checks;
}

export function buildStaticContracts(
  appSpec: GeneratedAppSpecV2,
  resolved: ResolvedGeneratedAppBinding,
  wrapperWorkflow: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } | null,
): GeneratedAppStaticContractsV2 {
  const binding = appSpec.binding;
  const inputTargets = new Map(
    binding.kind === 'workflow'
      ? binding.inputMapping.map((mapping) => [
          mapping.fieldId,
          mapping.workflowInputFieldId,
        ])
      : [],
  );
  const publicInput: GeneratedAppPublicInputContract = {
    jsonSchema: buildPublicInputJsonSchema(appSpec.inputForm.fields),
    fields: appSpec.inputForm.fields.map((field) => ({
      fieldId: field.id,
      type: field.type,
      required: field.required,
      workflowInputFieldId: inputTargets.get(field.id) ?? null,
    })),
  };

  const outputNodeTypes = new Map(
    resolved.kind === 'workflow'
      ? resolved.candidate.outputNodes.map((node) => [
          node.nodeId,
          node.nodeType,
        ])
      : [],
  );
  const result: GeneratedAppResultContract = {
    sections: appSpec.resultView.sections.map((section) => {
      if (binding.kind === 'agent') {
        return {
          sectionId: section.id,
          format: section.format,
          source: { kind: 'agent-reply' as const },
        };
      }
      const mapping = binding.outputMapping.find(
        (item) => item.sectionId === section.id,
      );
      return {
        sectionId: section.id,
        format: section.format,
        source: {
          kind: 'workflow-output' as const,
          nodeId: mapping?.nodeId ?? '',
          nodeType:
            (mapping && outputNodeTypes.get(mapping.nodeId)) ?? 'text-output',
          path: mapping?.path ?? null,
        },
      };
    }),
  };

  let wrapper: GeneratedAppStaticContractsV2['wrapperWorkflow'] = null;
  if (binding.kind === 'agent') {
    if (!wrapperWorkflow) {
      wrapper = {
        nodeIds: [],
        edgeCount: 0,
        structureErrors: ['没有构建 Agent 包装工作流图'],
      };
    } else {
      const normalized = normalizeWorkflowNodesAndEdges(
        wrapperWorkflow.nodes,
        wrapperWorkflow.edges,
      );
      wrapper = {
        nodeIds: normalized.nodes.map((node) => node.id),
        edgeCount: normalized.edges.length,
        structureErrors: collectWorkflowGraphStructureErrors(
          normalized.nodes,
          normalized.edges,
        ),
      };
    }
  }

  return {
    publicInput,
    result,
    bindingCompatibility: checkBindingCompatibility(appSpec, resolved),
    wrapperWorkflow: wrapper,
  };
}

export function evaluateGate2StaticContracts(
  appSpec: GeneratedAppSpecV2,
  resolved: ResolvedGeneratedAppBinding,
  wrapperWorkflow: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } | null,
): GeneratedAppGateEvaluationV2<GeneratedAppStaticContractsV2> {
  const contracts = buildStaticContracts(appSpec, resolved, wrapperWorkflow);
  const problems = [
    ...contracts.bindingCompatibility
      .filter((check) => !check.passed)
      .map((check) => check.detail),
    ...(contracts.wrapperWorkflow?.structureErrors ?? []).map(
      (error) => `包装工作流：${error}`,
    ),
  ];
  const evidence = [
    gateEvidence({
      id: 'gate-2-public-input-contract',
      label: '公开输入合约',
      kind: 'static_check',
      summary: `由 ${contracts.publicInput.fields.length} 个表单字段生成 JSON Schema；必填 ${contracts.publicInput.fields.filter((field) => field.required).length} 个。`,
      details: contracts.publicInput,
    }),
    gateEvidence({
      id: 'gate-2-result-contract',
      label: '结果合约',
      kind: 'static_check',
      summary: `${contracts.result.sections.length} 个结果分区均有来源。`,
      details: contracts.result,
    }),
    gateEvidence({
      id: 'gate-2-binding-compatibility',
      label: '绑定兼容性',
      kind: 'static_check',
      summary: `${contracts.bindingCompatibility.length} 项检查，${problems.length} 项不通过。`,
      details: {
        checks: contracts.bindingCompatibility,
        wrapperWorkflow: contracts.wrapperWorkflow,
      },
    }),
  ];

  if (problems.length > 0) {
    return failedGate({
      summary: `Gate 2 失败：静态合约有 ${problems.length} 处不一致。`,
      code: 'static-contract-mismatch',
      message: problems.join('；'),
      details: { problems },
      evidence,
      repairInstructions:
        '绑定目标的 inputSchema 或输出节点与 AppSpec 不一致；重新发布工作流后带 regenerateAppSpec: true 重新生成。',
      plan: contracts,
    });
  }

  return {
    status: 'passed',
    summary: 'Gate 2 通过：公开输入与结果合约已生成，并与固定版本快照兼容。',
    evidence,
    failure: null,
    repairInstructions: null,
    plan: contracts,
  };
}
