import { Inject, Injectable, Logger } from '@nestjs/common';
import { tool, type ToolSet } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { WorkflowGraphViewportSchema } from '@agentloom/contracts';

import { DomainException } from '../../common/exceptions/domain.exception';
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
import { resolveMcpServerConfigId } from '../agent-definition/mcp-tool-descriptor.utils';
import { ListAgentDefinitionsQuerySchema } from '../agent-definition/dto/list-agent-definitions-query.dto';
import { LlmProviderService } from '../llm/llm-provider.service';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { McpServerConfigQuerySchema } from '../mcp/dto/mcp-server-config-query.dto';
import { SandboxService } from '../sandbox/sandbox.service';
import { SkillService, type SkillUploadFile } from '../skill/skill.service';
import { SkillQuerySchema } from '../skill/dto/skill-query.dto';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { CreateWorkflowDefinitionSchema } from '../workflow-definition/dto/create-workflow-definition.dto';
import { ListWorkflowDefinitionsQuerySchema } from '../workflow-definition/dto/list-workflow-definitions-query.dto';
import { UpdateWorkflowDefinitionSchema } from '../workflow-definition/dto/update-workflow-definition.dto';
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
import { SelfEvolutionReadService } from './self-evolution-read.service';
import { SelfEvolutionMutationService } from './self-evolution-mutation.service';
import { SelfEvolutionPermissionPolicy } from './self-evolution-permission-policy';
import {
  SelfEvolutionGraphPatch,
  type GraphPatchOperation,
} from './self-evolution-graph-patch';
import {
  AgentCreateDtoSchema,
  AgentGraphEdgeArraySchema,
  AgentGraphNodeArraySchema,
  ApplyChangeSchema,
  CreateResourceSchema,
  GenericRecordSchema,
  McpImportDtoSchema,
  ModelCreateDtoSchema,
  ProposeChangeSchema,
  ProviderCreateDtoSchema,
  QueryResourcePoolSchema,
  QueryStateSchema,
  SkillCreateDtoSchema,
} from './self-evolution.schemas';

type GenericRecord = Record<string, unknown>;


@Injectable()
export class SelfEvolutionService {
  readonly logger = new Logger(SelfEvolutionService.name);

  constructor(
    @Inject(DRIZZLE) public readonly db: DrizzleDB,
    public readonly agentDefinitionService: AgentDefinitionService,
    public readonly skillService: SkillService,
    public readonly llmService: LlmService,
    public readonly llmProviderService: LlmProviderService,
    public readonly mcpService: McpService,
    public readonly workspaceService: WorkspaceService,
    public readonly workflowVersionService: WorkflowVersionService,
    public readonly permissionService: SelfEvolutionPermissionService,
    public readonly sandboxService: SandboxService,
    public readonly readService: SelfEvolutionReadService,
    public readonly mutationService: SelfEvolutionMutationService,
    public readonly permissionPolicy: SelfEvolutionPermissionPolicy,
    public readonly graphPatch: SelfEvolutionGraphPatch,
  ) {}

