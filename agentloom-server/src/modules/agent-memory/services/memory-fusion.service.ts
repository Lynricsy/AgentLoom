import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  memorySessions,
  type MemoryGlossaryKeyword,
  type MemoryPath,
  type MemorySession,
  type MemorySessionConfig,
  type MemoryVersion,
} from '../../../database/schema';
import {
  BootProtocolService,
  type MemoryBootSequenceResult,
} from './boot-protocol.service';
import { MemoryNodeService } from './memory-node.service';
import {
  MemorySearchService,
  type MemorySearchOptions,
  type MemorySearchResult,
} from './memory-search.service';
import { PathResolverService } from './path-resolver.service';
import { MemoryVersionService } from './memory-version.service';

export interface MemoryFusionReadResult {
  sessionId: string;
  memoryInstanceId: string;
  fusionPriority: number;
  role: MemorySession['role'];
  nodeId: string;
  uri: string;
  content: string | null;
}

export interface MemoryFusionSearchResult extends MemorySearchResult {
  sessionId: string;
  memoryInstanceId: string;
  fusionPriority: number;
  weightedScore: number;
}

interface ActiveFusionSession {
  session: MemorySession;
  fusionPriority: number;
}

interface ParsedMemoryUri {
  domain: string;
  pathString: string;
}

const EMPTY_BOOT_SEQUENCE: MemoryBootSequenceResult = {
  systemPrompt: '',
  boot: null,
  index: [],
  glossary: [],
};

@Injectable()
export class MemoryFusionService {
  private readonly logger = new Logger(MemoryFusionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly bootProtocolService: BootProtocolService,
    private readonly memorySearchService: MemorySearchService,
    private readonly pathResolverService: PathResolverService,
    private readonly memoryVersionService: MemoryVersionService,
    private readonly memoryNodeService: MemoryNodeService,
  ) {}

  async readFromAll(
    sessionIds: string[],
    uri: string,
  ): Promise<MemoryFusionReadResult[]> {
    const sessions = await this.listActiveSessions(sessionIds);

    if (sessions.length === 0) {
      return [];
    }

    const reads = await Promise.all(
      sessions.map(async ({ session, fusionPriority }) => {
        try {
          const node = await this.pathResolverService.resolveUri(
            session.memoryInstanceId,
            uri,
          );
          const latestVersion = await this.memoryVersionService.getLatestVersion(node.id);

          return {
            sessionId: session.id,
            memoryInstanceId: session.memoryInstanceId,
            fusionPriority,
            role: session.role,
            nodeId: node.id,
            uri,
            content: latestVersion?.content ?? null,
          } satisfies MemoryFusionReadResult;
        } catch (error) {
          if (error instanceof NotFoundException) {
            this.logger.debug(
              `Skip missing memory path ${uri} in session ${session.id}`,
            );
            return null;
          }

          throw error;
        }
      }),
    );

    return reads.filter((result): result is MemoryFusionReadResult => result !== null);
  }

  async searchAll(
    sessionIds: string[],
    query: string,
    options: Omit<MemorySearchOptions, 'query'> = {},
  ): Promise<MemoryFusionSearchResult[]> {
    const sessions = await this.listActiveSessions(sessionIds);

    if (sessions.length === 0) {
      return [];
    }

    const results = await Promise.all(
      sessions.map(async ({ session, fusionPriority }) => {
        const searchResults = await this.memorySearchService.search(
          session.memoryInstanceId,
          {
            query,
            ...options,
          },
        );

        return searchResults.map((result) => ({
          ...result,
          sessionId: session.id,
          memoryInstanceId: session.memoryInstanceId,
          fusionPriority,
          weightedScore: result.relevanceScore * this.getPriorityWeight(fusionPriority),
        } satisfies MemoryFusionSearchResult));
      }),
    );

    return results.flat().sort((left, right) => {
      if (right.weightedScore !== left.weightedScore) {
        return right.weightedScore - left.weightedScore;
      }

      if (left.fusionPriority !== right.fusionPriority) {
        return left.fusionPriority - right.fusionPriority;
      }

      return right.relevanceScore - left.relevanceScore;
    });
  }

