/**
 * 自进化权限策略。
 * 集中维护能力开关、图变更风险分类与审批请求构造。
 */
import { Injectable } from '@nestjs/common';
import type {
  SelfEvolutionCategory,
  SelfEvolutionGraphProposal,
  SelfEvolutionPermissionRequest,
  SelfEvolutionRiskLevel,
  SelfEvolutionSessionContext,
} from './self-evolution.types';
import { SELF_EVOLUTION_DOMAIN } from './self-evolution.types';
import {
  findEdgeById,
  findNodeById,
  readNodeType,
  readRecord,
  readRequiredRecord,
  readRequiredString,
  readString,
  readStringArray,
  type EvolutionRecord,
} from './self-evolution-value.util';

type GenericRecord = EvolutionRecord;

@Injectable()
export class SelfEvolutionPermissionPolicy {
  requireResourceManagement(context: SelfEvolutionSessionContext): void {
    if (!context.selfEvolutionPolicy.resourceManagement)
      throw new Error('当前 Agent 未启用资源管理子能力');
  }
  requireExternalEditing(context: SelfEvolutionSessionContext): void {
    if (!context.selfEvolutionPolicy.externalEditing)
      throw new Error('当前 Agent 未启用外部编辑子能力');
  }
  requireSandboxManagement(context: SelfEvolutionSessionContext): void {
    if (!context.selfEvolutionPolicy.sandboxManagement)
      throw new Error('当前 Agent 未启用沙箱管理子能力');
  }

