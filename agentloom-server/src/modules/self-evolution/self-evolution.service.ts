import { Inject, Injectable, Logger } from '@nestjs/common';
import { jsonSchema, tool, type ToolSet } from 'ai';
import { eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import type { AgentSession } from '../agent/types/agent-session.types';
import type { SessionToolProvider } from '../agent/ports/agent-runtime.port';
import type {
  ToolPermissionRequest,
  ToolCallStatus,
} from '../agent/types/tool-call-event.types';
import {
  AgentDefinitionService,
  type ApplyAgentCanvasSnapshotOptions,
} from '../agent-definition/agent-definition.service';
import { LlmProviderService } from '../llm/llm-provider.service';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { SkillService, type SkillUploadFile } from '../skill/skill.service';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type {
  SelfEvolutionCategory,
  SelfEvolutionGraphProposal,
  SelfEvolutionPermissionRequest,
  SelfEvolutionRemoteToolOutcome,
  SelfEvolutionRiskLevel,
  SelfEvolutionSessionContext,
  SelfEvolutionTargetKind,
  SelfEvolutionToolName,
  SelfEvolutionToolResult,
} from './self-evolution.types';
import {
  SELF_EVOLUTION_CATEGORY_VALUES,
  SELF_EVOLUTION_DOMAIN,
  SELF_EVOLUTION_TOOL_NAMES,
} from './self-evolution.types';
import { SelfEvolutionPermissionService } from './self-evolution-permission.service';

type GenericRecord = Record<string, unknown>;

const QUERY_STATE_SCHEMA = {
  type: 'object',
  properties: {
    scope: {
      type: 'string',
      enum: ['self', 'agent', 'workflow'],
      description: '查询自身状态、外部 Agent 状态或外部 Workflow 状态。',
    },
    targetId: {
      type: 'string',
      description: '查询外部 Agent / Workflow 时的目标 ID。',
    },
  },
  additionalProperties: false,
} as const;

const QUERY_RESOURCE_POOL_SCHEMA = {
  type: 'object',
  properties: {
    resourceType: {
      type: 'string',
      enum: [
        'skill',
        'mcp_server',
        'mcp_tool',
        'model',
        'agent',
        'workflow',
        'workspace',
      ],
      description: '限定查询的资源类型；省略时返回所有资源分组。',
    },
    search: {
      type: 'string',
      description: '可选搜索关键词。',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: '单组返回数量上限，默认 20。',
    },
  },
  additionalProperties: false,
} as const;

const NODE_OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['add', 'update', 'remove'],
    },
    nodeId: { type: 'string' },
    node: {
      type: 'object',
      additionalProperties: true,
    },
    patch: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['op'],
  additionalProperties: false,
} as const;

const EDGE_OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['add', 'update', 'remove'],
    },
    edgeId: { type: 'string' },
    edge: {
      type: 'object',
      additionalProperties: true,
    },
    patch: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['op'],
  additionalProperties: false,
} as const;

const PROPOSE_CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    targetKind: {
      type: 'string',
      enum: ['self', 'agent', 'workflow'],
      description: '修改自身、外部 Agent、或 Workflow。',
    },
    targetId: {
      type: 'string',
      description: 'targetKind 为 agent/workflow 时的目标 ID。',
    },
    nodeOperations: {
      type: 'array',
      items: NODE_OPERATION_SCHEMA,
    },
    edgeOperations: {
      type: 'array',
      items: EDGE_OPERATION_SCHEMA,
    },
    viewport: {
      type: 'object',
      additionalProperties: true,
    },
    metadataPatch: {
      type: 'object',
      additionalProperties: true,
      description: '允许修改名称/描述/icon 等顶层元数据。',
    },
    publishTarget: {
      type: 'boolean',
      description: '修改完成后是否立即发布目标编排。',
    },
  },
  required: ['targetKind'],
  additionalProperties: false,
} as const;

const APPLY_CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    proposal: {
      type: 'object',
      additionalProperties: true,
      description: '必须传入 propose_change 返回的 proposal。',
    },
  },
  required: ['proposal'],
  additionalProperties: false,
} as const;

const CREATE_RESOURCE_SCHEMA = {
  type: 'object',
  properties: {
    resourceType: {
      type: 'string',
      enum: ['skill', 'workspace', 'agent', 'workflow', 'mcp', 'model'],
      description: '要创建的资源类型。',
    },
    spec: {
      type: 'object',
      additionalProperties: true,
      description: '资源创建参数。字段取决于 resourceType。',
    },
  },
  required: ['resourceType', 'spec'],
  additionalProperties: false,
} as const;

