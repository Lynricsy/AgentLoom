/**
 * 自进化只读服务。
 * 负责状态、资源池与图变更提案读取，不执行持久化写入。
 */
import { Injectable } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { SkillService } from '../skill/skill.service';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { SelfEvolutionGraphPatch } from './self-evolution-graph-patch';
import { SelfEvolutionPermissionPolicy } from './self-evolution-permission-policy';
import { cloneJsonArray, cloneJsonRecord, readEdgeOperations, readNodeOperations, readPositiveInt, readRecord, readString, readTargetKind } from './self-evolution-value.util';
import { ListAgentDefinitionsQuerySchema } from '../agent-definition/dto/list-agent-definitions-query.dto';
import { McpServerConfigQuerySchema } from '../mcp/dto/mcp-server-config-query.dto';
import { SkillQuerySchema } from '../skill/dto/skill-query.dto';
import { ListWorkflowDefinitionsQuerySchema } from '../workflow-definition/dto/list-workflow-definitions-query.dto';
import type { SelfEvolutionSessionContext, SelfEvolutionToolName, SelfEvolutionToolResult, SelfEvolutionGraphProposal, SelfEvolutionTargetKind } from './self-evolution.types';
import { SELF_EVOLUTION_DOMAIN } from './self-evolution.types';

type GenericRecord = Record<string, unknown>;
type ReadToolName = Extract<SelfEvolutionToolName, 'query_state' | 'query_resource_pool' | 'propose_change'>;

@Injectable()
export class SelfEvolutionReadService {
  constructor(
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly skillService: SkillService,
    private readonly llmService: LlmService,
    private readonly mcpService: McpService,
    private readonly workspaceService: WorkspaceService,
    private readonly workflowVersionService: WorkflowVersionService,
    private readonly permissionPolicy: SelfEvolutionPermissionPolicy,
    private readonly graphPatch: SelfEvolutionGraphPatch,
  ) {}

  async execute(toolName: ReadToolName, handlers: Record<ReadToolName, () => Promise<unknown>>): Promise<SelfEvolutionToolResult> {
    try {
      return { success: true, data: await handlers[toolName]() };
    } catch (error) {
      if (error instanceof DomainException) {
        return { success: false, data: { problemDetails: { type: error.type, title: error.message, status: error.getStatus(), detail: error.detail, ...(error.errors ? { errors: error.errors } : {}), ...(error.extensions ? { extensions: error.extensions } : {}) } }, error: error.detail };
      }
      return { success: false, data: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async queryState(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<GenericRecord> {
    const scope = readString(input.scope) ?? 'self';

    if (scope === 'self') {
      const detail = await this.agentDefinitionService.findDetailById(
        context.currentAgentDefinitionId,
      );
      return {
        scope: 'self',
        currentConversationId: context.conversationId,
        selfEvolutionPolicy: context.selfEvolutionPolicy,
        runtimeConfig: context.runtimeConfig ?? {},
        target: detail,
      };
    }

    const targetId = readString(input.targetId);
    if (!targetId) {
      throw new Error('查询外部 Agent / Workflow 时必须提供 targetId');
    }
    this.permissionPolicy.requireExternalEditing(context);

    if (scope === 'agent') {
      return {
        scope,
        target: await this.agentDefinitionService.findDetailById(targetId),
      };
    }

    if (scope === 'workflow') {
      return {
        scope,
        target:
          await this.workflowVersionService.findDefinitionDetailById(targetId),
      };
    }

    throw new Error(`不支持的 scope: ${scope}`);
  }

  async queryResourcePool(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<GenericRecord> {
    const limit = readPositiveInt(input.limit, 20, 100);
    const search = readString(input.search);
    const resourceType = readString(input.resourceType);

    const shouldInclude = (type: string) =>
      !resourceType || resourceType === type;

    const result: GenericRecord = {};

    if (shouldInclude('skill')) {
      const skills = await this.skillService.findAll(
        SkillQuerySchema.parse({
          page: 1,
          pageSize: limit,
          search,
          status: 'active',
        }),
      );
      result.skills = skills.data.map((skill) => ({
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        isBuiltin: skill.isBuiltin,
        fileCount: skill.fileCount,
      }));
    }

    if (shouldInclude('mcp_server')) {
      const configs = await this.mcpService.findAllConfigs(
        context.tenantId,
        McpServerConfigQuerySchema.parse({
          page: 1,
          pageSize: limit,
          ...(search ? { search } : {}),
        }),
      );
      result.mcpServers = configs.data.map((config) => ({
        id: config.id,
        name: config.name,
        description: config.description,
        transportType: config.transportType,
        toolCount: config.toolCount,
      }));
    }

    if (shouldInclude('mcp_tool')) {
      const tools = await this.mcpService.listTools(context.tenantId, 'mcp');
      result.mcpTools = tools
        .filter(
          (tool) =>
            tool.isActive &&
            (!search ||
              tool.name.includes(search) ||
              (tool.title ?? '').includes(search) ||
              (tool.description ?? '').includes(search)),
        )
        .slice(0, limit)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          title: tool.title,
          description: tool.description,
          mcpServerConfigId: tool.mcpServerConfigId,
          isActive: tool.isActive,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          portMappingMetadata: tool.portMappingMetadata,
          source: tool.source,
          annotations: tool.annotations,
        }));
    }

    if (shouldInclude('model')) {
      const models = await this.llmService.findAll(context.tenantId);
      result.models = models
        .filter(
          (model) =>
            !search ||
            model.name.includes(search) ||
            model.modelId.includes(search) ||
            model.provider.name.includes(search),
        )
        .slice(0, limit)
        .map((model) => ({
          id: model.id,
          name: model.name,
          modelId: model.modelId,
          providerId: model.providerId,
          providerName: model.provider.name,
          modelType: model.modelType,
          isDefault: model.isDefault,
        }));
    }

    if (shouldInclude('agent')) {
      const agents = await this.agentDefinitionService.findAll(
        ListAgentDefinitionsQuerySchema.parse({
          page: 1,
          pageSize: limit,
          ...(search ? { search } : {}),
        }),
      );
      result.agents = agents.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        publishedVersionId: agent.publishedVersionId,
      }));
    }

