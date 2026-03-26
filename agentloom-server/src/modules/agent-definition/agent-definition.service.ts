import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, ilike, max, or, sql } from 'drizzle-orm';

import { transactionStorage } from '../../common/interceptors/tenant-transaction.interceptor';
import type { DrizzleDB } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { AgentVersionSnapshot } from '../../database/schema/agent-definitions.schema';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  generateSlug,
  appendSlugSuffix,
} from '../organization/slug.utils';
import type { CreateAgentDefinitionDto } from './dto/create-agent-definition.dto';
import type { UpdateAgentDefinitionDto } from './dto/update-agent-definition.dto';
import type { SaveAgentCanvasDto } from './dto/save-agent-canvas.dto';
import type { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import type { ListAgentDefinitionsQueryDto } from './dto/list-agent-definitions-query.dto';
import {
  serializeAgentDefinition,
  serializeAgentDefinitionDetail,
} from './dto/agent-definition-response.dto';
import type {
  AgentDefinitionResponseDto,
  AgentDefinitionDetailResponseDto,
} from './dto/agent-definition-response.dto';
import {
  AgentNotFoundException,
  AgentArchivedException,
  AgentVersionConflictException,
  AgentPublishValidationException,
} from './agent-definition.exceptions';
import type {
  AgentRuntimeConfig,
  AgentToolBinding,
  AgentKnowledgeBinding,
  AgentSubAgentRef,
  AgentInputPreprocessor,
  AgentRoutingConfig,
  AgentModelConfig,
} from './agent-runtime-config.interface';

type AgentDbClient = Pick<DrizzleDB, 'execute' | 'insert' | 'select' | 'update'>;

const MAX_SLUG_RETRIES = 3;

const LIST_COLUMNS = {
  id: schema.agentDefinitions.id,
  tenantId: schema.agentDefinitions.tenantId,
  name: schema.agentDefinitions.name,
  slug: schema.agentDefinitions.slug,
  description: schema.agentDefinitions.description,
  status: schema.agentDefinitions.status,
  version: schema.agentDefinitions.version,
  publishedVersionId: schema.agentDefinitions.publishedVersionId,
  createdBy: schema.agentDefinitions.createdBy,
  updatedBy: schema.agentDefinitions.updatedBy,
  createdAt: schema.agentDefinitions.createdAt,
  updatedAt: schema.agentDefinitions.updatedAt,
};

const SORT_COLUMN_MAP = {
  updatedAt: schema.agentDefinitions.updatedAt,
  createdAt: schema.agentDefinitions.createdAt,
  name: schema.agentDefinitions.name,
} as const;

@Injectable()
export class AgentDefinitionService {
  private readonly logger = new Logger(AgentDefinitionService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  private async withAgentWriteLock<T>(
    agentId: string,
    operation: (dbClient: AgentDbClient) => Promise<T>,
  ): Promise<T> {
    const currentTransaction = transactionStorage.getStore();

    if (currentTransaction) {
      const dbClient = currentTransaction.db as unknown as AgentDbClient;
      await this.lockAgentDefinition(dbClient, agentId);
      return operation(dbClient);
    }

    return this.db.transaction(async (tx) => {
      const dbClient = tx as unknown as AgentDbClient;
      await this.lockAgentDefinition(dbClient, agentId);
      return operation(dbClient);
    });
  }

  private async lockAgentDefinition(
    dbClient: AgentDbClient,
    agentId: string,
  ): Promise<void> {
    await dbClient.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('agent_definitions'), hashtext(${agentId}))`,
    );
  }

  async create(
    dto: CreateAgentDefinitionDto,
    userId: string,
  ): Promise<AgentDefinitionDetailResponseDto> {
    let slug = generateSlug(dto.name);

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
      try {
        const [created] = await this.tenantDb
          .insert(schema.agentDefinitions)
          .values({
            tenantId: sql<string>`current_setting('app.current_tenant')::uuid`,
            name: dto.name,
            slug,
            description: dto.description ?? null,
            sandboxConfig: (dto.globalSandboxConfig as any) ?? null,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning();

        this.logger.log(`Agent definition created: ${created.id} (${created.slug})`);
        return serializeAgentDefinitionDetail(created);
      } catch (error) {
        const isUniqueViolation =
          error instanceof Error && 'code' in error && (error as any).code === '23505';

        if (!isUniqueViolation || attempt === MAX_SLUG_RETRIES) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable: slug retry loop exhausted');
  }

  async findAll(
    query: ListAgentDefinitionsQueryDto,
  ): Promise<{
    data: AgentDefinitionResponseDto[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const { page, pageSize, status, search, sort, order } = query;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (status) {
      conditions.push(eq(schema.agentDefinitions.status, status));
    }
    if (search) {
      conditions.push(
        or(
          ilike(schema.agentDefinitions.name, `%${search}%`),
          ilike(schema.agentDefinitions.description, `%${search}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const sortColumn = SORT_COLUMN_MAP[sort as keyof typeof SORT_COLUMN_MAP] ?? SORT_COLUMN_MAP.updatedAt;
    const orderFn = order === 'asc' ? asc : desc;

    const [rows, countResult] = await Promise.all([
      this.tenantDb
        .select(LIST_COLUMNS)
        .from(schema.agentDefinitions)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.agentDefinitions)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data: rows.map(serializeAgentDefinition),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(agentId: string): Promise<AgentDefinitionResponseDto> {
    const [row] = await this.tenantDb
      .select(LIST_COLUMNS)
      .from(schema.agentDefinitions)
      .where(eq(schema.agentDefinitions.id, agentId));

    if (!row) {
      throw new AgentNotFoundException(agentId);
    }

    return serializeAgentDefinition(row);
  }

  async findDetailById(agentId: string): Promise<AgentDefinitionDetailResponseDto> {
    const [row] = await this.tenantDb
      .select()
      .from(schema.agentDefinitions)
      .where(eq(schema.agentDefinitions.id, agentId));

    if (!row) {
      throw new AgentNotFoundException(agentId);
    }

    return serializeAgentDefinitionDetail(row);
  }

  async update(
    agentId: string,
    dto: UpdateAgentDefinitionDto,
    userId: string,
  ): Promise<AgentDefinitionDetailResponseDto> {
    return this.withAgentWriteLock(agentId, async (dbClient) => {
      const [agent] = await dbClient
        .select()
        .from(schema.agentDefinitions)
        .where(eq(schema.agentDefinitions.id, agentId));

      if (!agent) {
        throw new AgentNotFoundException(agentId);
      }

      if (agent.status === 'archived') {
        throw new AgentArchivedException(agentId);
      }

      const setClause: Record<string, any> = {
        version: sql`${schema.agentDefinitions.version} + 1`,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (dto.name !== undefined) setClause.name = dto.name;
      if (dto.description !== undefined) setClause.description = dto.description;
      if (dto.globalSandboxConfig !== undefined) setClause.sandboxConfig = dto.globalSandboxConfig;

      const updateResult = await dbClient
        .update(schema.agentDefinitions)
        .set(setClause)
        .where(
          and(
            eq(schema.agentDefinitions.id, agentId),
            eq(schema.agentDefinitions.version, dto.version),
          ),
        )
        .returning();

      if (updateResult.length === 0) {
        throw new AgentVersionConflictException(agentId, agent.version);
      }

      return serializeAgentDefinitionDetail(updateResult[0]);
    });
  }

  async archive(agentId: string, userId: string): Promise<void> {
    await this.withAgentWriteLock(agentId, async (dbClient) => {
      const [agent] = await dbClient
        .select()
        .from(schema.agentDefinitions)
        .where(eq(schema.agentDefinitions.id, agentId));

      if (!agent) {
        throw new AgentNotFoundException(agentId);
      }

      if (agent.status === 'archived') {
        throw new AgentArchivedException(agentId);
      }

      await dbClient
        .update(schema.agentVersions)
        .set({ archivedAt: new Date() })
        .where(eq(schema.agentVersions.agentDefinitionId, agentId));

      await dbClient
        .update(schema.agentDefinitions)
        .set({
          status: 'archived',
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.agentDefinitions.id, agentId));

      this.logger.log(`Agent definition archived: ${agentId}`);
    });
  }

  async saveCanvas(
    agentId: string,
    dto: SaveAgentCanvasDto,
    userId: string,
  ): Promise<AgentDefinitionDetailResponseDto> {
    return this.withAgentWriteLock(agentId, async (dbClient) => {
      const [agent] = await dbClient
        .select()
        .from(schema.agentDefinitions)
        .where(eq(schema.agentDefinitions.id, agentId));

      if (!agent) {
        throw new AgentNotFoundException(agentId);
      }

      if (agent.status === 'archived') {
        throw new AgentArchivedException(agentId);
      }

      const setClause: Record<string, any> = {
        nodes: dto.canvasNodes,
        edges: dto.canvasEdges,
        version: sql`${schema.agentDefinitions.version} + 1`,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (dto.canvasViewport !== undefined) setClause.viewport = dto.canvasViewport;
      if (dto.globalSandboxConfig !== undefined) setClause.sandboxConfig = dto.globalSandboxConfig;
      if (dto.inputSchema !== undefined) setClause.metadata = sql`
        jsonb_set(
          COALESCE(${schema.agentDefinitions.metadata}, '{}'),
          '{inputSchema}',
          ${JSON.stringify(dto.inputSchema)}::jsonb
        )
      `;

      const [updated] = await dbClient
        .update(schema.agentDefinitions)
        .set(setClause)
        .where(eq(schema.agentDefinitions.id, agentId))
        .returning();

      return serializeAgentDefinitionDetail(updated);
    });
  }

  async compileCanvas(agentId: string): Promise<AgentRuntimeConfig> {
    const detail = await this.findDetailById(agentId);
    return this.buildRuntimeConfigFromNodes(detail.nodes, detail.edges, agentId);
  }

  buildRuntimeConfigFromNodes(
    nodes: any[],
    edges: any[],
    agentDefinitionId?: string,
  ): AgentRuntimeConfig {
    const config: AgentRuntimeConfig = {};

    const tools: AgentToolBinding[] = [];
    const knowledgeBindings: AgentKnowledgeBinding[] = [];
    const subAgents: AgentSubAgentRef[] = [];
    const inputPreprocessors: AgentInputPreprocessor[] = [];

    const agentMainNode = nodes.find(
      (node) => this.resolveNodeType(node) === 'agent-main',
    );
    const nodesById = new Map(
      nodes
        .filter((node) => typeof node?.id === 'string')
        .map((node) => [node.id as string, node]),
    );

    const relevantEdges = agentMainNode
      ? edges.filter(
          (edge) =>
            edge &&
            typeof edge.source === 'string' &&
            edge.target === agentMainNode.id,
        )
      : nodes
          .filter((node) => typeof node?.id === 'string')
          .map((node) => ({ source: node.id }));

    const compiledNodeIds = new Set<string>();
    this.extractConversationSkillIds(nodes, relevantEdges);

    for (const edge of relevantEdges) {
      const sourceNode = nodesById.get(edge.source) ?? edge;
      const nodeId = typeof sourceNode?.id === 'string' ? sourceNode.id : undefined;
      if (nodeId && compiledNodeIds.has(`${nodeId}:${edge.targetHandle ?? '*'}`)) {
        continue;
      }

      const nodeType = this.resolveNodeType(sourceNode);
      const data = this.resolveNodeData(sourceNode);
      const targetHandle =
        typeof edge?.targetHandle === 'string' ? edge.targetHandle : undefined;

      switch (nodeType) {
        case 'llm-model': {
          if (!agentMainNode || targetHandle === 'model-in') {
            config.modelConfig = this.extractModelConfig(data);
          }
          break;
        }

        case 'http-tool':
        case 'code-tool':
        case 'mcp-tool': {
          if (!agentMainNode || targetHandle === 'tools-in') {
            const tool = this.extractToolBinding(
              nodeId ?? nodeType,
              data,
              nodeType,
            );
            if (tool) tools.push(tool);
          }
          break;
        }

        case 'knowledge-base': {
          if (!agentMainNode || targetHandle === 'knowledge-in') {
            const kb = this.extractKnowledgeBinding(data);
            if (kb) knowledgeBindings.push(kb);
          }
          break;
        }

        case 'sub-agent': {
          if (!agentMainNode || targetHandle === 'sub-agents-in') {
            const ref = this.extractSubAgentRef(data);
            if (ref) subAgents.push(ref);
          }
          break;
        }

        case 'input-preprocessor': {
          if (!agentMainNode || targetHandle === 'input-preprocessor-in') {
            const preprocessor = this.extractInputPreprocessor(data);
            if (preprocessor) inputPreprocessors.push(preprocessor);
          }
          break;
        }

        case 'smart-routing': {
          if (!agentMainNode || targetHandle === 'model-in') {
            config.routingConfig = this.extractRoutingConfig(data);
          }
          break;
        }

        case 'sandbox': {
          if (!agentMainNode || targetHandle === 'sandbox-in') {
            const sandboxConfig = this.extractSandboxConfig(data);
            if (sandboxConfig) {
              config.sandboxConfig = sandboxConfig;
            }
          }
          break;
        }

        case 'skill': {
          if (!agentMainNode || targetHandle === 'skills-in') {
            this.extractSkillId(sourceNode);
          }
          break;
        }

        default:
          break;
      }

      if (nodeId) {
        compiledNodeIds.add(`${nodeId}:${targetHandle ?? '*'}`);
      }
    }

    if (agentDefinitionId && subAgents.length > 0) {
      this.validateSubAgentRefs(subAgents, agentDefinitionId);
    }

    if (tools.length > 0) config.tools = tools;
    if (knowledgeBindings.length > 0) config.knowledgeBindings = knowledgeBindings;
    if (subAgents.length > 0) config.subAgents = subAgents;
    if (inputPreprocessors.length > 0) config.inputPreprocessors = inputPreprocessors;

    return config;
  }

  private validateSubAgentRefs(
    refs: AgentSubAgentRef[],
    currentAgentId: string,
  ): void {
    const seen = new Set<string>();
    for (const ref of refs) {
      if (seen.has(ref.alias)) {
        throw new Error(`子代理别名重复: ${ref.alias}`);
      }
      seen.add(ref.alias);
    }

    const aliasRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    for (const ref of refs) {
      if (!aliasRegex.test(ref.alias)) {
        throw new Error(
          `子代理别名格式非法: ${ref.alias}，必须以字母开头，只能包含字母、数字、下划线、-字符`,
        );
      }
    }

    for (const ref of refs) {
      if (ref.agentDefinitionId === currentAgentId) {
        throw new Error('不能将自身作为子代理引用');
      }
    }

    // TODO: 深度循环引用检测在运行时由 resolveSubAgent() 处理
  }

  async createVersion(
    agentId: string,
    dto: CreateAgentVersionDto,
    userId: string,
  ): Promise<AgentVersionResponseDto> {
    return this.withAgentWriteLock(agentId, async (dbClient) => {
      const [agent] = await dbClient
        .select()
        .from(schema.agentDefinitions)
        .where(eq(schema.agentDefinitions.id, agentId));

      if (!agent) {
        throw new AgentNotFoundException(agentId);
      }

      if (agent.status === 'archived') {
        throw new AgentArchivedException(agentId);
      }

      const nextVersion = await this.getNextVersionNumber(dbClient, agentId);
      const snapshot = this.buildSnapshot(agent, dto.changelog);

      const [version] = await dbClient
        .insert(schema.agentVersions)
        .values({
          agentDefinitionId: agentId,
          tenantId: agent.tenantId,
          versionNumber: nextVersion,
          label: dto.changelog
            ? `v${nextVersion} - ${dto.changelog.slice(0, 50)}`
            : `v${nextVersion}`,
          snapshot,
          createdBy: userId,
        })
        .returning();

      this.logger.log(`Agent version created: ${version.id} (v${nextVersion})`);
      return toVersionResponseDto(version);
    });
  }

  async listVersions(
    agentId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{
    data: AgentVersionResponseDto[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const offset = (page - 1) * pageSize;

    const [rows, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.agentVersions)
        .where(eq(schema.agentVersions.agentDefinitionId, agentId))
        .orderBy(desc(schema.agentVersions.versionNumber))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.agentVersions)
        .where(eq(schema.agentVersions.agentDefinitionId, agentId)),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data: rows.map(toVersionResponseDto),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async publish(
    agentId: string,
    userId: string,
  ): Promise<AgentDefinitionDetailResponseDto> {
    return this.withAgentWriteLock(agentId, async (dbClient) => {
      const [agent] = await dbClient
        .select()
        .from(schema.agentDefinitions)
        .where(eq(schema.agentDefinitions.id, agentId));

      if (!agent) {
        throw new AgentNotFoundException(agentId);
      }

      if (agent.status === 'archived') {
        throw new AgentArchivedException(agentId);
      }

      if (!agent.nodes || agent.nodes.length === 0) {
        throw new AgentPublishValidationException(
          'Agent 画布不包含任何节点，无法发布',
        );
      }

      const nextVersion = await this.getNextVersionNumber(dbClient, agentId);
      const snapshot = this.buildSnapshot(agent);

      const [version] = await dbClient
        .insert(schema.agentVersions)
        .values({
          agentDefinitionId: agentId,
          tenantId: agent.tenantId,
          versionNumber: nextVersion,
          label: `v${nextVersion} (published)`,
          snapshot,
          publishedAt: new Date(),
          createdBy: userId,
        })
        .returning();

      const [updated] = await dbClient
        .update(schema.agentDefinitions)
        .set({
          status: 'published',
          publishedVersionId: version.id,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.agentDefinitions.id, agentId))
        .returning();

      this.logger.log(`Agent definition published: ${agentId} → version ${version.id}`);
      return serializeAgentDefinitionDetail(updated);
    });
  }

  private async getNextVersionNumber(
    dbClient: AgentDbClient,
    agentId: string,
  ): Promise<number> {
    const [result] = await dbClient
      .select({ maxVersion: max(schema.agentVersions.versionNumber) })
      .from(schema.agentVersions)
      .where(eq(schema.agentVersions.agentDefinitionId, agentId));

    return (result?.maxVersion ?? 0) + 1;
  }

  private buildSnapshot(
    agent: typeof schema.agentDefinitions.$inferSelect,
    releaseNotes?: string,
  ): AgentVersionSnapshot {
    return {
      nodes: agent.nodes,
      edges: agent.edges,
      viewport: agent.viewport,
      systemPrompt: agent.systemPrompt,
      sandboxConfig: agent.sandboxConfig,
      workspaceSnapshotId: agent.workspaceSnapshotId,
      metadata: {
        nodeCount: agent.nodes?.length ?? 0,
        edgeCount: agent.edges?.length ?? 0,
        createdFromVersion: agent.version,
        releaseNotes,
      },
    };
  }

  private extractModelConfig(data: Record<string, any>): AgentModelConfig {
    return {
      modelId: data.modelId ?? data.model_id ?? '',
      temperature: data.temperature,
      maxTokens: data.maxTokens ?? data.max_tokens,
      topP: data.topP ?? data.top_p,
      frequencyPenalty: data.frequencyPenalty ?? data.frequency_penalty,
      presencePenalty: data.presencePenalty ?? data.presence_penalty,
      customParameters: data.customParameters ?? data.custom_parameters,
    };
  }

  private extractToolBinding(
    nodeId: string,
    data: Record<string, any>,
    nodeType: string,
  ): AgentToolBinding | null {
    const toolId = data.toolId ?? data.tool_id ?? nodeId;
    const baseBinding = {
      toolId,
      name: data.name ?? data.label ?? nodeType,
      description: data.description,
      parameterOverrides: data.parameterOverrides ?? data.parameter_overrides,
      enabled: data.enabled !== false,
    } satisfies AgentToolBinding;

    if (nodeType === 'mcp-tool') {
      const mcpToolDefinitionId =
        data.mcpToolDefinitionId ?? data.mcp_tool_definition_id;
      const mcpServerConfigId =
        data.mcpServerConfigId ?? data.mcp_server_config_id;
      const toolName = data.toolName ?? data.tool_name;
      const inputSchema =
        data.inputSchema && typeof data.inputSchema === 'object' && !Array.isArray(data.inputSchema)
          ? data.inputSchema
          : undefined;
      const portMapping =
        data.portMapping && typeof data.portMapping === 'object' && !Array.isArray(data.portMapping)
          ? data.portMapping
          : undefined;

      if (mcpToolDefinitionId || (mcpServerConfigId && toolName)) {
        return {
          ...baseBinding,
          toolType: 'mcp',
          ...(mcpToolDefinitionId === undefined ? {} : { mcpToolDefinitionId }),
          ...(mcpServerConfigId === undefined ? {} : { mcpServerConfigId }),
          ...(toolName === undefined ? {} : { toolName }),
          ...(inputSchema === undefined ? {} : { inputSchema }),
          ...(portMapping === undefined ? {} : { portMapping }),
        };
      }

      return {
        ...baseBinding,
        ...(mcpToolDefinitionId === undefined ? {} : { mcpToolDefinitionId }),
        ...(mcpServerConfigId === undefined ? {} : { mcpServerConfigId }),
        ...(toolName === undefined ? {} : { toolName }),
        ...(inputSchema === undefined ? {} : { inputSchema }),
        ...(portMapping === undefined ? {} : { portMapping }),
      };
    };

    if (nodeType === 'http-tool') {
      const url = data.url;
      const method = data.method;
      if (typeof url === 'string' && url.length > 0) {
        return {
          ...baseBinding,
          toolType: 'http',
          url,
          ...(typeof method === 'string' && method.length > 0 ? { method } : {}),
        };
      }

      return {
        ...baseBinding,
        ...(typeof url === 'string' && url.length > 0 ? { url } : {}),
        ...(typeof method === 'string' && method.length > 0 ? { method } : {}),
      };
    }

    if (nodeType === 'code-tool') {
      const language = data.language;
      const code = data.code;
      if (typeof language === 'string' && language.length > 0) {
        return {
          ...baseBinding,
          toolType: 'code',
          language,
          ...(typeof code === 'string' ? { code } : {}),
        };
      }

      return {
        ...baseBinding,
        ...(typeof language === 'string' && language.length > 0 ? { language } : {}),
        ...(typeof code === 'string' ? { code } : {}),
      };
    }

    return baseBinding;
  }

  private extractKnowledgeBinding(
    data: Record<string, any>,
  ): AgentKnowledgeBinding | null {
    const kbId = data.knowledgeBaseId ?? data.knowledge_base_id;
    if (!kbId) return null;

    return {
      knowledgeBaseId: kbId,
      topK: data.topK ?? data.top_k,
      similarityThreshold: data.similarityThreshold ?? data.similarity_threshold,
      enabled: data.enabled !== false,
    };
  }

  private extractSubAgentRef(
    data: Record<string, any>,
  ): AgentSubAgentRef | null {
    const defId = data.agentDefinitionId ?? data.agent_definition_id;
    if (!defId) return null;

    return {
      agentDefinitionId: defId,
      agentVersionId: data.agentVersionId ?? data.agent_version_id,
      alias: data.alias || (defId as string).slice(0, 8),
      maxTimeoutMs: data.maxTimeoutMs ?? data.max_timeout_ms,
      description: data.description,
    };
  }

  private extractInputPreprocessor(
    data: Record<string, any>,
  ): AgentInputPreprocessor | null {
    const type = data.preprocessorType ?? data.transformType ?? data.type;
    if (!type) return null;

    const nestedConfig =
      data.config && typeof data.config === 'object' && !Array.isArray(data.config)
        ? (data.config as Record<string, any>)
        : null;
    const resolvedConfig =
      data.preprocessorConfig ??
      (nestedConfig &&
      (nestedConfig.preprocessorType !== undefined ||
        nestedConfig.transformType !== undefined ||
        nestedConfig.type !== undefined)
        ? nestedConfig.config ?? nestedConfig.preprocessorConfig
        : data.config);

    return {
      type,
      config: resolvedConfig,
    };
  }

  private extractRoutingConfig(
    data: Record<string, any>,
  ): AgentRoutingConfig {
    return {
      strategy: data.strategy ?? 'FALLBACK_CHAIN',
      candidateModelIds: data.candidateModelIds ?? data.candidate_model_ids,
      fallbackModelId: data.fallbackModelId ?? data.fallback_model_id,
    };
  }

  private resolveNodeType(node: any): string {
    const nodeType = node?.data?.nodeType;
    if (typeof nodeType === 'string' && nodeType.length > 0) {
      return nodeType;
    }

    return typeof node?.type === 'string' ? node.type : '';
  }

  private resolveNodeData(node: any): Record<string, any> {
    const data =
      node?.data && typeof node.data === 'object' && !Array.isArray(node.data)
        ? (node.data as Record<string, any>)
        : {};
    const config =
      data.config && typeof data.config === 'object' && !Array.isArray(data.config)
        ? (data.config as Record<string, any>)
        : {};

    return {
      ...config,
      ...data,
    };
  }

  private extractConversationSkillIds(nodes: any[], edges: any[]): string[] {
    const skillNodes = nodes.filter(
      (node) => this.resolveNodeType(node) === 'skill',
    );
    if (!skillNodes.length) {
      return [];
    }

    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      if (typeof edge?.source === 'string') {
        connectedNodeIds.add(edge.source);
      }
      if (typeof edge?.target === 'string') {
        connectedNodeIds.add(edge.target);
      }
    }

    const connectedSkillNodes = skillNodes.filter((node) =>
      connectedNodeIds.has(node.id),
    );
    const activeSkillNodes = connectedSkillNodes.length
      ? connectedSkillNodes
      : skillNodes;

    return [...new Set(activeSkillNodes.map((node) => this.extractSkillId(node)))].filter(
      (skillId): skillId is string =>
        typeof skillId === 'string' && skillId.length > 0,
    );
  }

  private extractSkillId(node: any): string | null {
    const data = this.resolveNodeData(node);
    const skillId = data.skillId ?? data.skill_id;
    return typeof skillId === 'string' && skillId.trim().length > 0
      ? skillId.trim()
      : null;
  }

  private extractSandboxConfig(
    data: Record<string, any>,
  ): AgentRuntimeConfig['sandboxConfig'] | null {
    if (data.enabled === false) {
      return null;
    }

    return {
      cpu: data.cpu ?? data.cpuLimit ?? 1,
      memory: data.memory ?? data.memoryLimitMb ?? 512,
      disk: data.disk ?? 1,
      timeout: data.timeout ?? data.timeoutSeconds ?? 300,
      lifecycleMode: data.lifecycleMode,
      persistencePath: data.persistencePath,
      restoreWorkspaceId: data.restoreWorkspaceId,
      persistenceExpiryHours: data.persistenceExpiryHours,
    };
  }
}

export interface AgentVersionResponseDto {
  id: string;
  agentDefinitionId: string;
  versionNumber: number;
  label: string | null;
  snapshot: AgentVersionSnapshot;
  publishedAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
}

function toVersionResponseDto(
  version: typeof schema.agentVersions.$inferSelect,
): AgentVersionResponseDto {
  return {
    id: version.id,
    agentDefinitionId: version.agentDefinitionId,
    versionNumber: version.versionNumber,
    label: version.label,
    snapshot: version.snapshot as AgentVersionSnapshot,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    archivedAt: version.archivedAt?.toISOString() ?? null,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
  };
}
