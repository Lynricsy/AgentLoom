import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, max, not, or, sql } from 'drizzle-orm';

import { transactionStorage } from '../../common/interceptors/tenant-transaction.interceptor';
import type { DrizzleDB } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  AgentRuntimeMode,
  AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import { generateSlug, appendSlugSuffix } from '../organization/slug.utils';
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
import { deriveAgentSandboxConfigFromCanvas } from './agent-sandbox-config.utils';
import {
  AgentNotFoundException,
  AgentArchivedException,
  AgentVersionConflictException,
  AgentPublishValidationException,
} from './agent-definition.exceptions';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import {
  DEFAULT_AGENT_SANDBOX_TIMEOUT_SECONDS,
  deriveSandboxTimeoutHours,
  normalizeSandboxTimeoutSeconds,
} from '../sandbox/sandbox-timeout.utils';
import { resolveSandboxConversationIdleAutoEndMinutes } from '../sandbox/sandbox-conversation-idle.utils';
import type {
  AgentCodeToolBinding,
  AgentHttpToolBinding,
  AgentRuntimeConfig,
  AgentToolBinding,
  AgentKnowledgeBinding,
  AgentSubAgentRef,
  AgentInputPreprocessor,
  AgentRoutingConfig,
  AgentModelConfig,
  AgentNativeToolPolicy,
  AgentSelfEvolutionPolicy,
} from './agent-runtime-config.interface';

type AgentDbClient = Pick<
  DrizzleDB,
  'execute' | 'insert' | 'select' | 'update'
>;

export interface ApplyAgentCanvasSnapshotOptions {
  canvasNodes: schema.ReactFlowNode[];
  canvasEdges: schema.ReactFlowEdge[];
  canvasViewport?: schema.ReactFlowViewport;
  globalSandboxConfig?: Record<string, unknown> | null;
  workspaceSnapshotId?: string | null;
  inputSchema?: Record<string, unknown> | null;
  memoryInstanceIds?: string[];
  sandboxLifecycle?: string;
  expectedVersion?: number;
  publishIfCurrentlyPublished?: boolean;
  publishAfterSave?: boolean;
}

export interface ApplyAgentCanvasSnapshotResult {
  detail: AgentDefinitionDetailResponseDto;
  publishedVersionId?: string;
  publishedVersionNumber?: number;
}

const MAX_SLUG_RETRIES = 3;