  async writeToTarget(
    sessionIds: string[],
    uri: string,
    content: string,
  ): Promise<MemoryVersion> {
    const targetSession = await this.getWriteTarget(sessionIds);

    try {
      const node = await this.pathResolverService.resolveUri(
        targetSession.memoryInstanceId,
        uri,
      );
      const latestVersion = await this.memoryVersionService.getLatestVersion(node.id);

      if (!latestVersion) {
        return this.memoryVersionService.createVersion(node.id, content);
      }

      return this.memoryVersionService.appendVersion(node.id, content);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }

      const parsedUri = this.parseUri(uri);
      const node = await this.memoryNodeService.createNode(
        targetSession.memoryInstanceId,
        {
          metadata: { uri },
        },
      );

      await this.pathResolverService.createPath(
        targetSession.memoryInstanceId,
        parsedUri.domain,
        parsedUri.pathString,
        node.id,
      );

      return this.memoryVersionService.createVersion(node.id, content);
    }
  }

  async bootAll(sessionIds: string[]): Promise<MemoryBootSequenceResult> {
    const sessions = await this.listActiveSessions(sessionIds);

    if (sessions.length === 0) {
      return EMPTY_BOOT_SEQUENCE;
    }

    if (sessions.length === 1) {
      return this.bootProtocolService.executeBootSequence(
        sessions[0].session.memoryInstanceId,
      );
    }

    const sequences = await Promise.all(
      sessions.map(async ({ session, fusionPriority }) => ({
        sessionId: session.id,
        fusionPriority,
        sequence: await this.bootProtocolService.executeBootSequence(
          session.memoryInstanceId,
        ),
      })),
    );

    return {
      systemPrompt: this.mergeTextSections(
        sequences.map(({ sequence }) => sequence.systemPrompt),
      ),
      boot: this.mergeNullableTextSections(
        sequences.map(({ sequence }) => sequence.boot),
      ),
      index: this.mergeIndexByPriority(
        sequences.map(({ sequence }) => sequence.index),
      ),
      glossary: this.mergeGlossaryByPriority(
        sequences.map(({ sequence }) => sequence.glossary),
      ),
    };
  }

  async getWriteTarget(sessionIds: string[]): Promise<MemorySession> {
    const uniqueSessionIds = this.getUniqueSessionIds(sessionIds);

    if (uniqueSessionIds.length === 0) {
      throw new BadRequestException('Exactly one active primary memory session is required');
    }

    const tenantDb = getTenantDb(this.db);
    const primarySessions = await tenantDb
      .select()
      .from(memorySessions)
      .where(
        and(
          inArray(memorySessions.id, uniqueSessionIds),
          eq(memorySessions.role, 'primary'),
          eq(memorySessions.status, 'active'),
        ),
      );

    if (primarySessions.length !== 1) {
      throw new BadRequestException('Exactly one active primary memory session is required');
    }

    return primarySessions[0];
  }

  private async listActiveSessions(
    sessionIds: string[],
  ): Promise<ActiveFusionSession[]> {
    const uniqueSessionIds = this.getUniqueSessionIds(sessionIds);

    if (uniqueSessionIds.length === 0) {
      return [];
    }

    const tenantDb = getTenantDb(this.db);
    const sessions = await tenantDb
      .select()
      .from(memorySessions)
      .where(
        and(
          inArray(memorySessions.id, uniqueSessionIds),
          eq(memorySessions.status, 'active'),
        ),
      );

    return sessions
      .map((session) => ({
        session,
        fusionPriority: this.getFusionPriority(session.config),
      }))
      .sort((left, right) => {
        if (left.fusionPriority !== right.fusionPriority) {
          return left.fusionPriority - right.fusionPriority;
        }

        return left.session.id.localeCompare(right.session.id);
      });
  }

  private getFusionPriority(config: MemorySessionConfig | null): number {
    return Math.max(config?.fusionPriority ?? Number.MAX_SAFE_INTEGER, 1);
  }

  private getPriorityWeight(fusionPriority: number): number {
    return 1 / Math.max(fusionPriority, 1);
  }

  private parseUri(uri: string): ParsedMemoryUri {
    const [domain, ...pathParts] = uri.split('://');
    const pathString = pathParts.join('://').trim();

    if (!domain || !pathString) {
      throw new BadRequestException(`Invalid memory URI: ${uri}`);
    }

    return {
      domain,
      pathString,
    };
  }

  private mergeTextSections(sections: string[]): string {
    return [...new Set(sections.map((section) => section.trim()).filter(Boolean))].join(
      '\n\n',
    );
  }

  private mergeNullableTextSections(
    sections: Array<string | null>,
  ): string | null {
    const merged = this.mergeTextSections(
      sections.filter((section): section is string => section !== null),
    );

    return merged || null;
  }

  private mergeIndexByPriority(indexGroups: MemoryPath[][]): MemoryPath[] {
    const claimedDomains = new Set<string>();
    const merged: MemoryPath[] = [];

    for (const indexGroup of indexGroups) {
      for (const path of indexGroup) {
        if (claimedDomains.has(path.domain)) {
          continue;
        }

        claimedDomains.add(path.domain);
        merged.push(path);
      }
    }

    return merged;
  }

  private mergeGlossaryByPriority(
    glossaryGroups: MemoryGlossaryKeyword[][],
  ): MemoryGlossaryKeyword[] {
    const seenKeywords = new Set<string>();
    const merged: MemoryGlossaryKeyword[] = [];

    for (const glossaryGroup of glossaryGroups) {
      for (const keyword of glossaryGroup) {
        if (seenKeywords.has(keyword.keyword)) {
          continue;
        }

        seenKeywords.add(keyword.keyword);
        merged.push(keyword);
      }
    }

    return merged;
  }

  private getUniqueSessionIds(sessionIds: string[]): string[] {
    return [...new Set(sessionIds)];
  }
}
