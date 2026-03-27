import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq, inArray } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  agentMemoryInstances,
  memoryGlossaryKeywords,
  memoryPaths,
  memoryVersions,
  type MemoryGlossaryKeyword,
  type MemoryPath,
  type MemoryVersion,
} from '../../../database/schema';
import { MEMORY_SYSTEM_PROMPT_TEMPLATE } from '../constants/memory-system-prompt.template';
import { GlossaryService } from './glossary.service';
import { MemoryNodeService } from './memory-node.service';
import { PathResolverService } from './path-resolver.service';
import { MemoryVersionService } from './memory-version.service';

export interface MemoryBootSequenceResult {
  systemPrompt: string;
  boot: string | null;
  index: MemoryPath[];
  glossary: MemoryGlossaryKeyword[];
}

@Injectable()
export class BootProtocolService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pathResolverService: PathResolverService,
    private readonly memoryNodeService: MemoryNodeService,
    private readonly memoryVersionService: MemoryVersionService,
    private readonly glossaryService: GlossaryService,
  ) {}

  async boot(instanceId: string): Promise<string | null> {
    try {
      const resolvedNode = await this.pathResolverService.resolveUri(
        instanceId,
        'system://boot',
      );
      const latestVersion = await this.memoryVersionService.getLatestVersion(
        this.getResolvedNodeId(resolvedNode),
      );

      if (!latestVersion) {
        return null;
      }

      return latestVersion.content;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }

      throw error;
    }
  }

  private getResolvedNodeId(
    resolvedNode:
      | Awaited<ReturnType<PathResolverService['resolveUri']>>
      | { node: { id: string } },
  ): string {
    return 'node' in resolvedNode ? resolvedNode.node.id : resolvedNode.id;
  }

  async getIndex(instanceId: string): Promise<MemoryPath[]> {
    const tenantDb = getTenantDb(this.db);

    try {
      await this.pathResolverService.resolveUri(instanceId, 'system://index');
    } catch (error) {
      if (error instanceof NotFoundException) {
        return [];
      }

      throw error;
    }

    return tenantDb
      .select()
      .from(memoryPaths)
      .where(eq(memoryPaths.instanceId, instanceId))
      .orderBy(asc(memoryPaths.domain), asc(memoryPaths.pathString));
  }

  async getRecent(instanceId: string, limit = 10): Promise<MemoryVersion[]> {
    const tenantDb = getTenantDb(this.db);
    const nodes = await this.memoryNodeService.listNodes(instanceId, {
      page: 1,
      limit: Number.MAX_SAFE_INTEGER,
    });

    if (nodes.data.length === 0) {
      return [];
    }

    return tenantDb
      .select()
      .from(memoryVersions)
      .where(
        inArray(
          memoryVersions.nodeId,
          nodes.data.map((node) => node.id),
        ),
      )
      .orderBy(desc(memoryVersions.createdAt))
      .limit(limit);
  }

  async getGlossary(instanceId: string): Promise<MemoryGlossaryKeyword[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryGlossaryKeywords)
      .where(eq(memoryGlossaryKeywords.instanceId, instanceId))
      .orderBy(asc(memoryGlossaryKeywords.keyword));
  }

  async getMemorySystemPrompt(instanceId: string): Promise<string> {
    const tenantDb = getTenantDb(this.db);
    const [instance] = await tenantDb
      .select()
      .from(agentMemoryInstances)
      .where(eq(agentMemoryInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      throw new NotFoundException(`Memory instance ${instanceId} not found`);
    }

    const template =
      instance.systemPromptOverride || MEMORY_SYSTEM_PROMPT_TEMPLATE;

    return template
      .replaceAll('{{VALID_DOMAINS}}', instance.validDomains.join(', '))
      .replaceAll('{{CORE_MEMORY_URIS}}', instance.coreMemoryUris.join(', '));
  }

  async executeBootSequence(
    instanceId: string,
  ): Promise<MemoryBootSequenceResult> {
    const systemPrompt = await this.getMemorySystemPrompt(instanceId);
    const boot = await this.boot(instanceId);
    const index = await this.getIndex(instanceId);
    const glossary = await this.getGlossary(instanceId);

    return {
      systemPrompt,
      boot,
      index,
      glossary,
    };
  }
  protected get glossary(): GlossaryService {
    return this.glossaryService;
  }
}