const LIST_COLUMNS = {
  id: schema.agentDefinitions.id,
  tenantId: schema.agentDefinitions.tenantId,
  name: schema.agentDefinitions.name,
  slug: schema.agentDefinitions.slug,
  description: schema.agentDefinitions.description,
  icon: schema.agentDefinitions.icon,
  runtimeMode: schema.agentDefinitions.runtimeMode,
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
    private readonly resourceSourceService: ResourceSourceService,
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
        const created = await this.tenantDb.transaction(async (tx) => {
          const [row] = await tx
            .insert(schema.agentDefinitions)
            .values({
              tenantId: sql<string>`current_setting('app.current_tenant')::uuid`,
              name: dto.name,
              slug,
              description: dto.description ?? null,
              icon: dto.icon ?? null,
              runtimeMode: dto.runtimeMode,
              sandboxConfig:
                dto.runtimeMode === 'sandbox'
                  ? ((dto.globalSandboxConfig as any) ?? null)
                  : null,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();

          return row;
        });

        this.logger.log(
          `Agent definition created: ${created.id} (${created.slug})`,
        );
        return serializeAgentDefinitionDetail(created);
      } catch (error) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (!isUniqueViolation || attempt === MAX_SLUG_RETRIES) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    throw new Error('Unreachable: slug retry loop exhausted');
  }

  async findAll(query: ListAgentDefinitionsQueryDto): Promise<{
    data: AgentDefinitionResponseDto[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const { page, pageSize, status, search, sourceKind, sort, order } = query;
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

    if (sourceKind) {
      const importedExistsCondition =
        this.resourceSourceService.buildShareImportedExistsCondition({
          resourceType: 'agent_definition',
          resourceIdColumn: schema.agentDefinitions.id,
        });

      conditions.push(
        sourceKind === 'share_imported'
          ? importedExistsCondition
          : not(importedExistsCondition),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const sortColumn = SORT_COLUMN_MAP[sort] ?? SORT_COLUMN_MAP.updatedAt;
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
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'agent_definition',
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) =>
        serializeAgentDefinition(row, {
          resourceSourceKind: sourceKindMap.get(row.id) ?? 'manual',
        }),
      ),
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

    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'agent_definition',
      [row.id],
    );

    return serializeAgentDefinition(row, {
      resourceSourceKind: sourceKindMap.get(row.id) ?? 'manual',
    });
  }

  async findDetailById(
    agentId: string,
  ): Promise<AgentDefinitionDetailResponseDto> {
    const [row] = await this.tenantDb
      .select()
      .from(schema.agentDefinitions)
      .where(eq(schema.agentDefinitions.id, agentId));

    if (!row) {
      throw new AgentNotFoundException(agentId);
    }

    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'agent_definition',
      [row.id],
    );

    return serializeAgentDefinitionDetail(row, {
      resourceSourceKind: sourceKindMap.get(row.id) ?? 'manual',
    });
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
      if (dto.description !== undefined)
        setClause.description = dto.description;
      if (dto.icon !== undefined) setClause.icon = dto.icon;
      if (dto.globalSandboxConfig !== undefined) {
        setClause.sandboxConfig =
          agent.runtimeMode === 'sandbox' ? dto.globalSandboxConfig : null;
      }

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
        sandboxConfig: this.derivePersistedSandboxConfig(
          dto.canvasNodes,
          dto.canvasEdges,
          dto.globalSandboxConfig,
          agent.runtimeMode,
        ),
        version: sql`${schema.agentDefinitions.version} + 1`,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (dto.canvasViewport !== undefined)
        setClause.viewport = dto.canvasViewport;
      if (dto.workspaceSnapshotId !== undefined)
        setClause.workspaceSnapshotId = dto.workspaceSnapshotId;

      const metadataSetters: Array<{ path: string; value: unknown }> = [];
      if (dto.inputSchema !== undefined) {
        metadataSetters.push({ path: 'inputSchema', value: dto.inputSchema });
      }
      if (dto.memoryInstanceIds !== undefined) {
        metadataSetters.push({
          path: 'memoryInstanceIds',
          value: dto.memoryInstanceIds,
        });
      }
      if (dto.sandboxLifecycle !== undefined) {
        metadataSetters.push({
          path: 'sandboxLifecycle',
          value: dto.sandboxLifecycle,
        });
      }

      if (metadataSetters.length > 0) {
        let metadataExpression = sql`COALESCE(${schema.agentDefinitions.metadata}, '{}'::jsonb)`;
        for (const setter of metadataSetters) {
          metadataExpression = sql`jsonb_set(
            ${metadataExpression},
            ${sql.raw(`'{${setter.path}}'`)},
            ${JSON.stringify(setter.value)}::jsonb,
            true
          )`;
        }
        setClause.metadata = metadataExpression;
      }

      const [updated] = await dbClient
        .update(schema.agentDefinitions)
        .set(setClause)
        .where(eq(schema.agentDefinitions.id, agentId))
        .returning();

      return serializeAgentDefinitionDetail(updated);
    });
  }

  async applyCanvasSnapshot(
    agentId: string,
    options: ApplyAgentCanvasSnapshotOptions,
    userId: string,
  ): Promise<ApplyAgentCanvasSnapshotResult> {
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

      if (
        options.expectedVersion !== undefined &&
        agent.version !== options.expectedVersion
      ) {
        throw new AgentVersionConflictException(agentId, agent.version);
      }

      await this.assertRuntimeModeConstraints(
        dbClient,
        agent.runtimeMode,
        options.canvasNodes,
        options.canvasEdges,
      );

      const setClause: Record<string, any> = {
        nodes: options.canvasNodes,
        edges: options.canvasEdges,
        sandboxConfig: this.derivePersistedSandboxConfig(
          options.canvasNodes,
          options.canvasEdges,
          options.globalSandboxConfig,
          agent.runtimeMode,
        ),
        version: sql`${schema.agentDefinitions.version} + 1`,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (options.canvasViewport !== undefined) {
        setClause.viewport = options.canvasViewport;
      }
      if (options.workspaceSnapshotId !== undefined) {
        setClause.workspaceSnapshotId = options.workspaceSnapshotId;
      }

      const metadataSetters: Array<{ path: string; value: unknown }> = [];
      if (options.inputSchema !== undefined) {
        metadataSetters.push({
          path: 'inputSchema',
          value: options.inputSchema,
        });
      }
      if (options.memoryInstanceIds !== undefined) {
        metadataSetters.push({
          path: 'memoryInstanceIds',
          value: options.memoryInstanceIds,
        });
      }
      if (options.sandboxLifecycle !== undefined) {
        metadataSetters.push({
          path: 'sandboxLifecycle',
          value: options.sandboxLifecycle,
        });
      }

      if (metadataSetters.length > 0) {
        let metadataExpression = sql`COALESCE(${schema.agentDefinitions.metadata}, '{}'::jsonb)`;
        for (const setter of metadataSetters) {
          metadataExpression = sql`jsonb_set(
            ${metadataExpression},
            ${sql.raw(`'{${setter.path}}'`)},
            ${JSON.stringify(setter.value)}::jsonb,
            true
          )`;
        }
        setClause.metadata = metadataExpression;
      }

      const [updatedDraft] = await dbClient
        .update(schema.agentDefinitions)
        .set(setClause)
        .where(eq(schema.agentDefinitions.id, agentId))
        .returning();

      const shouldPublish =
        options.publishAfterSave === true ||
        (options.publishIfCurrentlyPublished === true &&
          agent.publishedVersionId !== null);

      if (!shouldPublish) {
        return {
          detail: serializeAgentDefinitionDetail(updatedDraft),
        };
      }

      if (!updatedDraft.nodes || updatedDraft.nodes.length === 0) {
        throw new AgentPublishValidationException(
          'Agent 画布不包含任何节点，无法发布',
        );
      }

      const nextVersion = await this.getNextVersionNumber(dbClient, agentId);
      const snapshot = this.buildSnapshot(updatedDraft);

      const [version] = await dbClient
        .insert(schema.agentVersions)
        .values({
          agentDefinitionId: agentId,
          tenantId: updatedDraft.tenantId,
          versionNumber: nextVersion,
          label: `v${nextVersion} (published)`,
          snapshot,
          publishedAt: new Date(),
          createdBy: userId,
        })
        .returning();

      const [publishedDetail] = await dbClient
        .update(schema.agentDefinitions)
        .set({
          status: 'published',
          publishedVersionId: version.id,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.agentDefinitions.id, agentId))
        .returning();

      return {
        detail: serializeAgentDefinitionDetail(publishedDetail),
        publishedVersionId: version.id,
        publishedVersionNumber: nextVersion,
      };
    });
  }

  async compileCanvas(agentId: string): Promise<AgentRuntimeConfig> {
    const detail = await this.findDetailById(agentId);
    return this.buildRuntimeConfigFromNodes(
      detail.nodes,
      detail.edges,
      agentId,
      detail.runtimeMode,
    );
  }

  buildRuntimeConfigFromNodes(
    nodes: any[],
    edges: any[],
    agentDefinitionId?: string,
    runtimeMode: AgentRuntimeMode = 'sandbox',
  ): AgentRuntimeConfig {
    const config: AgentRuntimeConfig = { runtimeMode };

    const tools: AgentToolBinding[] = [];
    const knowledgeBindings: AgentKnowledgeBinding[] = [];
    const subAgents: AgentSubAgentRef[] = [];
    const inputPreprocessors: AgentInputPreprocessor[] = [];
    const memoryInstanceIds: string[] = [];

    const agentMainNode = nodes.find(
      (node) => this.resolveNodeType(node) === 'agent-main',
    );
    const agentMainRuntimeConfig = agentMainNode
      ? this.extractAgentMainRuntimeConfig(
          this.resolveNodeData(agentMainNode),
          runtimeMode,
        )
      : {};
    if (agentMainRuntimeConfig.nativeToolPolicy) {
      config.nativeToolPolicy = agentMainRuntimeConfig.nativeToolPolicy;
    }
    if (agentMainRuntimeConfig.selfEvolutionPolicy) {
      config.selfEvolutionPolicy = agentMainRuntimeConfig.selfEvolutionPolicy;
    }
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
    const skillIds = this.extractConversationSkillIds(nodes, relevantEdges);

    for (const edge of relevantEdges) {
      const sourceNode = nodesById.get(edge.source) ?? edge;
      const nodeId =
        typeof sourceNode?.id === 'string' ? sourceNode.id : undefined;
      if (
        nodeId &&
        compiledNodeIds.has(`${nodeId}:${edge.targetHandle ?? '*'}`)
      ) {
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
            config.routingConfig = this.extractRoutingConfig(data, {
              routingNodeId: nodeId,
              nodesById,
              edges,
            });
          }
          break;
        }

        case 'sandbox': {
          if (
            runtimeMode === 'sandbox' &&
            (!agentMainNode || targetHandle === 'sandbox-in')
          ) {
            const sandboxConfig = this.extractSandboxConfig(data);
            if (sandboxConfig) {
              config.sandboxConfig = sandboxConfig;
            }
          }
          break;
        }

        case 'memory': {
          if (!agentMainNode || targetHandle === 'memory-in') {
            const memoryInstanceId =
              data.memoryInstanceId ?? data.config?.memoryInstanceId;
            if (typeof memoryInstanceId === 'string' && memoryInstanceId) {
              memoryInstanceIds.push(memoryInstanceId);
            }
          }
          break;
        }

        case 'skill': {
          // Skill IDs are collected by extractConversationSkillIds() above
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
    if (knowledgeBindings.length > 0)
      config.knowledgeBindings = knowledgeBindings;
    if (subAgents.length > 0) config.subAgents = subAgents;
    if (inputPreprocessors.length > 0)
      config.inputPreprocessors = inputPreprocessors;
    if (skillIds.length > 0) config.skillIds = skillIds;
    if (memoryInstanceIds.length > 0)
      config.memoryInstanceIds = memoryInstanceIds;

    // 解析 workspace → sandbox 的 volume 边，注入 restoreWorkspaceId
    if (config.sandboxConfig) {
      for (const edge of edges) {
        if (!edge?.source || !edge?.target) continue;
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        if (!sourceNode || !targetNode) continue;

        const sourceType = this.resolveNodeType(sourceNode);
        const targetType = this.resolveNodeType(targetNode);

        if (sourceType === 'workspace' && targetType === 'sandbox') {
          const wsData = this.resolveNodeData(sourceNode);
          const workspaceId = wsData.workspaceId ?? wsData.config?.workspaceId;
          if (typeof workspaceId === 'string' && workspaceId) {
            config.sandboxConfig.restoreWorkspaceId = workspaceId;
          }
        }
      }
    }

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

      await this.assertRuntimeModeConstraints(
        dbClient,
        agent.runtimeMode,
        agent.nodes ?? [],
        agent.edges ?? [],
      );

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

      await this.assertRuntimeModeConstraints(
        dbClient,
        agent.runtimeMode,
        agent.nodes ?? [],
        agent.edges ?? [],
      );

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

      this.logger.log(
        `Agent definition published: ${agentId} → version ${version.id}`,
      );
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
    const canvasMetadata = this.extractCanvasMetadata(agent.metadata);

    return {
      runtimeMode: agent.runtimeMode,
      nodes: agent.nodes,
      edges: agent.edges,
      viewport: agent.viewport,
      systemPrompt: agent.systemPrompt,
      sandboxConfig: this.derivePersistedSandboxConfig(
        agent.nodes ?? [],
        agent.edges ?? [],
        agent.sandboxConfig,
        agent.runtimeMode,
      ),
      workspaceSnapshotId: agent.workspaceSnapshotId,
      metadata: {
        nodeCount: agent.nodes?.length ?? 0,
        edgeCount: agent.edges?.length ?? 0,
        createdFromVersion: agent.version,
        releaseNotes,
        ...(canvasMetadata.inputSchema === undefined
          ? {}
          : { inputSchema: canvasMetadata.inputSchema }),
        ...(canvasMetadata.memoryInstanceIds === undefined
          ? {}
          : { memoryInstanceIds: canvasMetadata.memoryInstanceIds }),
        ...(canvasMetadata.sandboxLifecycle === undefined
          ? {}
          : { sandboxLifecycle: canvasMetadata.sandboxLifecycle }),
      },
    };
  }

  private extractCanvasMetadata(metadata: Record<string, unknown> | null): {
    inputSchema?: Record<string, unknown>;
    memoryInstanceIds?: string[];
    sandboxLifecycle?: 'session' | 'persistent';
  } {
    const inputSchema =
      metadata?.inputSchema &&
      typeof metadata.inputSchema === 'object' &&
      !Array.isArray(metadata.inputSchema)
        ? (metadata.inputSchema as Record<string, unknown>)
        : undefined;

    const memoryInstanceIds = Array.isArray(metadata?.memoryInstanceIds)
      ? metadata.memoryInstanceIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : undefined;

    const sandboxLifecycle =
      metadata?.sandboxLifecycle === 'session' ||
      metadata?.sandboxLifecycle === 'persistent'
        ? metadata.sandboxLifecycle
        : undefined;

    return {
      inputSchema,
      memoryInstanceIds,
      sandboxLifecycle,
    };
  }

  private extractModelConfig(data: Record<string, any>): AgentModelConfig {
    const modelConfigId = this.readFirstString(
      data.llmConfigId,
      data.llm_config_id,
      data.modelConfigId,
      data.model_config_id,
      data.modelId,
      data.model_id,
    );
    const modelName = this.readFirstString(
      data.modelName,
      data.model_name,
      data.modelId,
      data.model_id,
    );
    const apiKeyId = this.readNullableString(data.apiKeyId ?? data.api_key_id);
    const endpointUrl = this.readNullableString(
      data.endpointUrl ?? data.endpoint_url,
    );
    const authMethod = this.readNullableString(
      data.authMethod ?? data.auth_method,
    );
    const authConfig =
      data.authConfig &&
      typeof data.authConfig === 'object' &&
      !Array.isArray(data.authConfig)
        ? (data.authConfig as Record<string, unknown>)
        : data.auth_config &&
            typeof data.auth_config === 'object' &&
            !Array.isArray(data.auth_config)
          ? (data.auth_config as Record<string, unknown>)
          : undefined;

    return {
      modelId: modelConfigId ?? '',
      ...(typeof data.provider === 'string' && data.provider.length > 0
        ? { provider: data.provider }
        : {}),
      ...(modelName ? { modelName } : {}),
      ...(apiKeyId !== undefined ? { apiKeyId } : {}),
      ...(endpointUrl !== undefined ? { endpointUrl } : {}),
      ...(authMethod !== undefined ? { authMethod } : {}),
      ...(authConfig ? { authConfig } : {}),
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
        data.inputSchema &&
        typeof data.inputSchema === 'object' &&
        !Array.isArray(data.inputSchema)
          ? data.inputSchema
          : undefined;
      const portMapping =
        data.portMapping &&
        typeof data.portMapping === 'object' &&
        !Array.isArray(data.portMapping)
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
    }

    if (nodeType === 'http-tool') {
      const url = data.url;
      const method = data.method;
      if (typeof url === 'string' && url.length > 0) {
        return {
          ...baseBinding,
          toolType: 'http',
          url,
          ...(typeof method === 'string' && method.length > 0
            ? { method: method as AgentHttpToolBinding['method'] }
            : {}),
        };
      }

      return {
        ...baseBinding,
        ...(typeof url === 'string' && url.length > 0 ? { url } : {}),
        ...(typeof method === 'string' && method.length > 0
          ? { method: method as AgentHttpToolBinding['method'] }
          : {}),
      };
    }

    if (nodeType === 'code-tool') {
      const language = data.language;
      const code = data.code;
      const timeout =
        typeof data.timeout === 'number' ? data.timeout : undefined;
      if (typeof language === 'string' && language.length > 0) {
        return {
          ...baseBinding,
          toolType: 'code',
          language: language as AgentCodeToolBinding['language'],
          ...(typeof code === 'string' ? { code } : {}),
          ...(timeout !== undefined ? { timeout } : {}),
        };
      }

      return {
        ...baseBinding,
        ...(typeof language === 'string' && language.length > 0
          ? { language: language as AgentCodeToolBinding['language'] }
          : {}),
        ...(typeof code === 'string' ? { code } : {}),
        ...(timeout !== undefined ? { timeout } : {}),
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
      similarityThreshold:
        data.similarityThreshold ?? data.similarity_threshold,
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

    const nestedConfig = this.asRecord(data.config);
    const directConfig = this.asRecord(data.preprocessorConfig);
    const nestedInnerConfig = nestedConfig
      ? (this.asRecord(nestedConfig.config) ??
        this.asRecord(nestedConfig.preprocessorConfig))
      : null;
    const nestedInlineConfig = nestedConfig
      ? Object.fromEntries(
          Object.entries(nestedConfig).filter(
            ([key]) => key !== 'config' && key !== 'preprocessorConfig',
          ),
        )
      : null;
    const inlineConfig = this.buildInlineInputPreprocessorConfig(data);
    const resolvedConfig =
      directConfig ??
      (nestedInnerConfig && nestedInlineConfig
        ? { ...nestedInnerConfig, ...nestedInlineConfig }
        : (nestedInnerConfig ??
          nestedInlineConfig ??
          inlineConfig ??
          undefined));

    return {
      type,
      ...(resolvedConfig ? { config: resolvedConfig } : {}),
    };
  }

  private extractRoutingConfig(
    data: Record<string, any>,
    options?: {
      routingNodeId?: string;
      nodesById?: Map<string, any>;
      edges?: any[];
    },
  ): AgentRoutingConfig {
    const directCandidateModelIds = this.readStringArray(
      data.candidateModelIds ?? data.candidate_model_ids,
    );
    const connectedCandidateModelIds = this.extractConnectedRoutingModelIds(
      data,
      options,
    );
    const candidateModelIds =
      connectedCandidateModelIds.length > 0
        ? connectedCandidateModelIds
        : directCandidateModelIds;

    return {
      strategy: data.strategy ?? 'FALLBACK_CHAIN',
      ...(candidateModelIds.length > 0 ? { candidateModelIds } : {}),
      fallbackModelId: data.fallbackModelId ?? data.fallback_model_id,
    };
  }

  private buildInlineInputPreprocessorConfig(
    data: Record<string, any>,
  ): Record<string, unknown> | null {
    const inlineConfig = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => {
        if (
          key === 'config' ||
          key === 'preprocessorConfig' ||
          key === 'nodeType' ||
          key === 'label' ||
          key === 'description' ||
          key === 'category' ||
          key === 'inputPorts' ||
          key === 'outputPorts' ||
          key === 'icon' ||
          key === 'colorToken'
        ) {
          return false;
        }

        return value !== undefined;
      }),
    );

    return Object.keys(inlineConfig).length > 0 ? inlineConfig : null;
  }

  private extractConnectedRoutingModelIds(
    data: Record<string, any>,
    options?: {
      routingNodeId?: string;
      nodesById?: Map<string, any>;
      edges?: any[];
    },
  ): string[] {
    if (
      !options?.routingNodeId ||
      !options.nodesById ||
      !options.edges?.length
    ) {
      return [];
    }

    const inboundEdges = options.edges.filter(
      (edge) =>
        edge &&
        edge.target === options.routingNodeId &&
        typeof edge.source === 'string',
    );

    if (inboundEdges.length === 0) {
      return [];
    }

    const modelIdsByPort = new Map<string, string[]>();
    const fallbackPriority = this.readStringArray(data.fallbackPriority);
    const inputPortOrder = Array.isArray(data.inputPorts)
      ? data.inputPorts
          .map((port) =>
            port && typeof port === 'object' && typeof port.id === 'string'
              ? port.id
              : null,
          )
          .filter(
            (portId): portId is string =>
              typeof portId === 'string' && portId.startsWith('model-in-'),
          )
      : [];

    for (const edge of inboundEdges) {
      const sourceNode = options.nodesById.get(edge.source);
      if (!sourceNode || this.resolveNodeType(sourceNode) !== 'llm-model') {
        continue;
      }

      const sourceData = this.resolveNodeData(sourceNode);
      const modelConfig = this.extractModelConfig(sourceData);
      if (!modelConfig.modelId) {
        continue;
      }

      const portId =
        typeof edge.targetHandle === 'string' && edge.targetHandle.length > 0
          ? edge.targetHandle
          : 'model-in-0';
      const current = modelIdsByPort.get(portId) ?? [];
      if (!current.includes(modelConfig.modelId)) {
        current.push(modelConfig.modelId);
        modelIdsByPort.set(portId, current);
      }
    }

    const orderedPortIds =
      fallbackPriority.length > 0
        ? fallbackPriority
        : inputPortOrder.length > 0
          ? inputPortOrder
          : [...modelIdsByPort.keys()].sort((left, right) => {
              const leftIndex = this.extractRoutingPortIndex(left);
              const rightIndex = this.extractRoutingPortIndex(right);
              if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
              }
              return left.localeCompare(right);
            });

    const orderedModelIds: string[] = [];
    const seen = new Set<string>();
    for (const portId of orderedPortIds) {
      for (const modelId of modelIdsByPort.get(portId) ?? []) {
        if (!seen.has(modelId)) {
          seen.add(modelId);
          orderedModelIds.push(modelId);
        }
      }
    }

    for (const modelIds of modelIdsByPort.values()) {
      for (const modelId of modelIds) {
        if (!seen.has(modelId)) {
          seen.add(modelId);
          orderedModelIds.push(modelId);
        }
      }
    }

    return orderedModelIds;
  }

  private extractRoutingPortIndex(portId: string): number {
    const match = /^model-in-(\d+)$/.exec(portId);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  private extractAgentMainRuntimeConfig(
    data: Record<string, any>,
    runtimeMode: AgentRuntimeMode,
  ): Pick<AgentRuntimeConfig, 'nativeToolPolicy' | 'selfEvolutionPolicy'> {
    const nativeToolPolicyRecord = this.asRecord(data.nativeToolPolicy);
    const selfEvolutionPolicyRecord = this.asRecord(data.selfEvolutionPolicy);

    const nativeToolPolicy =
      runtimeMode === 'sandbox' &&
      nativeToolPolicyRecord &&
      this.hasAnyBoolean(
        nativeToolPolicyRecord.readEnabled,
        nativeToolPolicyRecord.writeEnabled,
        nativeToolPolicyRecord.editEnabled,
        nativeToolPolicyRecord.terminalEnabled,
      )
        ? ({
            readEnabled: this.readBoolean(
              nativeToolPolicyRecord.readEnabled,
              true,
            ),
            writeEnabled: this.readBoolean(
              nativeToolPolicyRecord.writeEnabled,
              true,
            ),
            editEnabled: this.readBoolean(
              nativeToolPolicyRecord.editEnabled,
              true,
            ),
            terminalEnabled: this.readBoolean(
              nativeToolPolicyRecord.terminalEnabled,
              true,
            ),
          } satisfies AgentNativeToolPolicy)
        : undefined;

    const selfEvolutionPolicy =
      selfEvolutionPolicyRecord &&
      this.hasAnyBoolean(
        selfEvolutionPolicyRecord.enabled,
        selfEvolutionPolicyRecord.resourceManagement,
        selfEvolutionPolicyRecord.externalEditing,
        selfEvolutionPolicyRecord.sandboxManagement,
      )
        ? ({
            enabled: this.readBoolean(selfEvolutionPolicyRecord.enabled, false),
            resourceManagement: this.readBoolean(
              selfEvolutionPolicyRecord.resourceManagement,
              false,
            ),
            externalEditing: this.readBoolean(
              selfEvolutionPolicyRecord.externalEditing,
              false,
            ),
            sandboxManagement: this.readBoolean(
              selfEvolutionPolicyRecord.sandboxManagement,
              false,
            ),
          } satisfies AgentSelfEvolutionPolicy)
        : undefined;

    return {
      ...(nativeToolPolicy ? { nativeToolPolicy } : {}),
      ...(selfEvolutionPolicy ? { selfEvolutionPolicy } : {}),
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
      data.config &&
      typeof data.config === 'object' &&
      !Array.isArray(data.config)
        ? (data.config as Record<string, any>)
        : {};

    return {
      ...config,
      ...data,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private hasAnyBoolean(...values: unknown[]): boolean {
    return values.some((value) => typeof value === 'boolean');
  }

  private readBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private extractConversationSkillIds(nodes: any[], edges: any[]): string[] {
    const skillNodes = nodes.filter(
      (node) => this.resolveNodeType(node) === 'skill',
    );
    if (!skillNodes.length) {
      return [];
    }

    const agentMainNode = nodes.find(
      (node) => this.resolveNodeType(node) === 'agent-main',
    );
    const agentMainId =
      typeof agentMainNode?.id === 'string' ? agentMainNode.id : null;
    const activeSkillNodes = agentMainId
      ? skillNodes.filter((node) =>
          edges.some(
            (edge) =>
              edge?.source === node.id &&
              edge?.target === agentMainId &&
              edge?.targetHandle === 'skills-in',
          ),
        )
      : skillNodes;

    return [
      ...new Set(activeSkillNodes.map((node) => this.extractSkillId(node))),
    ].filter(
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

    const hasTimeoutHours =
      typeof data.timeout === 'number' &&
      Number.isFinite(data.timeout) &&
      data.timeout > 0;
    const hasTimeoutSeconds =
      typeof data.timeoutSeconds === 'number' &&
      Number.isFinite(data.timeoutSeconds) &&
      data.timeoutSeconds > 0;
    const timeoutSeconds =
      hasTimeoutSeconds || !hasTimeoutHours
        ? normalizeSandboxTimeoutSeconds(
            data.timeoutSeconds,
            DEFAULT_AGENT_SANDBOX_TIMEOUT_SECONDS,
          )
        : undefined;
    const fallbackTimeoutSeconds =
      timeoutSeconds ?? DEFAULT_AGENT_SANDBOX_TIMEOUT_SECONDS;
    const conversationIdleAutoEndMinutes =
      resolveSandboxConversationIdleAutoEndMinutes(data);

    return {
      cpu: data.cpu ?? data.cpuLimit ?? 1,
      memory: data.memory ?? data.memoryLimitMb ?? 512,
      disk: data.disk ?? data.diskLimitGb ?? 1,
      timeout:
        hasTimeoutHours && !hasTimeoutSeconds
          ? data.timeout
          : deriveSandboxTimeoutHours(fallbackTimeoutSeconds),
      ...(typeof timeoutSeconds === 'number' ? { timeoutSeconds } : {}),
      conversationIdleAutoEndMinutes,
      lifecycleMode: data.lifecycleMode,
      persistencePath: data.persistencePath,
      restoreWorkspaceId: data.restoreWorkspaceId,
      persistenceExpiryHours: data.persistenceExpiryHours,
      persistentSandboxId: data.persistentSandboxId,
    };
  }

  private derivePersistedSandboxConfig(
    nodes: any[],
    edges: any[],
    fallbackConfig?:
      | AgentRuntimeConfig['sandboxConfig']
      | Record<string, unknown>
      | null,
    runtimeMode: AgentRuntimeMode = 'sandbox',
  ): AgentRuntimeConfig['sandboxConfig'] | null {
    if (runtimeMode === 'no_sandbox') {
      return null;
    }

    return deriveAgentSandboxConfigFromCanvas(
      nodes as never,
      edges as never,
      fallbackConfig ?? null,
    );
  }

  private async assertRuntimeModeConstraints(
    dbClient: AgentDbClient,
    runtimeMode: AgentRuntimeMode,
    nodes: any[],
    edges: any[],
  ): Promise<void> {
    if (runtimeMode !== 'no_sandbox') {
      return;
    }

    const runtimeConfig = this.buildRuntimeConfigFromNodes(
      nodes,
      edges,
      undefined,
      runtimeMode,
    );
    const mcpServerConfigIds = Array.from(
      new Set(
        (runtimeConfig.tools ?? []).flatMap((tool) =>
          typeof tool === 'object' &&
          tool !== null &&
          'mcpServerConfigId' in tool &&
          typeof tool.mcpServerConfigId === 'string' &&
          tool.mcpServerConfigId.trim().length > 0
            ? [tool.mcpServerConfigId.trim()]
            : [],
        ),
      ),
    );

    if (mcpServerConfigIds.length === 0) {
      return;
    }

    const configs = await dbClient
      .select({
        id: schema.mcpServerConfigs.id,
        name: schema.mcpServerConfigs.name,
        transportType: schema.mcpServerConfigs.transportType,
      })
      .from(schema.mcpServerConfigs)
      .where(inArray(schema.mcpServerConfigs.id, mcpServerConfigIds));

    const stdioConfigs = configs.filter(
      (config) => config.transportType === 'stdio',
    );
    if (stdioConfigs.length === 0) {
      return;
    }

    throw new AgentPublishValidationException(
      `无 sandbox Agent 只能绑定 HTTP MCP，以下 MCP server 使用了 stdio: ${stdioConfigs
        .map((config) => config.name)
        .join('、')}`,
    );
  }

  private readFirstString(...candidates: unknown[]): string | undefined {
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return undefined;
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

  private readNullableString(value: unknown): string | null | undefined {
    if (value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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
  const sandboxConfig =
    version.snapshot.runtimeMode === 'no_sandbox'
      ? null
      : deriveAgentSandboxConfigFromCanvas(
          version.snapshot.nodes,
          version.snapshot.edges,
          version.snapshot.sandboxConfig ?? null,
        );

  return {
    id: version.id,
    agentDefinitionId: version.agentDefinitionId,
    versionNumber: version.versionNumber,
    label: version.label,
    snapshot: {
      ...version.snapshot,
      runtimeMode: version.snapshot.runtimeMode ?? 'sandbox',
      ...(sandboxConfig ? { sandboxConfig } : {}),
    },
    publishedAt: version.publishedAt?.toISOString() ?? null,
    archivedAt: version.archivedAt?.toISOString() ?? null,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
  };
}
