import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import AhoCorasick from 'ahocorasick';
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
  automaton: AhoCorasick;
  keywordLookup: Map<string, GlossaryCacheEntry[]>;
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
      return this.matchText(this.caches.get(instanceId), text);
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

    return this.matchText(cache, text);
  }

  async rebuildAutomaton(instanceId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const keywords = await tenantDb
      .select()
      .from(memoryGlossaryKeywords)
      .where(eq(memoryGlossaryKeywords.instanceId, instanceId))
      .orderBy(memoryGlossaryKeywords.keyword);

    const entries = keywords.map((keywordRow) => ({
      keyword: keywordRow.keyword,
      normalizedKeyword: keywordRow.keyword.toLowerCase(),
      nodeId: keywordRow.nodeId,
    }));

    const keywordLookup = new Map<string, GlossaryCacheEntry[]>();
    for (const entry of entries) {
      const existingEntries = keywordLookup.get(entry.normalizedKeyword) ?? [];
      existingEntries.push(entry);
      keywordLookup.set(entry.normalizedKeyword, existingEntries);
    }

    const automaton = new AhoCorasick([...keywordLookup.keys()]);

    this.caches.set(instanceId, {
      automaton,
      keywordLookup,
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
      .where(
        and(eq(memoryNodes.id, nodeId), eq(memoryNodes.instanceId, instanceId)),
      )
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

  private matchText(
    cache: GlossaryCache | undefined,
    text: string,
  ): GlossaryMatch[] {
    if (!text || !cache || cache.keywordLookup.size === 0) {
      return [];
    }

    const normalizedText = text.toLowerCase();
    const matchesByPosition = new Map<number, GlossaryMatch[]>();
    const matchLengthsByPosition = new Map<number, number>();

    for (const [endIndex, matchedKeywords] of cache.automaton.search(
      normalizedText,
    )) {
      for (const matchedKeyword of matchedKeywords) {
        const entries = cache.keywordLookup.get(matchedKeyword) ?? [];

        for (const entry of entries) {
          const position = endIndex - entry.normalizedKeyword.length + 1;
          const currentLongestLength =
            matchLengthsByPosition.get(position) ?? 0;
          const currentLength = entry.normalizedKeyword.length;

          if (currentLength < currentLongestLength) {
            continue;
          }

          const glossaryMatch = {
            keyword: entry.keyword,
            nodeId: entry.nodeId,
            position,
          };

          if (currentLength > currentLongestLength) {
            matchesByPosition.set(position, [glossaryMatch]);
            matchLengthsByPosition.set(position, currentLength);
            continue;
          }

          const existingMatches = matchesByPosition.get(position) ?? [];
          existingMatches.push(glossaryMatch);
          matchesByPosition.set(position, existingMatches);
        }
      }
    }

    const matches: GlossaryMatch[] = [];
    let nextAvailablePosition = 0;

    const sortedPositions = [...matchesByPosition.keys()].sort(
      (left, right) => left - right,
    );
    for (const position of sortedPositions) {
      if (position < nextAvailablePosition) {
        continue;
      }

      const positionMatches = matchesByPosition.get(position) ?? [];
      if (positionMatches.length === 0) {
        continue;
      }

      matches.push(...positionMatches);

      const longestLength = matchLengthsByPosition.get(position);
      if (longestLength) {
        nextAvailablePosition = position + longestLength;
      }
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
