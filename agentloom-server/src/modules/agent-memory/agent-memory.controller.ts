import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { and, count, desc, eq, inArray, not, sql } from 'drizzle-orm';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentMemoryInstances,
  getTenantId,
  memoryEdges,
  memoryNodes,
  memoryPaths,
  memoryVersions,
} from '../../database/schema';
import { AuditLogService } from '../evidence/audit-log.service';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import {
  CreateMemoryAliasDto,
  CreateMemoryEdgeDto,
  CreateMemoryInstanceDto,
  CreateMemoryNodeDto,
  CreateMemoryPathDto,
  CreateMemoryVersionDto,
  ListAuditLogQueryDto,
  ListMemoryEdgesQueryDto,
  ListMemoryInstancesQueryDto,
  ListMemoryNodesQueryDto,
  ListMemoryPathsQueryDto,
  ListMemoryVersionsQueryDto,
  ListPendingReviewsQueryDto,
  MemorySearchQueryDto,
  ResolveUriQueryDto,
  ReviewVersionDto,
  RollbackVersionDto,
  UpdateMemoryInstanceDto,
  BrowseQueryDto,
  AddGlossaryKeywordDto,
  RemoveGlossaryKeywordDto,
} from './dto';
import { BootProtocolService } from './services/boot-protocol.service';
import { GlossaryService } from './services/glossary.service';
import { MemoryEdgeService } from './services/memory-edge.service';
import { MemoryFusionService } from './services/memory-fusion.service';
import { MemoryNodeService } from './services/memory-node.service';
import { MemorySearchService } from './services/memory-search.service';
import { MemoryVersionService } from './services/memory-version.service';
import { PathResolverService } from './services/path-resolver.service';

