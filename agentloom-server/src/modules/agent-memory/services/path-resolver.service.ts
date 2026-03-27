import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  getTenantId,
  memoryEdges,
  memoryNodes,
  memoryPaths,
  type MemoryEdge,
  type MemoryNode,
  type MemoryPath,
} from '../../../database/schema';

const MAX_URI_DEPTH = 10;
const MAX_DOMAIN_LENGTH = 64;
const MAX_PATH_LENGTH = 512;

export interface DeleteMemoryPathResult {
  id: string;
  deleted: true;
}

interface ParsedUri {
  domain: string;
  pathString: string;
  segments: string[];
}

interface ResolvedUriTarget {
  node: MemoryNode;
  edgeId: string | null;
}

@Injectable()
export class PathResolverService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolveUri(instanceId: string, uri: string): Promise<MemoryNode> {
    const resolved = await this.resolveUriTarget(instanceId, uri);
    return resolved.node;
  }

  async createPath(
    instanceId: string,
    domain: string,
    pathString: string,
    nodeId: string,
    edgeId?: string,
  ): Promise<MemoryPath> {
    const tenantDb = getTenantDb(this.db);
    const parsed = this.parseUri(`${domain}://${pathString}`);
    const node = await this.findNodeOrThrow(nodeId);

    if (node.instanceId !== instanceId) {
      throw new BadRequestException(
        'Cannot create path across different memory instances',
      );
    }

    try {
      const [path] = await tenantDb
        .insert(memoryPaths)
        .values({
          instanceId,
          tenantId: getTenantId,
          domain: parsed.domain,
          pathString: parsed.pathString,
          nodeId,
          edgeId: edgeId ?? null,
        })
        .returning();

      return path;
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Memory path ${parsed.domain}://${parsed.pathString} already exists`,
        );
      }

      throw error;
    }
  }

  async addAlias(
    instanceId: string,
    existingUri: string,
    aliasUri: string,
  ): Promise<MemoryPath> {
    const existing = await this.resolveUriTarget(instanceId, existingUri);
    const alias = this.parseUri(aliasUri);

    return this.createPath(
      instanceId,
      alias.domain,
      alias.pathString,
      existing.node.id,
      existing.edgeId ?? undefined,
    );
  }

  async deletePath(
    instanceId: string,
    uri: string,
  ): Promise<DeleteMemoryPathResult> {
    const tenantDb = getTenantDb(this.db);
    const parsed = this.parseUri(uri);

    const [deletedPath] = await tenantDb
      .delete(memoryPaths)
      .where(
        and(
          eq(memoryPaths.instanceId, instanceId),
          eq(memoryPaths.domain, parsed.domain),
          eq(memoryPaths.pathString, parsed.pathString),
        ),
      )
      .returning({ id: memoryPaths.id });

    if (!deletedPath) {
      throw new NotFoundException(`Memory path ${uri} not found`);
    }

    return {
      id: deletedPath.id,
      deleted: true,
    };
  }

  async listChildren(
    instanceId: string,
    parentUri: string,
  ): Promise<MemoryPath[]> {
    const tenantDb = getTenantDb(this.db);
    const parsed = this.parseUri(parentUri, { allowEmptyPath: true });
    const paths = await tenantDb
      .select()
      .from(memoryPaths)
      .where(
        and(
          eq(memoryPaths.instanceId, instanceId),
          eq(memoryPaths.domain, parsed.domain),
        ),
      );

    if (!parsed.pathString) {
      return paths.filter((path) => !path.pathString.includes('/'));
    }

    const prefix = `${parsed.pathString}/`;

    return paths.filter((path) => {
      if (!path.pathString.startsWith(prefix)) {
        return false;
      }

      const suffix = path.pathString.slice(prefix.length);
      return suffix.length > 0 && !suffix.includes('/');
    });
  }

  async getPathsByNode(nodeId: string): Promise<MemoryPath[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryPaths)
      .where(eq(memoryPaths.nodeId, nodeId));
  }

  private async resolveUriTarget(
    instanceId: string,
    uri: string,
  ): Promise<ResolvedUriTarget> {
    const parsed = this.parseUri(uri);
    const cachedPath = await this.findPath(
      instanceId,
      parsed.domain,
      parsed.pathString,
    );

    if (cachedPath) {
      return {
        node: await this.findNodeOrThrow(cachedPath.nodeId),
        edgeId: cachedPath.edgeId,
      };
    }

    const traversed = await this.resolveByTraversal(instanceId, parsed);

    if (!traversed) {
      throw new NotFoundException(`Memory path ${uri} not found`);
    }

    await this.cachePath(
      instanceId,
      parsed.domain,
      parsed.pathString,
      traversed.node.id,
      traversed.edgeId,
    );

    return traversed;
  }

  private async resolveByTraversal(
    instanceId: string,
    parsed: ParsedUri,
  ): Promise<ResolvedUriTarget | null> {
    const rootPath = await this.findPath(
      instanceId,
      parsed.domain,
      parsed.segments[0],
    );

    if (!rootPath) {
      return null;
    }

    let currentNodeId = rootPath.nodeId;
    let currentEdgeId = rootPath.edgeId;

    for (let index = 1; index < parsed.segments.length; index += 1) {
      const edge = await this.findChildEdge(
        instanceId,
        currentNodeId,
        parsed.segments[index],
      );

      if (!edge) {
        return null;
      }

      currentNodeId = edge.childNodeId;
      currentEdgeId = edge.id;
    }

    return {
      node: await this.findNodeOrThrow(currentNodeId),
      edgeId: currentEdgeId,
    };
  }

  private async cachePath(
    instanceId: string,
    domain: string,
    pathString: string,
    nodeId: string,
    edgeId: string | null,
  ): Promise<void> {
    try {
      await this.createPath(
        instanceId,
        domain,
        pathString,
        nodeId,
        edgeId ?? undefined,
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        return;
      }

      throw error;
    }
  }

  private async findPath(
    instanceId: string,
    domain: string,
    pathString: string,
  ): Promise<MemoryPath | null> {
    const tenantDb = getTenantDb(this.db);
    const [path] = await tenantDb
      .select()
      .from(memoryPaths)
      .where(
        and(
          eq(memoryPaths.instanceId, instanceId),
          eq(memoryPaths.domain, domain),
          eq(memoryPaths.pathString, pathString),
        ),
      )
      .limit(1);

    return path ?? null;
  }

  private async findChildEdge(
    instanceId: string,
    parentNodeId: string,
    segment: string,
  ): Promise<MemoryEdge | null> {
    const tenantDb = getTenantDb(this.db);
    const [edge] = await tenantDb
      .select()
      .from(memoryEdges)
      .where(
        and(
          eq(memoryEdges.instanceId, instanceId),
          eq(memoryEdges.parentNodeId, parentNodeId),
          eq(memoryEdges.name, segment),
        ),
      )
      .orderBy(desc(memoryEdges.priority))
      .limit(1);

    return edge ?? null;
  }

  private async findNodeOrThrow(nodeId: string): Promise<MemoryNode> {
    const tenantDb = getTenantDb(this.db);
    const [node] = await tenantDb
      .select()
      .from(memoryNodes)
      .where(eq(memoryNodes.id, nodeId))
      .limit(1);

    if (!node) {
      throw new NotFoundException(`Memory node ${nodeId} not found`);
    }

    return node;
  }

  private parseUri(
    uri: string,
    options: { allowEmptyPath?: boolean } = {},
  ): ParsedUri {
    const separatorIndex = uri.indexOf('://');

    if (separatorIndex <= 0) {
      throw new BadRequestException('Invalid URI format');
    }

    const domain = uri.slice(0, separatorIndex).trim();
    const pathString = uri.slice(separatorIndex + 3).trim();

    if (!domain || domain.length > MAX_DOMAIN_LENGTH) {
      throw new BadRequestException('Invalid URI format');
    }

    if (!pathString && !options.allowEmptyPath) {
      throw new BadRequestException('Invalid URI format');
    }

    if (pathString.length > MAX_PATH_LENGTH) {
      throw new BadRequestException('Invalid URI format');
    }

    if (!pathString) {
      return {
        domain,
        pathString,
        segments: [],
      };
    }

    const segments = pathString.split('/');

    if (segments.some((segment) => segment.length === 0)) {
      throw new BadRequestException('Invalid URI format');
    }

    if (segments.length > MAX_URI_DEPTH) {
      throw new BadRequestException('URI resolution max depth exceeded');
    }

    return {
      domain,
      pathString,
      segments,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    const errorCode =
      error instanceof Error && 'code' in error
        ? (error as Record<string, unknown>).code
        : error instanceof Error &&
            'cause' in error &&
            typeof error.cause === 'object' &&
            error.cause !== null &&
            'code' in error.cause
          ? (error.cause as Record<string, unknown>).code
          : undefined;

    return error instanceof Error && errorCode === '23505';
  }
}
