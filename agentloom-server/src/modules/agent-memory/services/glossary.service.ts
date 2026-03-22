import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  getTenantId,
  memoryGlossaryKeywords,
  memoryNodes,
  type MemoryGlossaryKeyword,
} from '../../../database/schema';

export interface GlossaryMatch {
  keyword: string;
  nodeId: string;
  position: number;
}

interface GlossaryCacheEntry {
  keyword: string;
  normalizedKeyword: string;
  nodeId: string;
}

interface GlossaryCache {
  entries: GlossaryCacheEntry[];
  stale: boolean;
  rebuildPromise?: Promise<void>;
}

@Injectable()
export class GlossaryService {
  private readonly caches = new Map<string, GlossaryCache>();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async addKeyword(
    instanceId: string,
    keyword: string,
    nodeId: string,
  ): Promise<MemoryGlossaryKeyword> {
    const tenantDb = getTenantDb(this.db);

    await this.ensureNodeBelongsToInstance(instanceId, nodeId);

    try {
      const [createdKeyword] = await tenantDb
        .insert(memoryGlossaryKeywords)
        .values({
          instanceId,
          tenantId: getTenantId,
          keyword,
          nodeId,
        })
        .returning();

      if (!createdKeyword) {
        throw new Error('Failed to create glossary keyword');
      }

      this.invalidateAutomaton(instanceId);

      return createdKeyword;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Glossary keyword "${keyword}" already bound to node ${nodeId}`,
        );
      }

      throw error;
    }
  }

  async removeKeyword(
    instanceId: string,
    keyword: string,
    nodeId: string,
  ): Promise<void> {
    const tenantDb = getTenantDb(this.db);

    await tenantDb
      .delete(memoryGlossaryKeywords)
      .where(
        and(
          eq(memoryGlossaryKeywords.instanceId, instanceId),
          eq(memoryGlossaryKeywords.keyword, keyword),
          eq(memoryGlossaryKeywords.nodeId, nodeId),
        ),
      )
      .returning({ id: memoryGlossaryKeywords.id });

    this.invalidateAutomaton(instanceId);
  }

  async scanText(instanceId: string, text: string): Promise<GlossaryMatch[]> {
    const cache = this.caches.get(instanceId);

    if (!cache) {
      await this.rebuildAutomaton(instanceId);
      return this.matchText(this.caches.get(instanceId)?.entries ?? [], text);
    }

    if (cache.stale && !cache.rebuildPromise) {
      cache.rebuildPromise = this.rebuildAutomaton(instanceId)
        .catch(() => undefined)
        .finally(() => {
          const currentCache = this.caches.get(instanceId);
          if (currentCache) {
            currentCache.rebuildPromise = undefined;
          }
        });
    }

    return this.matchText(cache.entries, text);
  }

  async rebuildAutomaton(instanceId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const keywords = await tenantDb
      .select()
      .from(memoryGlossaryKeywords)
      .where(eq(memoryGlossaryKeywords.instanceId, instanceId))
      .orderBy(memoryGlossaryKeywords.keyword);

    const entries = keywords
      .map((keywordRow) => ({
        keyword: keywordRow.keyword,
        normalizedKeyword: keywordRow.keyword.toLowerCase(),
        nodeId: keywordRow.nodeId,
      }))
      .sort((left, right) => right.keyword.length - left.keyword.length);

    this.caches.set(instanceId, {
      entries,
      stale: false,
    });
  }

  async getKeywordsForNode(nodeId: string): Promise<MemoryGlossaryKeyword[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryGlossaryKeywords)
      .where(eq(memoryGlossaryKeywords.nodeId, nodeId));
  }

  private async ensureNodeBelongsToInstance(
    instanceId: string,
    nodeId: string,
  ): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [node] = await tenantDb
      .select()
      .from(memoryNodes)
      .where(and(eq(memoryNodes.id, nodeId), eq(memoryNodes.instanceId, instanceId)))
      .limit(1);

    if (!node) {
      throw new NotFoundException(
        `Memory node ${nodeId} not found in instance ${instanceId}`,
      );
    }
  }

  private invalidateAutomaton(instanceId: string): void {
    const cache = this.caches.get(instanceId);

    if (!cache) {
      return;
    }

    cache.stale = true;
  }

  private matchText(entries: GlossaryCacheEntry[], text: string): GlossaryMatch[] {
    if (!text || entries.length === 0) {
      return [];
    }

    const normalizedText = text.toLowerCase();
    const matches: GlossaryMatch[] = [];

    for (let index = 0; index < normalizedText.length; index += 1) {
      const matchedEntry = entries.find((entry) =>
        normalizedText.startsWith(entry.normalizedKeyword, index),
      );

      if (!matchedEntry) {
        continue;
      }

      matches.push({
        keyword: matchedEntry.keyword,
        nodeId: matchedEntry.nodeId,
        position: index,
      });

      index += matchedEntry.keyword.length - 1;
    }

    return matches;
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}
