/**
 * 自进化写服务。
 * 负责应用图变更与创建资源，统一保留领域异常的 Problem Details。
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WorkflowGraphViewportSchema } from '@agentloom/contracts';
import { DomainException } from '../../common/exceptions/domain.exception';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import { LlmProviderService } from '../llm/llm-provider.service';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { SkillService } from '../skill/skill.service';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { SelfEvolutionGraphPatch } from './self-evolution-graph-patch';
import { SelfEvolutionPermissionPolicy } from './self-evolution-permission-policy';
import { SelfEvolutionReadService } from './self-evolution-read.service';
import {
  buildSkillFiles,
  hasNewPublishedVersion,
  readOptionalNumber,
  readProposal,
  readRecord,
  readRequiredRecord,
  readRequiredString,
  readRequiredStringArray,
  readString,
  toFailureResult,
} from './self-evolution-value.util';
import type { ApplyAgentCanvasSnapshotOptions } from '../agent-definition/agent-definition.service';
import { CreateWorkflowDefinitionSchema } from '../workflow-definition/dto/create-workflow-definition.dto';
import { UpdateWorkflowDefinitionSchema } from '../workflow-definition/dto/update-workflow-definition.dto';
import type {
  SelfEvolutionSessionContext,
  SelfEvolutionToolResult,
} from './self-evolution.types';
import {
  AgentCreateDtoSchema,
  AgentGraphEdgeArraySchema,
  AgentGraphNodeArraySchema,
  McpImportDtoSchema,
  ModelCreateDtoSchema,
  ProviderCreateDtoSchema,
  SkillCreateDtoSchema,
} from './self-evolution.schemas';

type GenericRecord = Record<string, unknown>;

@Injectable()
export class SelfEvolutionMutationService {
  constructor(
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly skillService: SkillService,
    private readonly llmService: LlmService,
    private readonly llmProviderService: LlmProviderService,
    private readonly mcpService: McpService,
    private readonly workspaceService: WorkspaceService,
    private readonly workflowVersionService: WorkflowVersionService,
    private readonly permissionPolicy: SelfEvolutionPermissionPolicy,
    private readonly graphPatch: SelfEvolutionGraphPatch,
    private readonly readService: SelfEvolutionReadService,
  ) {}

  async execute(
    mutation: () => Promise<SelfEvolutionToolResult>,
  ): Promise<SelfEvolutionToolResult> {
    try {
      return await mutation();
    } catch (error) {
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
  }

  async applyChange(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    try {
      const proposal = readProposal(input.proposal);
      if (!proposal) {
        throw new Error('proposal 缺失或格式非法');
      }

      const target = await this.readService.loadGraphTarget(
        context,
        proposal.targetKind,
        proposal.targetId,
      );

      const nextNodes = await this.graphPatch.normalizeMcpToolNodes(
        context.tenantId,
        this.graphPatch.applyNodes(target.nodes, proposal.nodeOperations ?? []),
      );
      const nextEdges = this.graphPatch.applyEdges(
        target.edges,
        proposal.edgeOperations ?? [],
      );

      if (target.kind === 'agent') {
        const agentOptions: ApplyAgentCanvasSnapshotOptions = {
          canvasNodes: AgentGraphNodeArraySchema.parse(nextNodes),
          canvasEdges: AgentGraphEdgeArraySchema.parse(nextEdges),
          expectedVersion: proposal.baseVersion,
          publishAfterSave: proposal.publishTarget,
          ...(proposal.viewport
            ? {
                canvasViewport: WorkflowGraphViewportSchema.parse(
                  proposal.viewport,
                ),
              }
            : {}),
        };

        const result = await this.agentDefinitionService.applyCanvasSnapshot(
          target.id,
          agentOptions,
          context.actorUserId,
        );
        const detailRecord = readRecord(result.detail);
        const detailVersion = readOptionalNumber(detailRecord?.version);

        return {
          success: true,
          data: {
            targetType: 'agent',
            targetId: target.id,
            targetLabel: target.label,
            applied: true,
            publishedVersionId: result.publishedVersionId,
            publishedVersionNumber: result.publishedVersionNumber,
            versionInfo: {
              ...(detailVersion === undefined
                ? {}
                : {
                    draftVersion: detailVersion,
                  }),
              ...(typeof result.publishedVersionNumber === 'number'
                ? {
                    publishedVersionNumber: result.publishedVersionNumber,
                    userVisibleVersionNumber: result.publishedVersionNumber,
                    note: 'publishedVersionNumber 才是用户可见的发布版号；detail.version 是当前草稿修订号，可能比发布版号更大。',
                  }
                : detailVersion === undefined
                  ? {}
                  : {
                      userVisibleVersionNumber: detailVersion,
                      note: '当前操作未生成新的发布版号；如需对外展示版本，请优先使用 publishedVersionNumber，缺失时再回退到 detail.version。',
                    }),
            },
            restartSuggestion:
              target.id === context.currentAgentDefinitionId &&
              hasNewPublishedVersion(
                target.publishedVersionId,
                result.publishedVersionId,
              )
                ? {
                    available: true,
                    currentConversationId: context.conversationId,
                    publishedVersionId: result.publishedVersionId,
                    publishedVersionNumber: result.publishedVersionNumber,
                  }
                : undefined,
            detail: result.detail,
          },
        };
      }

      const workflowVersion = target.version;
      const updatedWorkflow =
        await this.workflowVersionService.updateDefinition(
          target.id,
          context.actorUserId,
          UpdateWorkflowDefinitionSchema.parse({
            version: workflowVersion,
            nodes: nextNodes,
            edges: nextEdges,
            ...(proposal.viewport ? { viewport: proposal.viewport } : {}),
            ...(proposal.metadataPatch ? proposal.metadataPatch : {}),
          }),
        );

      const published = proposal.publishTarget
        ? await this.workflowVersionService.publish(
            target.id,
            z.object({}).strict().parse({}),
            context.actorUserId,
          )
        : null;

      return {
        success: true,
        data: {
          targetType: 'workflow',
          targetId: target.id,
          targetLabel: target.label,
          applied: true,
          detail: updatedWorkflow,
          ...(published ? { publish: published } : {}),
        },
      };
    } catch (error) {
      return toFailureResult(error);
    }
  }

  async createResource(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    try {
      const resourceType = readString(input.resourceType);
      const spec = readRecord(input.spec);

      if (!resourceType || !spec) {
        throw new Error('resourceType 与 spec 都是必填项');
      }

      switch (resourceType) {
        case 'skill': {
          this.permissionPolicy.requireResourceManagement(context);
          const files = buildSkillFiles(spec.files, spec.content);
          const skill = await this.skillService.create(
            context.tenantId,
            context.actorUserId,
            SkillCreateDtoSchema.parse({
              name: readRequiredString(spec.name, 'spec.name'),
              description: readString(spec.description) ?? '',
              ...(readString(spec.content)
                ? { content: readString(spec.content) }
                : {}),
            }),
            files,
          );
          return { success: true, data: { resourceType, resource: skill } };
        }
        case 'workspace': {
          this.permissionPolicy.requireResourceManagement(context);
          const organizationId =
            await this.workspaceService.resolveOrganizationId(context.tenantId);
          const workspace = await this.workspaceService.createEmpty(
            context.tenantId,
            organizationId,
            context.actorUserId,
            readRequiredString(spec.name, 'spec.name'),
            readString(spec.description),
          );
          return { success: true, data: { resourceType, resource: workspace } };
        }
        case 'agent': {
          this.permissionPolicy.requireExternalEditing(context);
          const agent = await this.agentDefinitionService.create(
            AgentCreateDtoSchema.parse({
              name: readRequiredString(spec.name, 'spec.name'),
              ...(readString(spec.description)
                ? { description: readString(spec.description) }
                : {}),
              ...(readString(spec.icon) ? { icon: readString(spec.icon) } : {}),
            }),
            context.actorUserId,
          );
          return { success: true, data: { resourceType, resource: agent } };
        }
        case 'workflow': {
          this.permissionPolicy.requireExternalEditing(context);
          const workflow = await this.workflowVersionService.create(
            context.tenantId,
            context.actorUserId,
            CreateWorkflowDefinitionSchema.parse({
              name: readRequiredString(spec.name, 'spec.name'),
              ...(readString(spec.description)
                ? { description: readString(spec.description) }
                : {}),
              ...(readString(spec.icon) ? { icon: readString(spec.icon) } : {}),
            }),
          );
          return { success: true, data: { resourceType, resource: workflow } };
        }
        case 'mcp': {
          this.permissionPolicy.requireResourceManagement(context);
          const mcp = await this.mcpService.importTools(
            McpImportDtoSchema.parse({
              serverName: readRequiredString(
                spec.serverName,
                'spec.serverName',
              ),
              ...(readString(spec.serverDescription)
                ? { serverDescription: readString(spec.serverDescription) }
                : {}),
              connection: readRequiredRecord(
                spec.connection,
                'spec.connection',
              ),
              toolNames: readRequiredStringArray(
                spec.toolNames,
                'spec.toolNames',
              ),
              conflictStrategy:
                readString(spec.conflictStrategy) === 'overwrite'
                  ? 'overwrite'
                  : 'skip',
            }),
            context.actorUserId,
            context.tenantId,
          );
          return { success: true, data: { resourceType, resource: mcp } };
        }
        case 'model': {
          this.permissionPolicy.requireResourceManagement(context);
          const providerSpec = readRecord(spec.provider);
          let providerId = readString(spec.providerId);
          if (!providerId && providerSpec) {
            const provider = await this.llmProviderService.create(
              ProviderCreateDtoSchema.parse({
                name: readRequiredString(
                  providerSpec.name,
                  'spec.provider.name',
                ),
                baseUrl: readRequiredString(
                  providerSpec.baseUrl,
                  'spec.provider.baseUrl',
                ),
                ...(readString(providerSpec.slug)
                  ? { slug: readString(providerSpec.slug) }
                  : {}),
                ...(readString(providerSpec.apiProtocol)
                  ? { apiProtocol: readString(providerSpec.apiProtocol) }
                  : {}),
                ...(readString(providerSpec.apiKey)
                  ? { apiKey: readString(providerSpec.apiKey) }
                  : {}),
                ...(readString(providerSpec.iconUrl)
                  ? { iconUrl: readString(providerSpec.iconUrl) }
                  : {}),
              }),
              context.tenantId,
              context.actorUserId,
            );
            providerId = provider.id;
          }

          if (!providerId) {
            throw new Error('创建模型时必须提供 providerId 或 provider 配置');
          }

          const model = await this.llmService.create(
            ModelCreateDtoSchema.parse({
              name: readRequiredString(spec.name, 'spec.name'),
              providerId,
              modelId: readRequiredString(spec.modelId, 'spec.modelId'),
              modelType:
                readString(spec.modelType) === 'embedding'
                  ? 'embedding'
                  : 'chat',
              ...(readRecord(spec.parameters)
                ? { parameters: readRecord(spec.parameters) }
                : {}),
              ...(readRecord(spec.capabilities)
                ? { capabilities: readRecord(spec.capabilities) }
                : {}),
              ...(readOptionalNumber(spec.contextWindow)
                ? { contextWindow: readOptionalNumber(spec.contextWindow) }
                : {}),
              ...(readOptionalNumber(spec.maxOutputTokens)
                ? {
                    maxOutputTokens: readOptionalNumber(spec.maxOutputTokens),
                  }
                : {}),
              ...(readOptionalNumber(spec.timeoutMs)
                ? { timeoutMs: readOptionalNumber(spec.timeoutMs) }
                : {}),
            }),
            context.tenantId,
            context.actorUserId,
          );

          return { success: true, data: { resourceType, resource: model } };
        }
        default:
          throw new Error(`不支持的 resourceType: ${resourceType}`);
      }
    } catch (error) {
      return toFailureResult(error);
    }
  }
}