@Injectable()
export class SelfEvolutionService {
  private readonly logger = new Logger(SelfEvolutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly skillService: SkillService,
    private readonly llmService: LlmService,
    private readonly llmProviderService: LlmProviderService,
    private readonly mcpService: McpService,
    private readonly workspaceService: WorkspaceService,
    private readonly workflowVersionService: WorkflowVersionService,
    private readonly permissionService: SelfEvolutionPermissionService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  supportsTool(toolName: string): toolName is SelfEvolutionToolName {
    return (SELF_EVOLUTION_TOOL_NAMES as readonly string[]).includes(toolName);
  }

  createSessionToolProvider(
    context: SelfEvolutionSessionContext,
  ): SessionToolProvider {
    return async (): Promise<ToolSet> => ({
      query_state: tool({
        description:
          '查询当前 Agent 自身编排状态，或在权限允许时查询外部 Agent / Workflow 状态。',
        inputSchema: jsonSchema(QUERY_STATE_SCHEMA as never),
        execute: async (input) =>
          this.executeReadTool('query_state', context, input as GenericRecord),
      }),
      query_resource_pool: tool({
        description:
          '查询当前租户已存在的技能、MCP、模型、Agent、Workflow、Workspace 资源池。',
        inputSchema: jsonSchema(QUERY_RESOURCE_POOL_SCHEMA as never),
        execute: async (input) =>
          this.executeReadTool(
            'query_resource_pool',
            context,
            input as GenericRecord,
          ),
      }),
      propose_change: tool({
        description:
          '基于节点/连线级操作生成自进化编排变更提案，并返回 diff/风险/是否需要审批。',
        inputSchema: jsonSchema(PROPOSE_CHANGE_SCHEMA as never),
        execute: async (input) =>
          this.executeReadTool(
            'propose_change',
            context,
            input as GenericRecord,
          ),
      }),
      apply_change: tool({
        description:
          '应用 propose_change 返回的 proposal。已发布的自身 Agent 会直接生成新 published version；结果里的 publishedVersionNumber 才是用户可见发布版号，detail.version 仅是草稿修订号。',
        inputSchema: jsonSchema(APPLY_CHANGE_SCHEMA as never),
        execute: async (input) =>
          this.executeMutationDirect(
            'apply_change',
            context,
            input as GenericRecord,
          ),
      }),
      create_resource: tool({
        description:
          '在权限允许时创建新 Skill、MCP、Model、Workspace、Agent、Workflow 资源。',
        inputSchema: jsonSchema(CREATE_RESOURCE_SCHEMA as never),
        execute: async (input) =>
          this.executeMutationDirect(
            'create_resource',
            context,
            input as GenericRecord,
          ),
      }),
    });
  }

  async handleSessionToolPreflight(
    session: AgentSession,
    toolName: SelfEvolutionToolName,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const context = await this.buildSessionContext(session);

    switch (toolName) {
      case 'query_state':
      case 'query_resource_pool':
      case 'propose_change':
        return {
          result: await this.executeReadTool(toolName, context, input),
        };
      case 'apply_change':
        return this.preflightApplyChange(context, toolCallId, input);
      case 'create_resource':
        return this.preflightCreateResource(context, toolCallId, input);
    }
  }

  async handleSessionToolExecute(
    session: AgentSession,
    toolName: SelfEvolutionToolName,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const context = await this.buildSessionContext(session);

    switch (toolName) {
      case 'apply_change':
        return this.executeApplyChangeAfterApproval(context, toolCallId, input);
      case 'create_resource':
        return this.executeCreateResourceAfterApproval(
          context,
          toolCallId,
          input,
        );
      case 'query_state':
      case 'query_resource_pool':
      case 'propose_change':
        return {
          result: await this.executeReadTool(toolName, context, input),
        };
    }
  }

  async restartConversationToLatestVersion(
    conversationId: string,
    tenantId: string,
    userId: string,
  ): Promise<{ data: { conversationId: string } }> {
    const [sourceConversation] = await this.tenantDb
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!sourceConversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const agentDetail = await this.agentDefinitionService.findDetailById(
      sourceConversation.agentDefinitionId,
    );
    if (!agentDetail.publishedVersionId) {
      throw new Error('当前 Agent 没有可切换的已发布版本');
    }

    const sourceMessages = await this.tenantDb
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(agentMessages.createdAt, agentMessages.id);

    const [newConversation] = await this.tenantDb
      .insert(agentConversations)
      .values({
        agentDefinitionId: sourceConversation.agentDefinitionId,
        tenantId,
        title: sourceConversation.title,
        metadata: {
          restartFromConversationId: conversationId,
          inheritedMessageHistory: true,
        },
        createdBy: userId,
      })
      .returning();

    const messageIdMap = new Map<string, string>();
    let lastProcessedMessageId: string | undefined;
    let lastAssistantMessageId: string | undefined;
    for (const sourceMessage of sourceMessages) {
      const [insertedMessage] = await this.tenantDb
        .insert(agentMessages)
        .values({
          conversationId: newConversation.id,
          tenantId,
          role: sourceMessage.role,
          contentType: sourceMessage.contentType,
          content: sourceMessage.content,
          toolCalls: sourceMessage.toolCalls,
          toolResults: sourceMessage.toolResults,
          metadata: sourceMessage.metadata,
          parentMessageId: sourceMessage.parentMessageId
            ? (messageIdMap.get(sourceMessage.parentMessageId) ?? null)
            : null,
          createdAt: sourceMessage.createdAt,
        })
        .returning({ id: agentMessages.id });

      messageIdMap.set(sourceMessage.id, insertedMessage.id);

      if (sourceMessage.role === 'user') {
        lastProcessedMessageId = insertedMessage.id;
      }

      if (sourceMessage.role === 'assistant') {
        lastAssistantMessageId = insertedMessage.id;
      }
    }

    const restartMetadata = this.buildRestartConversationMetadata(
      this.readRecord(newConversation.metadata) ?? {},
      {
        restartFromConversationId: conversationId,
        targetPublishedVersionId: agentDetail.publishedVersionId,
        lastProcessedMessageId,
        lastAssistantMessageId,
      },
    );

    await this.tenantDb
      .update(agentConversations)
      .set({
        metadata: restartMetadata,
        updatedAt: new Date(),
      })
      .where(eq(agentConversations.id, newConversation.id));

    await this.permissionService.cloneRememberedPolicies(
      conversationId,
      newConversation.id,
    );

    return {
      data: {
        conversationId: newConversation.id,
      },
    };
  }

  private async executeReadTool(
    toolName: Extract<
      SelfEvolutionToolName,
      'query_state' | 'query_resource_pool' | 'propose_change'
    >,
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    try {
      switch (toolName) {
        case 'query_state':
          return {
            success: true,
            data: await this.queryState(context, input),
          };
        case 'query_resource_pool':
          return {
            success: true,
            data: await this.queryResourcePool(context, input),
          };
        case 'propose_change':
          return {
            success: true,
            data: await this.proposeChange(context, input),
          };
      }
    } catch (error) {
      return this.toFailureResult(error);
    }
  }

  private async executeMutationDirect(
    toolName: Extract<
      SelfEvolutionToolName,
      'apply_change' | 'create_resource'
    >,
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    try {
      switch (toolName) {
        case 'apply_change':
          return await this.applyChange(context, input);
        case 'create_resource':
          return await this.createResource(context, input);
      }
    } catch (error) {
      return this.toFailureResult(error);
    }
  }

  private async preflightApplyChange(
    context: SelfEvolutionSessionContext,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const proposal = this.readProposal(input.proposal);
    if (!proposal) {
      return {
        result: this.toFailureResult('proposal 缺失或格式非法'),
      };
    }

    const remembered = await this.permissionService.getRememberedDecision(
      context.conversationId,
      proposal.category,
    );

    if (!proposal.requiresConfirmation || remembered === 'approve') {
      return {
        result: await this.applyChange(context, input),
      };
    }

    const permissionRequest = this.buildPermissionRequest(context, proposal);
    if (remembered === 'deny') {
      return this.toDeniedOutcome(
        permissionRequest,
        `本会话已记住对 ${proposal.category} 的拒绝策略`,
      );
    }

    await this.permissionService.registerPendingRequest({
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      toolCallId,
      toolName: 'apply_change',
      permissionRequest,
    });

    return {
      outcome: 'awaiting_permission',
      permissionRequest,
    };
  }

  private async executeApplyChangeAfterApproval(
    context: SelfEvolutionSessionContext,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const proposal = this.readProposal(input.proposal);
    if (!proposal) {
      return {
        result: this.toFailureResult('proposal 缺失或格式非法'),
      };
    }

    const permissionRequest = this.buildPermissionRequest(context, proposal);
    const action = await this.permissionService.waitForResolution(
      context.sessionId,
      toolCallId,
    );

    if (action !== 'approve') {
      return this.toDeniedOutcome(
        permissionRequest,
        '用户拒绝了本次自进化变更',
      );
    }

    return {
      result: await this.applyChange(context, input),
    };
  }

  private async preflightCreateResource(
    context: SelfEvolutionSessionContext,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const permissionProfile = this.buildCreateResourcePermissionProfile(
      context,
      input,
    );

    const remembered = await this.permissionService.getRememberedDecision(
      context.conversationId,
      permissionProfile.category,
    );

    if (remembered === 'approve') {
      return {
        result: await this.createResource(context, input),
      };
    }

    if (remembered === 'deny') {
      return this.toDeniedOutcome(
        permissionProfile.request,
        `本会话已记住对 ${permissionProfile.category} 的拒绝策略`,
      );
    }

    await this.permissionService.registerPendingRequest({
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      toolCallId,
      toolName: 'create_resource',
      permissionRequest: permissionProfile.request,
    });

    return {
      outcome: 'awaiting_permission',
      permissionRequest: permissionProfile.request,
    };
  }

  private async executeCreateResourceAfterApproval(
    context: SelfEvolutionSessionContext,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const permissionProfile = this.buildCreateResourcePermissionProfile(
      context,
      input,
    );
    const action = await this.permissionService.waitForResolution(
      context.sessionId,
      toolCallId,
    );

    if (action !== 'approve') {
      return this.toDeniedOutcome(
        permissionProfile.request,
        '用户拒绝了本次资源创建',
      );
    }

    return {
      result: await this.createResource(context, input),
    };
  }

  private async queryState(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<GenericRecord> {
    const scope = this.readString(input.scope) ?? 'self';

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

    const targetId = this.readString(input.targetId);
    if (!targetId) {
      throw new Error('查询外部 Agent / Workflow 时必须提供 targetId');
    }
    this.ensureExternalEditingEnabled(context);

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

  private async queryResourcePool(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<GenericRecord> {
    const limit = this.readPositiveInt(input.limit, 20, 100);
    const search = this.readString(input.search);
    const resourceType = this.readString(input.resourceType);

    const shouldInclude = (type: string) =>
      !resourceType || resourceType === type;

    const result: GenericRecord = {};

    if (shouldInclude('skill')) {
      const skills = await this.skillService.findAll({
        page: 1,
        pageSize: limit,
        search,
        status: 'active',
      } as never);
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
      const configs = await this.mcpService.findAllConfigs(context.tenantId, {
        page: 1,
        pageSize: limit,
        ...(search ? { search } : {}),
      } as never);
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
        .filter((tool) => !search || tool.name.includes(search))
        .slice(0, limit)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          mcpServerConfigId: tool.mcpServerConfigId,
          isActive: tool.isActive,
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
      const agents = await this.agentDefinitionService.findAll({
        page: 1,
        pageSize: limit,
        ...(search ? { search } : {}),
      } as never);
      result.agents = agents.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        publishedVersionId: agent.publishedVersionId,
      }));
    }

    if (shouldInclude('workflow')) {
      const workflows = await this.workflowVersionService.findAllDefinitions({
        page: 1,
        pageSize: limit,
        ...(search ? { search } : {}),
      } as never);
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

  private async proposeChange(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<GenericRecord> {
    const target = await this.loadGraphTarget(
      context,
      this.readTargetKind(input.targetKind),
      this.readString(input.targetId),
    );
    const nodeOperations = this.readNodeOperations(input.nodeOperations);
    const edgeOperations = this.readEdgeOperations(input.edgeOperations);
    const viewport = this.readRecord(input.viewport);
    const metadataPatch = this.readRecord(input.metadataPatch);

    const nextNodes = this.applyNodeOperations(target.nodes, nodeOperations);
    const nextEdges = this.applyEdgeOperations(target.edges, edgeOperations);
    const nextViewport = viewport ?? target.viewport ?? null;

    const permissionProfile = this.determineGraphChangePermissionProfile({
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

    const diffPreview = this.buildDiffPreview({
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

  private async applyChange(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    try {
      const proposal = this.readProposal(input.proposal);
      if (!proposal) {
        throw new Error('proposal 缺失或格式非法');
      }

      const target = await this.loadGraphTarget(
        context,
        proposal.targetKind,
        proposal.targetId,
      );

      const nextNodes = this.applyNodeOperations(
        target.nodes,
        proposal.nodeOperations ?? [],
      );
      const nextEdges = this.applyEdgeOperations(
        target.edges,
        proposal.edgeOperations ?? [],
      );

      if (target.kind === 'agent') {
        const agentOptions: ApplyAgentCanvasSnapshotOptions = {
          canvasNodes: nextNodes as never,
          canvasEdges: nextEdges as never,
          expectedVersion: proposal.baseVersion,
          publishAfterSave: proposal.publishTarget,
          ...(proposal.viewport
            ? { canvasViewport: proposal.viewport as never }
            : {}),
        };

        const result = await this.agentDefinitionService.applyCanvasSnapshot(
          target.id,
          agentOptions,
          context.actorUserId,
        );
        const detailRecord = this.readRecord(result.detail);
        const detailVersion = this.readOptionalNumber(detailRecord?.version);

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
              this.hasNewPublishedVersion(
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
          {
            version: workflowVersion,
            nodes: nextNodes,
            edges: nextEdges,
            ...(proposal.viewport ? { viewport: proposal.viewport } : {}),
            ...(proposal.metadataPatch ? proposal.metadataPatch : {}),
          } as never,
        );

      const published = proposal.publishTarget
        ? await this.workflowVersionService.publish(
            target.id,
            {} as never,
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
      return this.toFailureResult(error);
    }
  }

  private async createResource(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    try {
      const resourceType = this.readString(input.resourceType);
      const spec = this.readRecord(input.spec);

      if (!resourceType || !spec) {
        throw new Error('resourceType 与 spec 都是必填项');
      }

      switch (resourceType) {
        case 'skill': {
          this.ensureResourceManagementEnabled(context);
          const files = this.buildSkillFiles(spec.files, spec.content);
          const skill = await this.skillService.create(
            context.tenantId,
            context.actorUserId,
            {
              name: this.readRequiredString(spec.name, 'spec.name'),
              description: this.readString(spec.description) ?? '',
              ...(this.readString(spec.content)
                ? { content: this.readString(spec.content) }
                : {}),
            } as never,
            files,
          );
          return { success: true, data: { resourceType, resource: skill } };
        }
        case 'workspace': {
          this.ensureResourceManagementEnabled(context);
          const organizationId =
            await this.workspaceService.resolveOrganizationId(context.tenantId);
          const workspace = await this.workspaceService.createEmpty(
            context.tenantId,
            organizationId,
            context.actorUserId,
            this.readRequiredString(spec.name, 'spec.name'),
            this.readString(spec.description),
          );
          return { success: true, data: { resourceType, resource: workspace } };
        }
        case 'agent': {
          this.ensureExternalEditingEnabled(context);
          const agent = await this.agentDefinitionService.create(
            {
              name: this.readRequiredString(spec.name, 'spec.name'),
              ...(this.readString(spec.description)
                ? { description: this.readString(spec.description) }
                : {}),
              ...(this.readString(spec.icon)
                ? { icon: this.readString(spec.icon) }
                : {}),
            } as never,
            context.actorUserId,
          );
          return { success: true, data: { resourceType, resource: agent } };
        }
        case 'workflow': {
          this.ensureExternalEditingEnabled(context);
          const workflow = await this.workflowVersionService.create(
            context.tenantId,
            context.actorUserId,
            {
              name: this.readRequiredString(spec.name, 'spec.name'),
              ...(this.readString(spec.description)
                ? { description: this.readString(spec.description) }
                : {}),
              ...(this.readString(spec.icon)
                ? { icon: this.readString(spec.icon) }
                : {}),
            } as never,
          );
          return { success: true, data: { resourceType, resource: workflow } };
        }
        case 'mcp': {
          this.ensureResourceManagementEnabled(context);
          const mcp = await this.mcpService.importTools(
            {
              serverName: this.readRequiredString(
                spec.serverName,
                'spec.serverName',
              ),
              ...(this.readString(spec.serverDescription)
                ? { serverDescription: this.readString(spec.serverDescription) }
                : {}),
              connection: this.readRequiredRecord(
                spec.connection,
                'spec.connection',
              ),
              toolNames: this.readRequiredStringArray(
                spec.toolNames,
                'spec.toolNames',
              ),
              conflictStrategy:
                this.readString(spec.conflictStrategy) === 'overwrite'
                  ? 'overwrite'
                  : 'skip',
            } as never,
            context.actorUserId,
            context.tenantId,
          );
          return { success: true, data: { resourceType, resource: mcp } };
        }
        case 'model': {
          this.ensureResourceManagementEnabled(context);
          const providerSpec = this.readRecord(spec.provider);
          let providerId = this.readString(spec.providerId);
          if (!providerId && providerSpec) {
            const provider = await this.llmProviderService.create(
              {
                name: this.readRequiredString(
                  providerSpec.name,
                  'spec.provider.name',
                ),
                baseUrl: this.readRequiredString(
                  providerSpec.baseUrl,
                  'spec.provider.baseUrl',
                ),
                ...(this.readString(providerSpec.slug)
                  ? { slug: this.readString(providerSpec.slug) }
                  : {}),
                ...(this.readString(providerSpec.apiProtocol)
                  ? { apiProtocol: this.readString(providerSpec.apiProtocol) }
                  : {}),
                ...(this.readString(providerSpec.apiKey)
                  ? { apiKey: this.readString(providerSpec.apiKey) }
                  : {}),
                ...(this.readString(providerSpec.iconUrl)
                  ? { iconUrl: this.readString(providerSpec.iconUrl) }
                  : {}),
              } as never,
              context.tenantId,
              context.actorUserId,
            );
            providerId = provider.id;
          }

          if (!providerId) {
            throw new Error('创建模型时必须提供 providerId 或 provider 配置');
          }

          const model = await this.llmService.create(
            {
              name: this.readRequiredString(spec.name, 'spec.name'),
              providerId,
              modelId: this.readRequiredString(spec.modelId, 'spec.modelId'),
              modelType:
                this.readString(spec.modelType) === 'embedding'
                  ? 'embedding'
                  : 'chat',
              ...(this.readRecord(spec.parameters)
                ? { parameters: this.readRecord(spec.parameters) }
                : {}),
              ...(this.readRecord(spec.capabilities)
                ? { capabilities: this.readRecord(spec.capabilities) }
                : {}),
              ...(this.readOptionalNumber(spec.contextWindow)
                ? { contextWindow: this.readOptionalNumber(spec.contextWindow) }
                : {}),
              ...(this.readOptionalNumber(spec.maxOutputTokens)
                ? {
                    maxOutputTokens: this.readOptionalNumber(
                      spec.maxOutputTokens,
                    ),
                  }
                : {}),
              ...(this.readOptionalNumber(spec.timeoutMs)
                ? { timeoutMs: this.readOptionalNumber(spec.timeoutMs) }
                : {}),
            } as never,
            context.tenantId,
            context.actorUserId,
          );

          return { success: true, data: { resourceType, resource: model } };
        }
        default:
          throw new Error(`不支持的 resourceType: ${resourceType}`);
      }
    } catch (error) {
      return this.toFailureResult(error);
    }
  }

  private async buildSessionContext(
    session: AgentSession,
  ): Promise<SelfEvolutionSessionContext> {
    const conversationId =
      this.readString(
        (session.context.workflowState as GenericRecord | undefined)
          ?.agentConversationId,
      ) ?? this.readString(session.context.serverSandbox?.agentConversationId);

    if (!conversationId) {
      throw new Error('当前会话不绑定 conversation，无法执行自进化操作');
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      throw new Error(`Session ${session.id} 缺少 tenantId`);
    }

    const [conversation] = await this.tenantDb
      .select({
        id: agentConversations.id,
        createdBy: agentConversations.createdBy,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} 不存在`);
    }

    const agentDetail = await this.agentDefinitionService.findDetailById(
      session.agentId,
    );
    const selfEvolutionPolicy = session.runtimeConfig?.selfEvolutionPolicy ?? {
      enabled: false,
      resourceManagement: false,
      externalEditing: false,
      sandboxManagement: false,
    };

    if (!selfEvolutionPolicy.enabled) {
      throw new Error('当前 Agent 未启用自进化能力');
    }

    return {
      sessionId: session.id,
      conversationId,
      tenantId,
      actorUserId: conversation.createdBy,
      currentAgentDefinitionId: session.agentId,
      currentAgentName: agentDetail.name,
      selfEvolutionPolicy,
      runtimeConfig: session.runtimeConfig,
    };
  }

  private async loadGraphTarget(
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
        nodes: this.cloneJsonArray(detail.nodes),
        edges: this.cloneJsonArray(detail.edges),
        viewport: this.cloneJsonRecord(detail.viewport),
      };
    }

    if (!targetId) {
      throw new Error('targetKind 为 agent/workflow 时必须提供 targetId');
    }

    if (targetKind === 'agent') {
      this.ensureExternalEditingEnabled(context);
      const detail = await this.agentDefinitionService.findDetailById(targetId);
      return {
        kind: 'agent',
        id: detail.id,
        label: detail.name,
        version: detail.version,
        publishedVersionId: detail.publishedVersionId,
        nodes: this.cloneJsonArray(detail.nodes),
        edges: this.cloneJsonArray(detail.edges),
        viewport: this.cloneJsonRecord(detail.viewport),
      };
    }

    this.ensureExternalEditingEnabled(context);
    const detail =
      await this.workflowVersionService.findDefinitionDetailById(targetId);
    return {
      kind: 'workflow',
      id: detail.id,
      label: detail.name,
      version: detail.version,
      publishedVersionId: detail.publishedVersionId,
      nodes: this.cloneJsonArray(detail.nodes),
      edges: this.cloneJsonArray(detail.edges),
      viewport: this.cloneJsonRecord(detail.viewport),
    };
  }

  private determineGraphChangePermissionProfile(params: {
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
      this.ensureExternalEditingEnabled(params.context);
      return {
        category: 'workflow_edit',
        riskLevel: 'high',
        requiresConfirmation: true,
      };
    }

    const isSelfAgent =
      params.target.id === params.context.currentAgentDefinitionId;

    if (!isSelfAgent) {
      this.ensureExternalEditingEnabled(params.context);
      return {
        category: 'agent_external_edit',
        riskLevel: 'high',
        requiresConfirmation: true,
      };
    }

    const touchedNodeTypes = new Set<string>();
    for (const operation of params.nodeOperations) {
      const nodeType =
        this.readNodeType(operation.node) ??
        this.readNodeType(operation.patch) ??
        this.readNodeType(
          this.findNodeById(params.currentNodes, operation.nodeId) ??
            this.findNodeById(params.nextNodes, operation.nodeId),
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
        this.findEdgeById(params.currentEdges, operation.edgeId) ??
        this.findEdgeById(params.nextEdges, operation.edgeId);
      if (!edge || typeof edge !== 'object') {
        return false;
      }
      return (
        this.readString((edge as GenericRecord).sourceHandle) ===
          'volume-out' ||
        this.readString((edge as GenericRecord).targetHandle) === 'volume-in'
      );
    });

    if (touchesSandbox) {
      this.ensureSandboxManagementEnabled(params.context);
      return {
        category: 'sandbox_spec_adjustment',
        riskLevel: 'high',
        requiresConfirmation: true,
      };
    }

    if (touchesWorkspace || touchesWorkspaceBinding) {
      this.ensureSandboxManagementEnabled(params.context);
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

  private buildCreateResourcePermissionProfile(
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): {
    category: SelfEvolutionCategory;
    request: SelfEvolutionPermissionRequest;
  } {
    const resourceType = this.readRequiredString(
      input.resourceType,
      'resourceType',
    );
    const spec = this.readRequiredRecord(input.spec, 'spec');
    const sourceLabel = context.currentAgentName;

    switch (resourceType) {
      case 'skill':
        this.ensureResourceManagementEnabled(context);
        return {
          category: 'skill_resource_management',
          request: {
            description: `主人授权后，Agent 将创建新的 Skill 资源。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'skill_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'skill',
            targetLabel: this.readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的 Skill 资源，并立即返回新资源 ID。',
            denyEffect: '不会创建 Skill，也不会修改现有资源。',
            diffPreview: {
              resourceType,
              name: this.readString(spec.name),
              fileNames: Object.keys(this.readRecord(spec.files) ?? {}),
            },
            rememberable: true,
            resourcePaths: ['resource:skill'],
          },
        };
      case 'mcp':
        this.ensureResourceManagementEnabled(context);
        return {
          category: 'mcp_resource_management',
          request: {
            description: `主人授权后，Agent 将导入新的 MCP 服务器及工具定义。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'mcp_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'mcp',
            targetLabel: this.readRequiredString(
              spec.serverName,
              'spec.serverName',
            ),
            approveEffect: '创建 MCP 配置并导入选定工具。',
            denyEffect: '不会连接或导入新的 MCP 资源。',
            diffPreview: {
              resourceType,
              toolNames: this.readStringArray(spec.toolNames),
              connection: this.readRecord(spec.connection),
            },
            rememberable: true,
            resourcePaths: ['resource:mcp'],
          },
        };
      case 'model':
        this.ensureResourceManagementEnabled(context);
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
              this.readString(spec.name) ??
              this.readString(this.readRecord(spec.provider)?.name) ??
              '新模型',
            approveEffect:
              '创建 Provider（如有）与 Model Config，并返回新模型 ID。',
            denyEffect: '不会创建新的模型相关资源。',
            diffPreview: {
              resourceType,
              providerId: this.readString(spec.providerId),
              provider: this.readRecord(spec.provider),
              modelId: this.readString(spec.modelId),
            },
            rememberable: true,
            resourcePaths: ['resource:model'],
          },
        };
      case 'workspace':
        this.ensureResourceManagementEnabled(context);
        return {
          category: 'workspace_resource_management',
          request: {
            description: `主人授权后，Agent 将创建新的 Workspace 资源。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'workspace_resource_management',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'workspace',
            targetLabel: this.readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的空工作区快照。',
            denyEffect: '不会创建新的工作区资源。',
            diffPreview: {
              resourceType,
              name: this.readString(spec.name),
              description: this.readString(spec.description),
            },
            rememberable: true,
            resourcePaths: ['resource:workspace'],
          },
        };
      case 'agent':
        this.ensureExternalEditingEnabled(context);
        return {
          category: 'agent_external_edit',
          request: {
            description: `主人授权后，Agent 将创建新的外部 Agent 编排。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'agent_external_edit',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'agent',
            targetLabel: this.readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的 Agent 定义。',
            denyEffect: '不会创建新的 Agent。',
            diffPreview: {
              resourceType,
              name: this.readString(spec.name),
              description: this.readString(spec.description),
            },
            rememberable: true,
            resourcePaths: ['resource:agent'],
          },
        };
      case 'workflow':
        this.ensureExternalEditingEnabled(context);
        return {
          category: 'workflow_edit',
          request: {
            description: `主人授权后，Agent 将创建新的外部 Workflow 编排。`,
            domain: SELF_EVOLUTION_DOMAIN,
            category: 'workflow_edit',
            riskLevel: 'high',
            sourceLabel,
            targetType: 'workflow',
            targetLabel: this.readRequiredString(spec.name, 'spec.name'),
            approveEffect: '创建新的 Workflow 定义。',
            denyEffect: '不会创建新的 Workflow。',
            diffPreview: {
              resourceType,
              name: this.readString(spec.name),
              description: this.readString(spec.description),
            },
            rememberable: true,
            resourcePaths: ['resource:workflow'],
          },
        };
      default:
        throw new Error(`不支持的 resourceType: ${resourceType}`);
    }
  }

  private buildPermissionRequest(
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

  private buildDiffPreview(params: {
    targetLabel: string;
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
    nextViewport?: GenericRecord | null;
    publishTarget: boolean;
  }): Record<string, unknown> {
    const addedNodes = params.nodeOperations
      .filter((operation) => operation.op === 'add')
      .map((operation) => ({
        id: this.readString(operation.node?.id) ?? 'unknown-node',
        nodeType: this.readNodeType(operation.node) ?? 'unknown',
      }));
    const updatedNodes = params.nodeOperations
      .filter((operation) => operation.op === 'update')
      .map((operation) => ({
        id: operation.nodeId ?? 'unknown-node',
      }));
    const removedNodes = params.nodeOperations
      .filter((operation) => operation.op === 'remove')
      .map((operation) => ({
        id: operation.nodeId ?? 'unknown-node',
      }));

    const addedEdges = params.edgeOperations
      .filter((operation) => operation.op === 'add')
      .map((operation) => ({
        id: this.readString(operation.edge?.id) ?? 'unknown-edge',
      }));
    const updatedEdges = params.edgeOperations
      .filter((operation) => operation.op === 'update')
      .map((operation) => ({
        id: operation.edgeId ?? 'unknown-edge',
      }));
    const removedEdges = params.edgeOperations
      .filter((operation) => operation.op === 'remove')
      .map((operation) => ({
        id: operation.edgeId ?? 'unknown-edge',
      }));

    return {
      summary: [
        `${params.targetLabel}：节点 +${addedNodes.length}/~${updatedNodes.length}/-${removedNodes.length}`,
        `连线 +${addedEdges.length}/~${updatedEdges.length}/-${removedEdges.length}`,
        params.publishTarget ? '完成后立即发布' : '仅更新目标编排',
      ].join('，'),
      addedNodes,
      updatedNodes,
      removedNodes,
      addedEdges,
      updatedEdges,
      removedEdges,
      nextNodeCount: params.nextNodes.length,
      nextEdgeCount: params.nextEdges.length,
      ...(params.nextViewport ? { viewport: params.nextViewport } : {}),
    };
  }

  private applyNodeOperations(
    nodes: GenericRecord[],
    operations: Array<{
      op: string;
      nodeId?: string;
      node?: GenericRecord;
      patch?: GenericRecord;
    }>,
  ): GenericRecord[] {
    let nextNodes = this.cloneJsonArray(nodes);

    for (const operation of operations) {
      switch (operation.op) {
        case 'add': {
          const node = operation.node;
          const nodeId = this.readString(node?.id);
          if (!node || !nodeId) {
            throw new Error('新增节点时必须提供 node 且包含合法 id');
          }
          if (nextNodes.some((item) => this.readString(item.id) === nodeId)) {
            throw new Error(`节点 ${nodeId} 已存在，不能重复新增`);
          }
          nextNodes.push(this.cloneJsonRecord(node));
          break;
        }
        case 'update': {
          const nodeId = operation.nodeId;
          if (!nodeId || !operation.patch) {
            throw new Error('更新节点时必须提供 nodeId 与 patch');
          }
          const index = nextNodes.findIndex(
            (item) => this.readString(item.id) === nodeId,
          );
          if (index < 0) {
            throw new Error(`待更新节点不存在: ${nodeId}`);
          }
          nextNodes[index] = this.mergeRecords(
            nextNodes[index],
            operation.patch,
          );
          break;
        }
        case 'remove': {
          const nodeId = operation.nodeId;
          if (!nodeId) {
            throw new Error('删除节点时必须提供 nodeId');
          }
          nextNodes = nextNodes.filter(
            (item) => this.readString(item.id) !== nodeId,
          );
          break;
        }
        default:
          throw new Error(`不支持的节点操作: ${operation.op}`);
      }
    }

    return nextNodes;
  }

  private applyEdgeOperations(
    edges: GenericRecord[],
    operations: Array<{
      op: string;
      edgeId?: string;
      edge?: GenericRecord;
      patch?: GenericRecord;
    }>,
  ): GenericRecord[] {
    let nextEdges = this.cloneJsonArray(edges);

    for (const operation of operations) {
      switch (operation.op) {
        case 'add': {
          const edge = operation.edge;
          const edgeId = this.readString(edge?.id);
          if (!edge || !edgeId) {
            throw new Error('新增连线时必须提供 edge 且包含合法 id');
          }
          if (nextEdges.some((item) => this.readString(item.id) === edgeId)) {
            throw new Error(`连线 ${edgeId} 已存在，不能重复新增`);
          }
          nextEdges.push(this.cloneJsonRecord(edge));
          break;
        }
        case 'update': {
          const edgeId = operation.edgeId;
          if (!edgeId || !operation.patch) {
            throw new Error('更新连线时必须提供 edgeId 与 patch');
          }
          const index = nextEdges.findIndex(
            (item) => this.readString(item.id) === edgeId,
          );
          if (index < 0) {
            throw new Error(`待更新连线不存在: ${edgeId}`);
          }
          nextEdges[index] = this.mergeRecords(
            nextEdges[index],
            operation.patch,
          );
          break;
        }
        case 'remove': {
          const edgeId = operation.edgeId;
          if (!edgeId) {
            throw new Error('删除连线时必须提供 edgeId');
          }
          nextEdges = nextEdges.filter(
            (item) => this.readString(item.id) !== edgeId,
          );
          break;
        }
        default:
          throw new Error(`不支持的连线操作: ${operation.op}`);
      }
    }

    return nextEdges;
  }

  private toFailureResult(error: unknown): SelfEvolutionToolResult {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  private toDeniedOutcome(
    permissionRequest: ToolPermissionRequest,
    message: string,
  ): SelfEvolutionRemoteToolOutcome {
    return {
      outcome: 'denied',
      permissionRequest,
      result: {
        __agentloomToolStatus: 'denied' satisfies ToolCallStatus,
        permissionRequest,
        payload: {
          success: false,
          data: {
            denied: true,
          },
          error: message,
        },
      },
    };
  }

  private readTargetKind(value: unknown): SelfEvolutionTargetKind {
    switch (value) {
      case 'self':
      case 'agent':
      case 'workflow':
        return value;
      default:
        throw new Error('targetKind 必须是 self / agent / workflow');
    }
  }

  private readProposal(value: unknown): SelfEvolutionGraphProposal | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as GenericRecord;
    if (record.domain !== SELF_EVOLUTION_DOMAIN) {
      return null;
    }

    const category = this.readString(record.category);
    if (
      !category ||
      !(SELF_EVOLUTION_CATEGORY_VALUES as readonly string[]).includes(category)
    ) {
      return null;
    }

    const targetKind = this.readString(record.targetKind);
    if (
      targetKind !== 'self' &&
      targetKind !== 'agent' &&
      targetKind !== 'workflow'
    ) {
      return null;
    }

    return {
      domain: SELF_EVOLUTION_DOMAIN,
      targetKind,
      targetId: this.readRequiredString(record.targetId, 'proposal.targetId'),
      targetLabel: this.readRequiredString(
        record.targetLabel,
        'proposal.targetLabel',
      ),
      baseVersion: this.readPositiveInt(
        record.baseVersion,
        1,
        Number.MAX_SAFE_INTEGER,
      ),
      publishTarget: Boolean(record.publishTarget),
      nodeOperations: this.readNodeOperations(record.nodeOperations),
      edgeOperations: this.readEdgeOperations(record.edgeOperations),
      ...(this.readRecord(record.viewport)
        ? { viewport: this.readRecord(record.viewport)! }
        : {}),
      ...(this.readRecord(record.metadataPatch)
        ? { metadataPatch: this.readRecord(record.metadataPatch)! }
        : {}),
      summary: this.readRequiredString(record.summary, 'proposal.summary'),
      category: category as SelfEvolutionCategory,
      riskLevel:
        record.riskLevel === 'low' ||
        record.riskLevel === 'medium' ||
        record.riskLevel === 'high'
          ? record.riskLevel
          : 'medium',
      requiresConfirmation: Boolean(record.requiresConfirmation),
      diffPreview: this.readRecord(record.diffPreview) ?? {
        summary: 'No diff preview',
      },
    };
  }

  private readNodeOperations(
    value: unknown,
  ): import('./self-evolution.types').GraphNodeOperation[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => {
      const record = this.readRequiredRecord(entry, 'nodeOperations[*]');
      const op = this.readGraphOperation(record.op, 'nodeOperations[*].op');
      return {
        op,
        ...(this.readString(record.nodeId)
          ? { nodeId: this.readString(record.nodeId) }
          : {}),
        ...(this.readRecord(record.node)
          ? { node: this.readRecord(record.node)! }
          : {}),
        ...(this.readRecord(record.patch)
          ? { patch: this.readRecord(record.patch)! }
          : {}),
      };
    });
  }

  private readEdgeOperations(
    value: unknown,
  ): import('./self-evolution.types').GraphEdgeOperation[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => {
      const record = this.readRequiredRecord(entry, 'edgeOperations[*]');
      const op = this.readGraphOperation(record.op, 'edgeOperations[*].op');
      return {
        op,
        ...(this.readString(record.edgeId)
          ? { edgeId: this.readString(record.edgeId) }
          : {}),
        ...(this.readRecord(record.edge)
          ? { edge: this.readRecord(record.edge)! }
          : {}),
        ...(this.readRecord(record.patch)
          ? { patch: this.readRecord(record.patch)! }
          : {}),
      };
    });
  }

  private readGraphOperation(
    value: unknown,
    fieldName: string,
  ): 'add' | 'update' | 'remove' {
    switch (value) {
      case 'add':
      case 'update':
      case 'remove':
        return value;
      default:
        throw new Error(`${fieldName} 必须是 add / update / remove`);
    }
  }

  private buildSkillFiles(
    filesValue: unknown,
    contentValue: unknown,
  ): SkillUploadFile[] | undefined {
    const files = this.readRecord(filesValue);
    const entries = files
      ? Object.entries(files).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === 'string' &&
            entry[0].length > 0 &&
            typeof entry[1] === 'string',
        )
      : [];

    if (entries.length === 0 && typeof contentValue !== 'string') {
      return undefined;
    }

    const normalizedEntries =
      entries.length > 0
        ? entries
        : [['SKILL.md', String(contentValue ?? '')] as const];

    return normalizedEntries.map(([filename, content]) => ({
      fieldname: 'files',
      filename,
      buffer: Buffer.from(content, 'utf-8'),
      mimetype: 'text/markdown',
    }));
  }

  private mergeRecords(
    base: GenericRecord,
    patch: GenericRecord,
  ): GenericRecord {
    const result: GenericRecord = { ...base };

    for (const [key, value] of Object.entries(patch)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.mergeRecords(
          result[key] as GenericRecord,
          value as GenericRecord,
        );
        continue;
      }

      result[key] = this.cloneJsonValue(value);
    }

    return result;
  }

  private cloneJsonArray(value: unknown): GenericRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => this.cloneJsonRecord(entry));
  }

  private cloneJsonRecord(value: unknown): GenericRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return JSON.parse(JSON.stringify(value)) as GenericRecord;
  }

  private cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private ensureResourceManagementEnabled(
    context: SelfEvolutionSessionContext,
  ): void {
    if (!context.selfEvolutionPolicy.resourceManagement) {
      throw new Error('当前 Agent 未启用资源管理子能力');
    }
  }

  private ensureExternalEditingEnabled(
    context: SelfEvolutionSessionContext,
  ): void {
    if (!context.selfEvolutionPolicy.externalEditing) {
      throw new Error('当前 Agent 未启用外部编辑子能力');
    }
  }

  private ensureSandboxManagementEnabled(
    context: SelfEvolutionSessionContext,
  ): void {
    if (!context.selfEvolutionPolicy.sandboxManagement) {
      throw new Error('当前 Agent 未启用沙箱管理子能力');
    }
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0,
    );
  }

  private readPositiveInt(
    value: unknown,
    fallback: number,
    max: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1) {
      return fallback;
    }

    return Math.min(normalized, max);
  }

  private readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private hasNewPublishedVersion(
    previousPublishedVersionId: string | null | undefined,
    nextPublishedVersionId: string | null | undefined,
  ): nextPublishedVersionId is string {
    return (
      typeof nextPublishedVersionId === 'string' &&
      nextPublishedVersionId.length > 0 &&
      nextPublishedVersionId !== previousPublishedVersionId
    );
  }

  private buildRestartConversationMetadata(
    baseMetadata: Record<string, unknown>,
    params: {
      restartFromConversationId: string;
      targetPublishedVersionId: string;
      lastProcessedMessageId?: string;
      lastAssistantMessageId?: string;
    },
  ): Record<string, unknown> {
    const executionMetadata: Record<string, unknown> = {
      runningState: 'idle',
      lastStopReason: 'end_turn',
      ...(params.lastProcessedMessageId
        ? { lastProcessedMessageId: params.lastProcessedMessageId }
        : {}),
      ...(params.lastAssistantMessageId
        ? { lastAssistantMessageId: params.lastAssistantMessageId }
        : {}),
    };

    return {
      ...baseMetadata,
      restartFromConversationId: params.restartFromConversationId,
      inheritedMessageHistory: true,
      restartTargetPublishedVersionId: params.targetPublishedVersionId,
      execution: executionMetadata,
    };
  }

  private readRecord(value: unknown): GenericRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as GenericRecord;
  }

  private readRequiredString(value: unknown, fieldName: string): string {
    const normalized = this.readString(value);
    if (!normalized) {
      throw new Error(`${fieldName} 是必填字符串`);
    }

    return normalized;
  }

  private readRequiredRecord(value: unknown, fieldName: string): GenericRecord {
    const normalized = this.readRecord(value);
    if (!normalized) {
      throw new Error(`${fieldName} 必须是对象`);
    }

    return normalized;
  }

  private readRequiredStringArray(value: unknown, fieldName: string): string[] {
    const normalized = this.readStringArray(value);
    if (normalized.length === 0) {
      throw new Error(`${fieldName} 至少需要包含一个字符串`);
    }

    return normalized;
  }

  private readNodeType(value: GenericRecord | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    return (
      this.readString(this.readRecord(value.data)?.nodeType) ??
      this.readString(value.type)
    );
  }

  private findNodeById(
    nodes: GenericRecord[],
    nodeId: string | undefined,
  ): GenericRecord | undefined {
    if (!nodeId) {
      return undefined;
    }

    return nodes.find((node) => this.readString(node.id) === nodeId);
  }

  private findEdgeById(
    edges: GenericRecord[],
    edgeId: string | undefined,
  ): GenericRecord | undefined {
    if (!edgeId) {
      return undefined;
    }

    return edges.find((edge) => this.readString(edge.id) === edgeId);
  }
}