    if (shouldInclude('workflow')) {
      const workflows = await this.workflowVersionService.findAllDefinitions(
        ListWorkflowDefinitionsQuerySchema.parse({
          page: 1,
          pageSize: limit,
          ...(search ? { search } : {}),
        }),
      );
      result.workflows = workflows.data.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        publishedVersionId: workflow.publishedVersionId,
      }));
    }

    if (shouldInclude('workspace')) {
      const workspaces = await this.workspaceService.findAll(context.tenantId, {
        page: 1,
        pageSize: limit,
        ...(search ? { search } : {}),
      });
      result.workspaces = workspaces.data.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
      }));
    }

    return result;
  }

  async proposeChange(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<GenericRecord> {
    const target = await this.loadGraphTarget(
      context,
      readTargetKind(input.targetKind),
      readString(input.targetId),
    );
    const nodeOperations = readNodeOperations(input.nodeOperations);
    const edgeOperations = readEdgeOperations(input.edgeOperations);
    const viewport = readRecord(input.viewport);
    const metadataPatch = readRecord(input.metadataPatch);

    const nextNodes = await this.graphPatch.normalizeMcpToolNodes(
      context.tenantId,
      this.graphPatch.applyNodes(target.nodes, nodeOperations),
    );
    const nextEdges = this.graphPatch.applyEdges(target.edges, edgeOperations);
    const nextViewport = viewport ?? target.viewport ?? null;

    const permissionProfile = this.permissionPolicy.determineGraphChangePermissionProfile({
      context,
      target,
      currentNodes: target.nodes,
      currentEdges: target.edges,
      nodeOperations,
      edgeOperations,
      nextNodes,
      nextEdges,
    });

    const publishTarget =
      typeof input.publishTarget === 'boolean'
        ? input.publishTarget
        : target.kind === 'agent' &&
            target.id === context.currentAgentDefinitionId
          ? Boolean(target.publishedVersionId)
          : false;

    const diffPreview = this.graphPatch.buildDiffPreview({
      targetLabel: target.label,
      nodeOperations,
      edgeOperations,
      nextNodes,
      nextEdges,
      nextViewport,
      publishTarget,
    });

    const proposal: SelfEvolutionGraphProposal = {
      domain: SELF_EVOLUTION_DOMAIN,
      targetKind:
        target.kind === 'agent' &&
        target.id === context.currentAgentDefinitionId
          ? 'self'
          : target.kind,
      targetId: target.id,
      targetLabel: target.label,
      baseVersion: target.version,
      publishTarget,
      nodeOperations,
      edgeOperations,
      ...(nextViewport ? { viewport: nextViewport } : {}),
      ...(metadataPatch ? { metadataPatch } : {}),
      summary: String(diffPreview.summary ?? `${target.label} 编排变更提案`),
      category: permissionProfile.category,
      riskLevel: permissionProfile.riskLevel,
      requiresConfirmation: permissionProfile.requiresConfirmation,
      diffPreview,
    };

    return {
      proposal,
      target: {
        kind: target.kind,
        id: target.id,
        label: target.label,
        version: target.version,
        publishedVersionId: target.publishedVersionId,
      },
      preview: {
        nodes: nextNodes,
        edges: nextEdges,
        ...(nextViewport ? { viewport: nextViewport } : {}),
      },
    };
  }

  async loadGraphTarget(
    context: SelfEvolutionSessionContext,
    targetKind: SelfEvolutionTargetKind,
    targetId?: string,
  ): Promise<{
    kind: 'agent' | 'workflow';
    id: string;
    label: string;
    version: number;
    publishedVersionId?: string | null;
    nodes: GenericRecord[];
    edges: GenericRecord[];
    viewport?: GenericRecord | null;
  }> {
    if (targetKind === 'self') {
      const detail = await this.agentDefinitionService.findDetailById(
        context.currentAgentDefinitionId,
      );

      return {
        kind: 'agent',
        id: detail.id,
        label: detail.name,
        version: detail.version,
        publishedVersionId: detail.publishedVersionId,
        nodes: cloneJsonArray(detail.nodes),
        edges: cloneJsonArray(detail.edges),
        viewport: cloneJsonRecord(detail.viewport),
      };
    }

    if (!targetId) {
      throw new Error('targetKind 为 agent/workflow 时必须提供 targetId');
    }

    if (targetKind === 'agent') {
      this.permissionPolicy.requireExternalEditing(context);
      const detail = await this.agentDefinitionService.findDetailById(targetId);
      return {
        kind: 'agent',
        id: detail.id,
        label: detail.name,
        version: detail.version,
        publishedVersionId: detail.publishedVersionId,
        nodes: cloneJsonArray(detail.nodes),
        edges: cloneJsonArray(detail.edges),
        viewport: cloneJsonRecord(detail.viewport),
      };
    }

    this.permissionPolicy.requireExternalEditing(context);
    const detail =
      await this.workflowVersionService.findDefinitionDetailById(targetId);
    return {
      kind: 'workflow',
      id: detail.id,
      label: detail.name,
      version: detail.version,
      publishedVersionId: detail.publishedVersionId,
      nodes: cloneJsonArray(detail.nodes),
      edges: cloneJsonArray(detail.edges),
      viewport: cloneJsonRecord(detail.viewport),
    };
  }

}