  determineGraphChangePermissionProfile(params: {
    context: SelfEvolutionSessionContext;
    target: {
      kind: 'agent' | 'workflow';
      id: string;
    };
    currentNodes: GenericRecord[];
    currentEdges: GenericRecord[];
    nodeOperations: Array<{
      op: string;
      nodeId?: string;
      node?: GenericRecord;
      patch?: GenericRecord;
    }>;
    edgeOperations: Array<{
      op: string;
      edgeId?: string;
      edge?: GenericRecord;
      patch?: GenericRecord;
    }>;
    nextNodes: GenericRecord[];
    nextEdges: GenericRecord[];
  }): {
    category: SelfEvolutionCategory;
    riskLevel: SelfEvolutionRiskLevel;
    requiresConfirmation: boolean;
  } {
    if (params.target.kind === 'workflow') {
      this.requireExternalEditing(params.context);
      return {
        category: 'workflow_edit',
        riskLevel: 'high',
        requiresConfirmation: true,
      };
    }

    const isSelfAgent =
      params.target.id === params.context.currentAgentDefinitionId;

    if (!isSelfAgent) {
      this.requireExternalEditing(params.context);
      return {
        category: 'agent_external_edit',
        riskLevel: 'high',
        requiresConfirmation: true,
      };
    }

    const touchedNodeTypes = new Set<string>();
    for (const operation of params.nodeOperations) {
      const nodeType =
        readNodeType(operation.node) ??
        readNodeType(operation.patch) ??
        readNodeType(
          findNodeById(params.currentNodes, operation.nodeId) ??
            findNodeById(params.nextNodes, operation.nodeId),
        );
      if (nodeType) {
        touchedNodeTypes.add(nodeType);
      }
    }

    const touchesWorkspace = touchedNodeTypes.has('workspace');
    const touchesSandbox = touchedNodeTypes.has('sandbox');
    const touchesWorkspaceBinding = params.edgeOperations.some((operation) => {
      const edge =
        operation.edge ??
        operation.patch ??
        findEdgeById(params.currentEdges, operation.edgeId) ??
        findEdgeById(params.nextEdges, operation.edgeId);
      if (!edge || typeof edge !== 'object') {
        return false;
      }
      return (
        readString((edge as GenericRecord).sourceHandle) === 'volume-out' ||
        readString((edge as GenericRecord).targetHandle) === 'volume-in'
      );
    });

    if (touchesSandbox) {
      this.requireSandboxManagement(params.context);
      return {
        category: 'sandbox_spec_adjustment',
        riskLevel: 'high',
        requiresConfirmation: true,
      };
    }

    if (touchesWorkspace || touchesWorkspaceBinding) {
      this.requireSandboxManagement(params.context);
      return {
        category: 'workspace_sandbox_binding_adjustment',
        riskLevel: 'medium',
        requiresConfirmation: true,
      };
    }

    return {
      category: 'agent_self_canvas_edit',
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  buildCreateResourcePermissionProfile(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): {
    category: SelfEvolutionCategory;
    request: SelfEvolutionPermissionRequest;
  } {
    const resourceType = readRequiredString(input.resourceType, 'resourceType');
    const spec = readRequiredRecord(input.spec, 'spec');
    const sourceLabel = context.currentAgentName;

    switch (resourceType) {
      case 'skill':
        this.requireResourceManagement(context);
        return {
          category: 'skill_resource_management',
          request: {
            description: `主人授权后，Agent 将创建新的 Skill 资源。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'skill_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'skill',
            targetLabel: readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的 Skill 资源，并立即返回新资源 ID。',
            denyEffect: '不会创建 Skill，也不会修改现有资源。',
            diffPreview: {
              resourceType,
              name: readString(spec.name),
              fileNames: Object.keys(readRecord(spec.files) ?? {}),
            },
            rememberable: true,
            resourcePaths: ['resource:skill'],
          },
        };
      case 'mcp':
        this.requireResourceManagement(context);
        return {
          category: 'mcp_resource_management',
          request: {
            description: `主人授权后，Agent 将导入新的 MCP 服务器及工具定义。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'mcp_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'mcp',
            targetLabel: readRequiredString(spec.serverName, 'spec.serverName'),
            approveEffect: '创建 MCP 配置并导入选定工具。',
            denyEffect: '不会连接或导入新的 MCP 资源。',
            diffPreview: {
              resourceType,
              toolNames: readStringArray(spec.toolNames),
              connection: readRecord(spec.connection),
            },
            rememberable: true,
            resourcePaths: ['resource:mcp'],
          },
        };
      case 'model':
        this.requireResourceManagement(context);
        return {
          category: 'model_resource_management',
          request: {
            description: `主人授权后，Agent 将创建新的模型配置资源。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'model_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'model',
            targetLabel:
              readString(spec.name) ??
              readString(readRecord(spec.provider)?.name) ??
              '新模型',
            approveEffect:
              '创建 Provider（如有）与 Model Config，并返回新模型 ID。',
            denyEffect: '不会创建新的模型相关资源。',
            diffPreview: {
              resourceType,
              providerId: readString(spec.providerId),
              provider: readRecord(spec.provider),
              modelId: readString(spec.modelId),
            },
            rememberable: true,
            resourcePaths: ['resource:model'],
          },
        };
      case 'workspace':
        this.requireResourceManagement(context);
        return {
          category: 'workspace_resource_management',
          request: {
            description: `主人授权后，Agent 将创建新的 Workspace 资源。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'workspace_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'workspace',
            targetLabel: readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的空工作区快照。',
            denyEffect: '不会创建新的工作区资源。',
            diffPreview: {
              resourceType,
              name: readString(spec.name),
              description: readString(spec.description),
            },
            rememberable: true,
            resourcePaths: ['resource:workspace'],
          },
        };
      case 'agent':
        this.requireExternalEditing(context);
        return {
          category: 'agent_external_edit',
          request: {
            description: `主人授权后，Agent 将创建新的外部 Agent 编排。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'agent_external_edit',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'agent',
            targetLabel: readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的 Agent 定义。',
            denyEffect: '不会创建新的 Agent。',
            diffPreview: {
              resourceType,
              name: readString(spec.name),
              description: readString(spec.description),
            },
            rememberable: true,
            resourcePaths: ['resource:agent'],
          },
        };
      case 'workflow':
        this.requireExternalEditing(context);
        return {
          category: 'workflow_edit',
          request: {
            description: `主人授权后，Agent 将创建新的外部 Workflow 编排。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'workflow_edit',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'workflow',
            targetLabel: readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的 Workflow 定义。',
            denyEffect: '不会创建新的 Workflow。',
            diffPreview: {
              resourceType,
              name: readString(spec.name),
              description: readString(spec.description),
            },
            rememberable: true,
            resourcePaths: ['resource:workflow'],
          },
        };
      default:
        throw new Error(`不支持的 resourceType: ${resourceType}`);
    }
  }

  buildPermissionRequest(
    context: SelfEvolutionSessionContext,
    proposal: SelfEvolutionGraphProposal,
  ): SelfEvolutionPermissionRequest {
    return {
      description: `主人授权后，Agent 将应用编排变更：${proposal.summary}`,
      domain: SELF_EVOLUTION_DOMAIN,
      category: proposal.category,
      riskLevel: proposal.riskLevel,
      sourceLabel: context.currentAgentName,
      targetType: proposal.targetKind === 'workflow' ? 'workflow' : 'agent',
      targetLabel: proposal.targetLabel,
      approveEffect: proposal.publishTarget
        ? '应用变更并立即让目标编排切换到最新发布版本。'
        : '应用变更到目标编排。',
      denyEffect: '不会应用任何编排变更。',
      diffPreview: proposal.diffPreview,
      rememberable: true,
      resourcePaths: [
        `${proposal.targetKind === 'workflow' ? 'workflow' : 'agent'}:${proposal.targetId}`,
      ],
    };
  }
}
