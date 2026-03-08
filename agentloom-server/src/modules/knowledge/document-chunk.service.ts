import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, and, asc, count } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { documentChunks } from '../../database/schema/document-chunks.schema';
import { documents } from '../../database/schema/knowledge-bases.schema';
import type { DocumentChunk } from './interfaces/document-parser.interface';
import { DocumentChunkException } from './knowledge.exceptions';

@Injectable()
export class DocumentChunkService {
  private readonly logger = new Logger(DocumentChunkService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 批量创建文档分块。
   *
   * `tenantId` 和 `knowledgeBaseId` 强制从源文档记录继承，禁止调用方传入不一致的归属值。
   * 若源文档不存在，抛出 DocumentChunkException。
   *
   * @param documentId - 源文档 ID
   * @param chunks - 待持久化的分块列表
   * @returns 实际写入的分块数量
   */
  async createChunks(
    documentId: string,
    chunks: DocumentChunk[],
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    try {
      const db = getTenantDb(this.db);

      // 从源文档继承 tenantId / knowledgeBaseId，防止调用方手工传入不一致的租户/知识库归属
      const [sourceDoc] = await db
        .select({
          tenantId: documents.tenantId,
          knowledgeBaseId: documents.knowledgeBaseId,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!sourceDoc) {
        throw new DocumentChunkException(documentId, '源文档不存在');
      }

      const { tenantId, knowledgeBaseId } = sourceDoc;

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
      if (error instanceof DocumentChunkException) throw error;
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
