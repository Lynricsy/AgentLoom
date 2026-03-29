import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import { encode } from 'gpt-tokenizer';
import { MetadataMode, TextNode, jsonToNode } from 'llamaindex';

import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { knowledgeNodes } from '../../database/schema/knowledge-nodes.schema';
import { documents } from '../../database/schema/knowledge-bases.schema';
import { DocumentChunkException } from './knowledge.exceptions';

@Injectable()
export class KnowledgeNodeService {
  private readonly logger = new Logger(KnowledgeNodeService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async replaceNodes(documentId: string, nodes: TextNode[]): Promise<number> {
    const db = getTenantDb(this.db);
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

    await db
      .delete(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.documentId, documentId),
          eq(knowledgeNodes.tenantId, sourceDoc.tenantId),
        ),
      );

    if (nodes.length === 0) {
      return 0;
    }

    const values = nodes.map((node, index) => {
      const content = node.getContent(MetadataMode.NONE);
      return {
        id: node.id_,
        documentId,
        tenantId: sourceDoc.tenantId,
        knowledgeBaseId: sourceDoc.knowledgeBaseId,
        nodeIndex: index,
        nodeType: node.constructor.name,
        content,
        tokenCount: encode(content).length,
        metadata: node.metadata ?? {},
        payload: node.toJSON(),
      };
    });

    await db.insert(knowledgeNodes).values(values);

    this.logger.debug(`为文档 ${documentId} 写入 ${nodes.length} 个知识节点`);
    return nodes.length;
  }

  async findByDocumentId(documentId: string, tenantId: string) {
    const db = getTenantDb(this.db);

    return db
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.documentId, documentId),
          eq(knowledgeNodes.tenantId, tenantId),
        ),
      )
      .orderBy(asc(knowledgeNodes.nodeIndex));
  }

  async findLlamaNodesByDocumentId(
    documentId: string,
    tenantId: string,
  ): Promise<TextNode[]> {
    const rows = await this.findByDocumentId(documentId, tenantId);
    return rows.map((row) => jsonToNode(row.payload) as TextNode);
  }

  async deleteByDocumentId(
    documentId: string,
    tenantId: string,
  ): Promise<number> {
    const db = getTenantDb(this.db);

    const result = await db
      .delete(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.documentId, documentId),
          eq(knowledgeNodes.tenantId, tenantId),
        ),
      )
      .returning({ id: knowledgeNodes.id });

    this.logger.debug(`删除文档 ${documentId} 的 ${result.length} 个知识节点`);
    return result.length;
  }

  async deleteByKnowledgeBaseId(
    knowledgeBaseId: string,
    tenantId: string,
  ): Promise<number> {
    const db = getTenantDb(this.db);
    const result = await db
      .delete(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeNodes.tenantId, tenantId),
        ),
      )
      .returning({ id: knowledgeNodes.id });

    this.logger.debug(
      `删除知识库 ${knowledgeBaseId} 的 ${result.length} 个知识节点`,
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
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.documentId, documentId),
          eq(knowledgeNodes.tenantId, tenantId),
        ),
      );

    return result[0]?.count ?? 0;
  }
}
