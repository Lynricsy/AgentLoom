import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, and, asc, count } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { documentChunks } from '../../database/schema/document-chunks.schema';
import type { DocumentChunk } from './interfaces/document-parser.interface';
import { DocumentChunkException } from './knowledge.exceptions';

@Injectable()
export class DocumentChunkService {
  private readonly logger = new Logger(DocumentChunkService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createChunks(
    documentId: string,
    tenantId: string,
    knowledgeBaseId: string,
    chunks: DocumentChunk[],
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    try {
      const db = getTenantDb(this.db);

      const values = chunks.map((chunk, index) => ({
        documentId,
        tenantId,
        knowledgeBaseId,
        chunkIndex: index,
        content: chunk.content,
        metadata: chunk.location,
        tokenCount: chunk.tokenCount,
      }));

      await db.insert(documentChunks).values(values);

      this.logger.debug(
        `为文档 ${documentId} 创建了 ${chunks.length} 个分块`,
      );
      return chunks.length;
    } catch (error) {
      this.logger.error(`创建文档分块失败: ${error}`);
      throw new DocumentChunkException(documentId, '创建分块失败');
    }
  }

  async findByDocumentId(documentId: string, tenantId: string) {
    const db = getTenantDb(this.db);

    return db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.tenantId, tenantId),
        ),
      )
      .orderBy(asc(documentChunks.chunkIndex));
  }

  async deleteByDocumentId(
    documentId: string,
    tenantId: string,
  ): Promise<number> {
    const db = getTenantDb(this.db);

    const result = await db
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.tenantId, tenantId),
        ),
      )
      .returning();

    this.logger.debug(
      `删除文档 ${documentId} 的 ${result.length} 个分块`,
    );
    return result.length;
  }

  async countByDocumentId(
    documentId: string,
    tenantId: string,
  ): Promise<number> {
    const db = getTenantDb(this.db);

    const result = await db
      .select({ count: count() })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.tenantId, tenantId),
        ),
      );

    return result[0]?.count ?? 0;
  }
}