  get tenantDb(): DrizzleDB {
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
        inputSchema: QueryStateSchema,
        execute: async (input) =>
          this.executeReadTool('query_state', context, QueryStateSchema.parse(input)),
      }),
      query_resource_pool: tool({
        description:
          '查询当前租户已存在的技能、MCP、模型、Agent、Workflow、Workspace 资源池。',
        inputSchema: QueryResourcePoolSchema,
        execute: async (input) =>
          this.executeReadTool(
            'query_resource_pool',
            context,
            QueryResourcePoolSchema.parse(input),
          ),
      }),
      propose_change: tool({
        description:
          '基于节点/连线级操作生成自进化编排变更提案，并返回 diff/风险/是否需要审批。',
        inputSchema: ProposeChangeSchema,
        execute: async (input) =>
          this.executeReadTool(
            'propose_change',
            context,
            ProposeChangeSchema.parse(input),
          ),
      }),
      apply_change: tool({
        description:
          '应用 propose_change 返回的 proposal。已发布的自身 Agent 会直接生成新 published version；结果里的 publishedVersionNumber 才是用户可见发布版号，detail.version 仅是草稿修订号。',
        inputSchema: ApplyChangeSchema,
        execute: async (input) =>
          this.executeMutationDirect(
            'apply_change',
            context,
            ApplyChangeSchema.parse(input),
          ),
      }),
      create_resource: tool({
        description:
          '在权限允许时创建新 Skill、MCP、Model、Workspace、Agent、Workflow 资源。',
        inputSchema: CreateResourceSchema,
        execute: async (input) =>
          this.executeMutationDirect(
            'create_resource',
            context,
            CreateResourceSchema.parse(input),
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
    _tenantId: string,
    _userId: string,
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
    let lastProcessedMessageId: string | undefined;
    let lastAssistantMessageId: string | undefined;
    for (const sourceMessage of sourceMessages) {
      if (sourceMessage.role === 'user') {
        lastProcessedMessageId = sourceMessage.id;
      }

      if (sourceMessage.role === 'assistant') {
        lastAssistantMessageId = sourceMessage.id;
      }
    }

    const restartMetadata = this.buildRestartConversationMetadata(
      this.readRecord(sourceConversation.metadata) ?? {},
      {
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
      .where(eq(agentConversations.id, conversationId));

    return {
      data: {
        conversationId,
      },
    };
  }

  async executeReadTool(
    toolName: Extract<
      SelfEvolutionToolName,
      'query_state' | 'query_resource_pool' | 'propose_change'
    >,
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    return this.readService.execute(toolName, {
      query_state: () => this.readService.queryState(context, input),
      query_resource_pool: () =>
        this.readService.queryResourcePool(context, input),
      propose_change: () => this.readService.proposeChange(context, input),
    });
  }

  async executeMutationDirect(
    toolName: Extract<
      SelfEvolutionToolName,
      'apply_change' | 'create_resource'
    >,
    context: SelfEvolutionSessionContext,
    input: GenericRecord,
  ): Promise<SelfEvolutionToolResult> {
    return this.mutationService.execute(() =>
      toolName === 'apply_change'
        ? this.mutationService.applyChange(context, input)
        : this.mutationService.createResource(context, input),
    );
  }

  async preflightApplyChange(
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
        result: await this.mutationService.applyChange(context, input),
      };
    }

    const permissionRequest = this.permissionPolicy.buildPermissionRequest(
      context,
      proposal,
    );
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

  async executeApplyChangeAfterApproval(
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

    const permissionRequest = this.permissionPolicy.buildPermissionRequest(
      context,
      proposal,
    );
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
      result: await this.mutationService.applyChange(context, input),
    };
  }

  async preflightCreateResource(
    context: SelfEvolutionSessionContext,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const permissionProfile =
      this.permissionPolicy.buildCreateResourcePermissionProfile(
        context,
        input,
      );

    const remembered = await this.permissionService.getRememberedDecision(
      context.conversationId,
      permissionProfile.category,
    );

    if (remembered === 'approve') {
      return {
        result: await this.mutationService.createResource(context, input),
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

  async executeCreateResourceAfterApproval(
    context: SelfEvolutionSessionContext,
    toolCallId: string,
    input: GenericRecord,
  ): Promise<SelfEvolutionRemoteToolOutcome> {
    const permissionProfile =
      this.permissionPolicy.buildCreateResourcePermissionProfile(
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
      result: await this.mutationService.createResource(context, input),
    };
  }






  async buildSessionContext(
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









  toFailureResult(error: unknown): SelfEvolutionToolResult {
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

  toDeniedOutcome(
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

  readTargetKind(value: unknown): SelfEvolutionTargetKind {
    switch (value) {
      case 'self':
      case 'agent':
      case 'workflow':
        return value;
      default:
        throw new Error('targetKind 必须是 self / agent / workflow');
    }
  }

  readProposal(value: unknown): SelfEvolutionGraphProposal | null {
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

  readNodeOperations(
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

  readEdgeOperations(
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

  readGraphOperation(
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

  buildSkillFiles(
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

  mergeRecords(
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

  cloneJsonArray(value: unknown): GenericRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => this.cloneJsonRecord(entry));
  }

  cloneJsonRecord(value: unknown): GenericRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return JSON.parse(JSON.stringify(value)) as GenericRecord;
  }

  cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  ensureResourceManagementEnabled(
    context: SelfEvolutionSessionContext,
  ): void {
    this.permissionPolicy.requireResourceManagement(context);
  }

  ensureExternalEditingEnabled(
    context: SelfEvolutionSessionContext,
  ): void {
    this.permissionPolicy.requireExternalEditing(context);
  }

  ensureSandboxManagementEnabled(
    context: SelfEvolutionSessionContext,
  ): void {
    this.permissionPolicy.requireSandboxManagement(context);
  }

  readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0,
    );
  }

  readPositiveInt(
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

  readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  hasNewPublishedVersion(
    previousPublishedVersionId: string | null | undefined,
    nextPublishedVersionId: string | null | undefined,
  ): nextPublishedVersionId is string {
    return (
      typeof nextPublishedVersionId === 'string' &&
      nextPublishedVersionId.length > 0 &&
      nextPublishedVersionId !== previousPublishedVersionId
    );
  }

  buildRestartConversationMetadata(
    baseMetadata: Record<string, unknown>,
    params: {
      targetPublishedVersionId: string;
      lastProcessedMessageId?: string;
      lastAssistantMessageId?: string;
    },
  ): Record<string, unknown> {
    const executionMetadata: Record<string, unknown> = {
      runningState: 'idle',
      lastStopReason: 'end_turn',
      loadedPublishedVersionId: params.targetPublishedVersionId,
      ...(params.lastProcessedMessageId
        ? { lastProcessedMessageId: params.lastProcessedMessageId }
        : {}),
      ...(params.lastAssistantMessageId
        ? { lastAssistantMessageId: params.lastAssistantMessageId }
        : {}),
    };

    return {
      ...baseMetadata,
      execution: executionMetadata,
    };
  }

  readRecord(value: unknown): GenericRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as GenericRecord;
  }

  readRequiredString(value: unknown, fieldName: string): string {
    const normalized = this.readString(value);
    if (!normalized) {
      throw new Error(`${fieldName} 是必填字符串`);
    }

    return normalized;
  }

  readRequiredRecord(value: unknown, fieldName: string): GenericRecord {
    const normalized = this.readRecord(value);
    if (!normalized) {
      throw new Error(`${fieldName} 必须是对象`);
    }

    return normalized;
  }

  readRequiredStringArray(value: unknown, fieldName: string): string[] {
    const normalized = this.readStringArray(value);
    if (normalized.length === 0) {
      throw new Error(`${fieldName} 至少需要包含一个字符串`);
    }

    return normalized;
  }

  readNodeType(value: GenericRecord | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    return (
      this.readString(this.readRecord(value.data)?.nodeType) ??
      this.readString(value.type)
    );
  }

  findNodeById(
    nodes: GenericRecord[],
    nodeId: string | undefined,
  ): GenericRecord | undefined {
    if (!nodeId) {
      return undefined;
    }

    return nodes.find((node) => this.readString(node.id) === nodeId);
  }

  findEdgeById(
    edges: GenericRecord[],
    edgeId: string | undefined,
  ): GenericRecord | undefined {
    if (!edgeId) {
      return undefined;
    }

    return edges.find((edge) => this.readString(edge.id) === edgeId);
  }
}