@ApiTags('Memory')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('memory-instances')
export class AgentMemoryController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly memoryNodeService: MemoryNodeService,
    private readonly memoryEdgeService: MemoryEdgeService,
    private readonly memoryVersionService: MemoryVersionService,
    private readonly pathResolverService: PathResolverService,
    private readonly glossaryService: GlossaryService,
    private readonly memorySearchService: MemorySearchService,
    private readonly bootProtocolService: BootProtocolService,
    private readonly memoryFusionService: MemoryFusionService,
    private readonly auditLogService: AuditLogService,
    private readonly resourceSourceService: ResourceSourceService,
  ) {}

  // ─── Memory Instance CRUD ────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '创建记忆实例' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createInstance(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateMemoryInstanceDto,
  ) {
    const tenantDb = getTenantDb(this.db);

    const [instance] = await tenantDb
      .insert(agentMemoryInstances)
      .values({
        tenantId: getTenantId,
        name: dto.name,
        description: dto.description ?? null,
        config: dto.config ?? {},
        systemPromptOverride: dto.systemPromptOverride ?? null,
        validDomains: dto.validDomains ?? [],
        coreMemoryUris: dto.coreMemoryUris ?? [],
        createdBy: userId,
      })
      .returning();

    return {
      data: {
        ...instance,
        sourceKind: 'manual' as const,
      },
    };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询记忆实例列表' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listInstances(
    @CurrentTenant() tenantId: string,
    @Query() query: ListMemoryInstancesQueryDto,
  ) {
    const tenantDb = getTenantDb(this.db);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (query.status) {
      conditions.push(eq(agentMemoryInstances.status, query.status));
    }

    if (query.search) {
      conditions.push(
        sql`${agentMemoryInstances.name} ILIKE ${'%' + query.search + '%'}`,
      );
    }

    if (query.sourceKind) {
      const importedExistsCondition =
        this.resourceSourceService.buildShareImportedExistsCondition({
          resourceType: 'memory_instance',
          resourceIdColumn: agentMemoryInstances.id,
        });

      conditions.push(
        query.sourceKind === 'share_imported'
          ? importedExistsCondition
          : not(importedExistsCondition),
      );
    }

    const predicate = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(agentMemoryInstances)
        .where(predicate)
        .orderBy(desc(agentMemoryInstances.updatedAt))
        .limit(pageSize)
        .offset(offset),
      tenantDb
        .select({ total: count() })
        .from(agentMemoryInstances)
        .where(predicate),
    ]);

    const total = countRow?.total ?? 0;

    // 批量查询每个实例的节点数
    const instanceIds = data.map((d) => d.id);
    let nodeCountMap: Record<string, number> = {};
    if (instanceIds.length > 0) {
      const nodeCounts = await tenantDb
        .select({
          instanceId: memoryNodes.instanceId,
          total: count(),
        })
        .from(memoryNodes)
        .where(inArray(memoryNodes.instanceId, instanceIds))
        .groupBy(memoryNodes.instanceId);
      nodeCountMap = Object.fromEntries(
        nodeCounts.map((r) => [r.instanceId, r.total]),
      );
    }
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'memory_instance',
      instanceIds,
    );

    return {
      data: data.map((d) => ({
        ...d,
        nodeCount: nodeCountMap[d.id] ?? 0,
        sourceKind: sourceKindMap.get(d.id) ?? 'manual',
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询记忆实例详情（含统计信息）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '实例不存在' })
  async getInstance(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const tenantDb = getTenantDb(this.db);

    const [instance] = await tenantDb
      .select()
      .from(agentMemoryInstances)
      .where(eq(agentMemoryInstances.id, id))
      .limit(1);

    if (!instance) {
      throw new NotFoundException(`Memory instance ${id} not found`);
    }

    const [[nodeCountRow], [edgeCountRow], [latestActivityRow]] =
      await Promise.all([
        tenantDb
          .select({ total: count() })
          .from(memoryNodes)
          .where(eq(memoryNodes.instanceId, id)),
        tenantDb
          .select({ total: count() })
          .from(memoryEdges)
          .where(eq(memoryEdges.instanceId, id)),
        tenantDb
          .select({ latestAt: sql<string>`MAX(${memoryNodes.createdAt})` })
          .from(memoryNodes)
          .where(eq(memoryNodes.instanceId, id)),
      ]);
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'memory_instance',
      [id],
    );

    return {
      data: {
        ...instance,
        sourceKind: sourceKindMap.get(id) ?? 'manual',
        stats: {
          nodeCount: nodeCountRow?.total ?? 0,
          edgeCount: edgeCountRow?.total ?? 0,
          latestActivity: latestActivityRow?.latestAt ?? null,
        },
      },
    };
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '更新记忆实例' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '实例不存在' })
  async updateInstance(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryInstanceDto,
  ) {
    const tenantDb = getTenantDb(this.db);

    const updates: Record<string, unknown> = {
      updatedAt: sql`NOW()`,
    };

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.config !== undefined) updates.config = dto.config;
    if (dto.systemPromptOverride !== undefined)
      updates.systemPromptOverride = dto.systemPromptOverride;
    if (dto.validDomains !== undefined) updates.validDomains = dto.validDomains;
    if (dto.coreMemoryUris !== undefined)
      updates.coreMemoryUris = dto.coreMemoryUris;
    if (dto.status !== undefined) updates.status = dto.status;

    const [updated] = await tenantDb
      .update(agentMemoryInstances)
      .set(updates)
      .where(eq(agentMemoryInstances.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Memory instance ${id} not found`);
    }

    return { data: updated };
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除记忆实例（级联清理所有关联数据）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '实例不存在' })
  async deleteInstance(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const tenantDb = getTenantDb(this.db);

    const [deleted] = await tenantDb
      .delete(agentMemoryInstances)
      .where(eq(agentMemoryInstances.id, id))
      .returning({ id: agentMemoryInstances.id });

    if (!deleted) {
      throw new NotFoundException(`Memory instance ${id} not found`);
    }
  }

  // ─── Graph Operations ────────────────────────────────────────────────

  @Get(':id/nodes')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询实例下的节点列表' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listNodes(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: ListMemoryNodesQueryDto,
  ) {
    const result = await this.memoryNodeService.listNodes(id, {
      page: query.page,
      limit: query.pageSize,
      contentType: query.contentType,
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      data: result.data,
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get(':id/nodes/:nodeId')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询节点详情（含版本历史和关联边）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async getNode(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
  ) {
    const [node, versions, childEdges, parentEdges] = await Promise.all([
      this.memoryNodeService.getNode(nodeId),
      this.memoryVersionService.getVersionHistory(nodeId),
      this.memoryEdgeService.getChildEdges(nodeId),
      this.memoryEdgeService.getParentEdges(nodeId),
    ]);

    return {
      data: {
        ...node,
        versions,
        edges: {
          children: childEdges,
          parents: parentEdges,
        },
      },
    };
  }

  @Post(':id/nodes')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '创建记忆节点' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createNode(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateMemoryNodeDto,
  ) {
    const node = await this.memoryNodeService.createNode(id, {
      contentType: dto.contentType,
      metadata: dto.metadata,
      disclosureLevel: dto.disclosureLevel,
    });

    return { data: node };
  }

  @Get(':id/nodes/:nodeId/children')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询子节点列表（通过边关联）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '父节点 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listChildNodes(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
  ) {
    const edges = await this.memoryEdgeService.getChildEdges(nodeId);

    return { data: edges };
  }

  @Get(':id/resolve')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'URI 解析（通过 PathResolverService）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '解析成功' })
  @ApiResponse({ status: 404, description: 'URI 无法解析' })
  async resolveUri(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: ResolveUriQueryDto,
  ) {
    const result = await this.pathResolverService.resolveUri(id, query.uri);

    return { data: result };
  }

  @Get(':id/browse')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '浏览记忆节点（含子节点和面包屑）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '浏览成功' })
  async browse(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: BrowseQueryDto,
  ) {
    const tenantDb = getTenantDb(this.db);
    const uri = query.uri;

    // Parse domain and path from URI
    const sepIdx = uri.indexOf('://');
    const domain = sepIdx > 0 ? uri.slice(0, sepIdx) : '';
    const pathString = sepIdx > 0 ? uri.slice(sepIdx + 3) : '';

    // Build breadcrumbs
    const segments = pathString ? pathString.split('/') : [];
    const breadcrumbs = segments.map((seg, i) => ({
      path: segments.slice(0, i + 1).join('/'),
      label: seg,
    }));

    // Resolve main node (null if browsing domain root)
    let enrichedNode: Record<string, unknown> | null = null;
    if (pathString) {
      try {
        const node = await this.pathResolverService.resolveUri(id, uri);
        enrichedNode = await this.enrichNodeForBrowse(node, domain, pathString);
      } catch (e) {
        if (!(e instanceof NotFoundException)) throw e;
      }
    }

    // Get child paths
    const childPaths = await this.pathResolverService.listChildren(id, uri);
    const children: Record<string, unknown>[] = [];

    for (const childPath of childPaths) {
      const childName =
        childPath.pathString.split('/').pop() ?? childPath.pathString;

      if (query.navOnly) {
        // Lightweight data for sidebar tree navigation
        const [childCountRow] = await tenantDb
          .select({ total: count() })
          .from(memoryEdges)
          .where(eq(memoryEdges.parentNodeId, childPath.nodeId));

        children.push({
          id: childPath.nodeId,
          nodeUuid: childPath.nodeId,
          name: childName,
          path: childPath.pathString,
          domain,
          content: null,
          contentType: 'text',
          priority: 0,
          disclosure: '0',
          isVirtual: false,
          aliases: [],
          glossaryKeywords: [],
          glossaryMatches: [],
          approxChildrenCount: childCountRow?.total ?? 0,
          versionCount: 0,
          latestVersion: 0,
          createdAt: childPath.createdAt,
          updatedAt: childPath.createdAt,
        });
      } else {
        // Full enrichment for children
        const [childNode] = await tenantDb
          .select()
          .from(memoryNodes)
          .where(eq(memoryNodes.id, childPath.nodeId))
          .limit(1);

        if (childNode) {
          children.push(
            await this.enrichNodeForBrowse(
              childNode,
              domain,
              childPath.pathString,
            ),
          );
        }
      }
    }

    return {
      data: {
        node: enrichedNode,
        children,
        breadcrumbs,
      },
    };
  }

  @Get(':id/domains')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取记忆域列表（含根节点计数）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listDomains(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const tenantDb = getTenantDb(this.db);

    const rows = await tenantDb
      .select({
        domain: memoryPaths.domain,
        rootCount: count(),
      })
      .from(memoryPaths)
      .where(
        and(
          eq(memoryPaths.instanceId, id),
          sql`${memoryPaths.pathString} NOT LIKE '%/%'`,
        ),
      )
      .groupBy(memoryPaths.domain);

    return { data: rows };
  }

  @Get(':id/search')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '全文搜索记忆节点' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '搜索成功' })
  async search(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: MemorySearchQueryDto,
  ) {
    const results = await this.memorySearchService.search(id, {
      query: query.q,
      limit: query.limit,
      offset: query.offset,
      minDisclosure: query.minDisclosure,
    });

    return { data: results };
  }

  @Get(':id/graph')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取完整图数据（用于 ReactFlow 渲染）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async getGraph(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const tenantDb = getTenantDb(this.db);

    const [nodes, edges] = await Promise.all([
      tenantDb.select().from(memoryNodes).where(eq(memoryNodes.instanceId, id)),
      tenantDb.select().from(memoryEdges).where(eq(memoryEdges.instanceId, id)),
    ]);

    return { data: { nodes, edges } };
  }

  // ─── Path/Alias Operations ──────────────────────────────────────────

  @Post(':id/paths')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '创建标准路径绑定' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createPath(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateMemoryPathDto,
  ) {
    const path = await this.pathResolverService.createPath(
      id,
      dto.domain,
      dto.pathString,
      dto.nodeId,
    );

    return { data: path };
  }

  @Post(':id/aliases')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '添加别名 URI' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createAlias(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateMemoryAliasDto,
  ) {
    const alias = await this.pathResolverService.addAlias(
      id,
      dto.sourceUri,
      dto.aliasUri,
    );

    return { data: alias };
  }

  @Delete(':id/paths/:pathId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除路径绑定' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'pathId', description: '路径 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '路径不存在' })
  async deletePath(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('pathId') pathId: string,
  ) {
    const tenantDb = getTenantDb(this.db);

    const [deleted] = await tenantDb
      .delete(memoryPaths)
      .where(and(eq(memoryPaths.id, pathId), eq(memoryPaths.instanceId, id)))
      .returning({ id: memoryPaths.id });

    if (!deleted) {
      throw new NotFoundException(`Memory path ${pathId} not found`);
    }
  }

  @Get(':id/paths')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询路径绑定列表' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listPaths(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: ListMemoryPathsQueryDto,
  ) {
    const tenantDb = getTenantDb(this.db);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(memoryPaths.instanceId, id)];

    if (query.domain) {
      conditions.push(eq(memoryPaths.domain, query.domain));
    }

    const predicate = and(...conditions);

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(memoryPaths)
        .where(predicate)
        .orderBy(desc(memoryPaths.createdAt))
        .limit(pageSize)
        .offset(offset),
      tenantDb.select({ total: count() }).from(memoryPaths).where(predicate),
    ]);

    const total = countRow?.total ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ─── Glossary Operations ────────────────────────────────────────────

  @Post(':id/nodes/:nodeId/glossary')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '添加术语表关键词' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '关键词已存在' })
  async addGlossaryKeyword(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: AddGlossaryKeywordDto,
  ) {
    const keyword = await this.glossaryService.addKeyword(
      id,
      dto.keyword,
      nodeId,
    );

    return { data: keyword };
  }

  @Delete(':id/nodes/:nodeId/glossary')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '移除术语表关键词' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  async removeGlossaryKeyword(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: RemoveGlossaryKeywordDto,
  ) {
    await this.glossaryService.removeKeyword(id, dto.keyword, nodeId);
  }

  // ─── Edge Operations ─────────────────────────────────────────────────

  @Get(':id/edges')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询实例下的边列表' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listEdges(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: ListMemoryEdgesQueryDto,
  ) {
    const tenantDb = getTenantDb(this.db);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(memoryEdges.instanceId, id)];

    if (query.parentNodeId) {
      conditions.push(eq(memoryEdges.parentNodeId, query.parentNodeId));
    }

    if (query.childNodeId) {
      conditions.push(eq(memoryEdges.childNodeId, query.childNodeId));
    }

    const predicate = and(...conditions);

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(memoryEdges)
        .where(predicate)
        .orderBy(desc(memoryEdges.createdAt))
        .limit(pageSize)
        .offset(offset),
      tenantDb.select({ total: count() }).from(memoryEdges).where(predicate),
    ]);

    const total = countRow?.total ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Post(':id/edges')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '创建边（含循环检测，循环返回 409）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '检测到循环引用' })
  async createEdge(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateMemoryEdgeDto,
  ) {
    const edge = await this.memoryEdgeService.createEdge(id, {
      parentNodeId: dto.parentNodeId,
      childNodeId: dto.childNodeId,
      name: dto.name,
      priority: dto.priority,
      disclosure: dto.disclosure,
    });

    return { data: edge };
  }

  @Delete(':id/edges/:edgeId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除边' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'edgeId', description: '边 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '边不存在' })
  async deleteEdge(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('edgeId') edgeId: string,
  ) {
    await this.memoryEdgeService.deleteEdge(edgeId);
  }

  // ─── Version Operations ──────────────────────────────────────────────

  @Get(':id/nodes/:nodeId/versions')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询节点版本历史' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listVersions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Query() query: ListMemoryVersionsQueryDto,
  ) {
    const versions = await this.memoryVersionService.getVersionHistory(nodeId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paged = versions.slice(start, start + pageSize);

    return {
      data: paged,
      meta: {
        page,
        pageSize,
        total: versions.length,
        totalPages: Math.ceil(versions.length / pageSize),
      },
    };
  }

  @Post(':id/nodes/:nodeId/versions')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '创建新版本（支持 create/patch/append 模式）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createVersion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: CreateMemoryVersionDto,
  ) {
    let version;

    switch (dto.mode) {
      case 'patch':
        version = await this.memoryVersionService.patchVersion(
          nodeId,
          { oldString: dto.oldString!, newString: dto.newString! },
          userId,
        );
        break;
      case 'append':
        version = await this.memoryVersionService.appendVersion(
          nodeId,
          dto.content!,
          userId,
        );
        break;
      case 'create':
      default:
        version = await this.memoryVersionService.createVersion(
          nodeId,
          dto.content!,
          userId,
        );
        break;
    }

    return { data: version };
  }

  @Post(':id/nodes/:nodeId/rollback')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '回滚到指定版本' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiResponse({ status: 200, description: '回滚成功' })
  async rollbackVersion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: RollbackVersionDto,
  ) {
    const version = await this.memoryVersionService.rollbackToVersion(
      nodeId,
      dto.targetVersionId,
      userId,
    );

    return { data: version };
  }

  // ─── Audit/Review ────────────────────────────────────────────────────

  @Get(':id/audit')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询记忆实例变更审计日志' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listAuditLogs(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: ListAuditLogQueryDto,
  ) {
    const tenantDb = getTenantDb(this.db);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    // 查询版本变更记录作为审计条目
    const conditions = [
      sql`${memoryVersions.nodeId} IN (
        SELECT ${memoryNodes.id} FROM ${memoryNodes}
        WHERE ${memoryNodes.instanceId} = ${id}
      )`,
    ];

    const auditPredicate = and(...conditions);

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(memoryVersions)
        .where(auditPredicate)
        .orderBy(desc(memoryVersions.createdAt))
        .limit(pageSize)
        .offset(offset),
      tenantDb
        .select({ total: count() })
        .from(memoryVersions)
        .where(auditPredicate),
    ]);

    const total = countRow?.total ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Post(':id/nodes/:nodeId/versions/:versionId/review')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '审核版本（批准或拒绝）' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiParam({ name: 'nodeId', description: '节点 ID' })
  @ApiParam({ name: 'versionId', description: '版本 ID' })
  @ApiResponse({ status: 200, description: '审核成功' })
  async reviewVersion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ReviewVersionDto,
  ) {
    const reviewDecision = dto.action === 'approve' ? 'approved' : 'rejected';

    const version = await this.memoryVersionService.updateReviewStatus(
      versionId,
      reviewDecision,
    );

    await this.auditLogService.record({
      tenantId,
      actorId: userId,
      actorType: 'user',
      eventType: `memory.version.${dto.action}`,
      resourceType: 'memory_version',
      resourceId: versionId,
      summary: `Version ${versionId} of node ${nodeId} ${dto.action}`,
      metadata: {
        instanceId: id,
        nodeId,
        action: dto.action,
      },
    });

    return { data: version };
  }

  @Get(':id/pending-reviews')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询待审核版本列表' })
  @ApiParam({ name: 'id', description: '记忆实例 ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listPendingReviews(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: ListPendingReviewsQueryDto,
  ) {
    const tenantDb = getTenantDb(this.db);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = [
      sql`${memoryVersions.nodeId} IN (
        SELECT ${memoryNodes.id} FROM ${memoryNodes}
        WHERE ${memoryNodes.instanceId} = ${id}
      )`,
      eq(memoryVersions.reviewStatus, 'pending'),
    ];

    const predicate = and(...conditions);

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(memoryVersions)
        .where(predicate)
        .orderBy(desc(memoryVersions.createdAt))
        .limit(pageSize)
        .offset(offset),
      tenantDb.select({ total: count() }).from(memoryVersions).where(predicate),
    ]);

    const total = countRow?.total ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private async enrichNodeForBrowse(
    node: {
      id: string;
      contentType: string;
      disclosureLevel: number;
      createdAt: Date;
    },
    domain: string,
    pathString: string,
  ): Promise<Record<string, unknown>> {
    const tenantDb = getTenantDb(this.db);

    const [paths, versions, [childCountRow], glossaryKeywords] =
      await Promise.all([
        this.pathResolverService.getPathsByNode(node.id),
        this.memoryVersionService.getVersionHistory(node.id),
        tenantDb
          .select({ total: count() })
          .from(memoryEdges)
          .where(eq(memoryEdges.parentNodeId, node.id)),
        this.glossaryService.getKeywordsForNode(node.id),
      ]);

    const latestVersion = versions[0] ?? null;
    const content = latestVersion?.content ?? null;
    const name = pathString.split('/').pop() ?? pathString;

    return {
      id: node.id,
      nodeUuid: node.id,
      name,
      path: pathString,
      domain,
      content,
      contentType: node.contentType,
      priority: 0,
      disclosure: String(node.disclosureLevel),
      isVirtual: versions.length === 0,
      aliases: paths.map((p) => `${p.domain}://${p.pathString}`),
      glossaryKeywords: glossaryKeywords.map((k) => k.keyword),
      glossaryMatches: [],
      approxChildrenCount: childCountRow?.total ?? 0,
      contentSnippet: content ? content.slice(0, 200) : undefined,
      versionCount: versions.length,
      latestVersion: latestVersion?.version ?? 0,
      createdAt: node.createdAt,
      updatedAt: latestVersion?.createdAt ?? node.createdAt,
    };
  }
}
