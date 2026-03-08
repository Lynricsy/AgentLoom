import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { eq, desc, sql, count, and } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { StorageService } from '../../infrastructure/storage';
import { documents } from '../../database/schema/knowledge-bases.schema';
import {
  EXTENSION_MIME_MAP,
  MAX_FILE_SIZE_BYTES,
} from './knowledge.constants';
import {
  UnsupportedFileTypeException,
  FileTooLargeException,
  EmptyFileException,
} from './knowledge.exceptions';

export type DocumentResponse = Omit<
  typeof documents.$inferSelect,
  'storageKey'
>;

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
  ) {}

  async uploadFromRequest(
    request: FastifyRequest,
    knowledgeBaseId: string,
    tenantId: string,
    userId: string,
  ): Promise<DocumentResponse> {
    const multipartFile = await request.file();

    if (!multipartFile) {
      throw new EmptyFileException();
    }

    const ext = extname(multipartFile.filename).toLowerCase();
    const mimeType = EXTENSION_MIME_MAP[ext];

    if (!mimeType) {
      throw new UnsupportedFileTypeException(multipartFile.filename);
    }

    const buffer = await multipartFile.toBuffer();

    if (buffer.length === 0) {
      throw new EmptyFileException();
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new FileTooLargeException(MAX_FILE_SIZE_BYTES / (1024 * 1024));
    }

    const documentId = randomUUID();
    const storageKey = this.storageService.buildStorageKey(
      tenantId,
      knowledgeBaseId,
      documentId,
      multipartFile.filename,
    );

    await this.storageService.upload(
      storageKey,
      buffer,
      buffer.length,
      mimeType,
    );

    try {
      const db = getTenantDb(this.db);
      const [document] = await db
        .insert(documents)
        .values({
          id: documentId,
          knowledgeBaseId,
          tenantId,
          fileName: multipartFile.filename,
          mimeType,
          sizeBytes: buffer.length,
          storageKey,
          uploadedBy: userId,
        })
        .returning();

      const { storageKey: _key, ...safeDocument } = document;
      return safeDocument;
    } catch (error) {
      this.logger.error(
        `数据库写入失败，清理已上传文件: ${storageKey}`,
        error,
      );
      await this.storageService.delete(storageKey).catch((cleanupErr) => {
        this.logger.error(
          `清理 MinIO 文件失败: ${storageKey}`,
          cleanupErr,
        );
      });
      throw error;
    }
  }

  async findByKnowledgeBase(
    knowledgeBaseId: string,
    tenantId: string,
    page: number,
    pageSize: number,
    status?: string,
  ): Promise<{ data: DocumentResponse[]; total: number }> {
    const db = getTenantDb(this.db);
    const offset = (page - 1) * pageSize;

    const baseCondition = and(
      eq(documents.knowledgeBaseId, knowledgeBaseId),
      eq(documents.tenantId, tenantId),
      status
        ? eq(
            documents.status,
            status as 'uploaded' | 'processing' | 'ready' | 'failed',
          )
        : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: documents.id,
          knowledgeBaseId: documents.knowledgeBaseId,
          tenantId: documents.tenantId,
          fileName: documents.fileName,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
          status: documents.status,
          uploadedBy: documents.uploadedBy,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(baseCondition)
        .orderBy(desc(documents.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: count() })
        .from(documents)
        .where(baseCondition),
    ]);

    return { data: rows, total };
  }
}
