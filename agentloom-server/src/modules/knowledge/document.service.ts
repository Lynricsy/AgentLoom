import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { MultipartFile } from '@fastify/multipart';
import { extname } from 'node:path';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import type { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  StorageKeyInvalidException,
  StorageObjectNotFoundException,
  StorageService,
  StorageUnavailableException,
} from '../../infrastructure/storage';
import { documents } from '../../database/schema/knowledge-bases.schema';
import {
  type SupportedMimeType,
  TEXT_BASED_EXTENSIONS,
  EXTENSION_MIME_MAP,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_MIME_TYPES,
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_PROCESSING_MAX_ATTEMPTS,
} from './knowledge.constants';
import {
  UnsupportedFileTypeException,
  FileTooLargeException,
  DocumentNotFoundException,
  EmptyFileException,
  DocumentContentNotFoundException,
  DocumentContentUnavailableException,
} from './knowledge.exceptions';
import type { DocumentProcessingJobData } from './document-processing.worker';
import { KnowledgeGateway } from './knowledge.gateway';
import { RagService } from './services/rag.service';
import { KnowledgeNodeService } from './knowledge-node.service';

export type DocumentResponse = Omit<
  (typeof documents)['$inferSelect'],
  'storageKey'
>;

export type InternalDocument = (typeof documents)['$inferSelect'];

type DocumentStatus = DocumentResponse['status'];

const MAX_FILE_SIZE_MB = MAX_FILE_SIZE_BYTES / (1024 * 1024);

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private readonly supportedMimeTypes = new Set<SupportedMimeType>(
    SUPPORTED_MIME_TYPES,
  );
  private readonly textExtensions = new Set<string>(TEXT_BASED_EXTENSIONS);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly processingQueue: Queue<DocumentProcessingJobData>,
    private readonly knowledgeGateway: KnowledgeGateway,
    private readonly ragService: RagService,
    private readonly knowledgeNodeService: KnowledgeNodeService,
  ) {}

  async uploadFromRequest(
    request: FastifyRequest,
    knowledgeBaseId: string,
    tenantId: string,
    userId: string,
  ): Promise<DocumentResponse> {
    const multipartFile = await this.readMultipartFile(request);
    const buffer = await this.readMultipartBuffer(multipartFile);

    if (buffer.length === 0) {
      throw new EmptyFileException();
    }

    const mimeType = await this.detectMimeType(multipartFile.filename, buffer);

    const documentId = uuidv7();
    const storageKey = this.storageService.buildStorageKey(
      tenantId,
      knowledgeBaseId,
      documentId,
      multipartFile.filename,
    );
    let persistedDocumentId: string | null = null;

    try {
      await this.storageService.upload(
        storageKey,
        buffer,
        buffer.length,
        mimeType,
      );

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

      persistedDocumentId = document.id;

      const { storageKey: _key, ...safeDocument } = document;

      await this.processingQueue.add(
        'process',
        { documentId: document.id },
        {
          attempts: DOCUMENT_PROCESSING_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2000 },
          jobId: `process-${document.id}`,
        },
      );

      this.emitUploadedRealtimeEvents(tenantId, knowledgeBaseId, document.id);

      return safeDocument;
    } catch (error) {
      if (persistedDocumentId) {
        await this.rollbackPersistedDocument(persistedDocumentId, tenantId);
      }

      if (await this.storageService.exists(storageKey)) {
        await this.cleanupUploadedObject(storageKey);
      } else {
        await this.cleanupIncompleteUpload(storageKey);
      }

      throw error;
    }
  }

  async findByKnowledgeBase(
    knowledgeBaseId: string,
    tenantId: string,
    page: number,
    pageSize: number,
    statuses?: DocumentStatus[],
  ): Promise<{ data: DocumentResponse[]; total: number }> {
    const db = getTenantDb(this.db);
    const offset = (page - 1) * pageSize;

    const baseCondition = and(
      eq(documents.knowledgeBaseId, knowledgeBaseId),
      eq(documents.tenantId, tenantId),
      statuses?.length ? inArray(documents.status, statuses) : undefined,
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
          errorMessage: documents.errorMessage,
          uploadedBy: documents.uploadedBy,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(baseCondition)
        .orderBy(desc(documents.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(documents).where(baseCondition),
    ]);

    return { data: rows, total };
  }

  async deleteDocument(
    knowledgeBaseId: string,
    documentId: string,
    tenantId: string,
  ): Promise<void> {
    const db = getTenantDb(this.db);
    const deletionCondition = and(
      eq(documents.id, documentId),
      eq(documents.knowledgeBaseId, knowledgeBaseId),
      eq(documents.tenantId, tenantId),
    );
    const [existingDocument] = await db
      .select({
        id: documents.id,
        storageKey: documents.storageKey,
      })
      .from(documents)
      .where(deletionCondition)
      .limit(1);

    if (!existingDocument) {
      throw new DocumentNotFoundException(documentId);
    }

    await this.deleteVectorsOrThrow(
      documentId,
      tenantId,
      `document ${documentId} in knowledge base ${knowledgeBaseId}`,
    );

    const [document] = await db
      .delete(documents)
      .where(deletionCondition)
      .returning({
        id: documents.id,
        storageKey: documents.storageKey,
      });

    if (!document) {
      this.logger.warn(
        `Document ${documentId} disappeared before metadata deletion completed`,
      );
      return;
    }

    await this.cleanupDeletedObject(
      document.storageKey,
      `document ${documentId} in knowledge base ${knowledgeBaseId}`,
    );
  }

  async deleteByKnowledgeBase(
    knowledgeBaseId: string,
    tenantId: string,
  ): Promise<number> {
    const db = getTenantDb(this.db);
    const deletionCondition = and(
      eq(documents.knowledgeBaseId, knowledgeBaseId),
      eq(documents.tenantId, tenantId),
    );
    const documentsToDelete = await db
      .select({
        id: documents.id,
        storageKey: documents.storageKey,
      })
      .from(documents)
      .where(deletionCondition);

    for (const document of documentsToDelete) {
      await this.deleteVectorsOrThrow(
        document.id,
        tenantId,
        `document ${document.id} in knowledge base ${knowledgeBaseId}`,
      );
    }

    const deletedDocuments = await db
      .delete(documents)
      .where(deletionCondition)
      .returning({
        id: documents.id,
        storageKey: documents.storageKey,
      });

    await Promise.all(
      deletedDocuments.map((document) =>
        this.cleanupDeletedObject(
          document.storageKey,
          `document ${document.id} in knowledge base ${knowledgeBaseId}`,
        ),
      ),
    );

    await this.ragService.deleteKnowledgeBaseCollection(knowledgeBaseId);

    return deletedDocuments.length;
  }

  async findById(documentId: string): Promise<InternalDocument> {
    const db = getTenantDb(this.db);
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      throw new DocumentNotFoundException(documentId);
    }

    return document;
  }

  async rebuildKnowledgeBase(
    knowledgeBaseId: string,
    tenantId: string,
  ): Promise<number> {
    const db = getTenantDb(this.db);
    const targetDocuments = await db
      .select({
        id: documents.id,
      })
      .from(documents)
      .where(
        and(
          eq(documents.knowledgeBaseId, knowledgeBaseId),
          eq(documents.tenantId, tenantId),
        ),
      );

    await this.ragService.deleteKnowledgeBaseCollection(knowledgeBaseId);
    await this.knowledgeNodeService.deleteByKnowledgeBaseId(
      knowledgeBaseId,
      tenantId,
    );

    await db
      .update(documents)
      .set({
        status: 'uploaded',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.knowledgeBaseId, knowledgeBaseId),
          eq(documents.tenantId, tenantId),
        ),
      );

    for (const document of targetDocuments) {
      await this.processingQueue.add(
        'process',
        { documentId: document.id },
        {
          attempts: DOCUMENT_PROCESSING_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2000 },
          jobId: `rebuild-${document.id}-${Date.now()}`,
        },
      );
      this.emitUploadedRealtimeEvents(tenantId, knowledgeBaseId, document.id);
    }

    this.knowledgeGateway.emitKnowledgeBaseUpdated(tenantId, knowledgeBaseId);
    return targetDocuments.length;
  }

  async getDocumentContentUrl(
    knowledgeBaseId: string,
    documentId: string,
    expirySeconds = 3600,
  ): Promise<{
    url: string;
    fileName: string;
    mimeType: string;
    expiresIn: number;
  }> {
    const document = await this.findById(documentId);

    if (document.knowledgeBaseId !== knowledgeBaseId) {
      throw new DocumentNotFoundException(documentId);
    }

    if (!document.storageKey) {
      throw new DocumentContentNotFoundException(documentId);
    }

    let url: string;
    try {
      url = await this.storageService.getPresignedUrl(
        document.storageKey,
        expirySeconds,
      );
    } catch (error) {
      if (
        error instanceof StorageObjectNotFoundException ||
        error instanceof StorageKeyInvalidException
      ) {
        throw new DocumentContentNotFoundException(documentId);
      }

      if (error instanceof StorageUnavailableException) {
        const reason =
          typeof error.detail === 'string' ? error.detail : '对象存储暂不可用';
        throw new DocumentContentUnavailableException(documentId, reason);
      }

      throw error;
    }

    return {
      url,
      fileName: document.fileName,
      mimeType: document.mimeType,
      expiresIn: expirySeconds,
    };
  }

  async updateStatus(
    documentId: string,
    status: DocumentStatus,
    errorMessage?: string | null,
  ): Promise<void> {
    const db = getTenantDb(this.db);
    await db
      .update(documents)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  }

  private emitUploadedRealtimeEvents(
    tenantId: string,
    knowledgeBaseId: string,
    documentId: string,
  ): void {
    try {
      this.knowledgeGateway.emitDocumentStatusChanged(
        tenantId,
        knowledgeBaseId,
        {
          documentId,
          knowledgeBaseId,
          status: 'uploaded',
        },
      );
      this.knowledgeGateway.emitKnowledgeBaseUpdated(tenantId, knowledgeBaseId);
    } catch (error) {
      this.logger.warn(
        `Failed to emit uploaded event for document ${documentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readMultipartFile(
    request: FastifyRequest,
  ): Promise<MultipartFile> {
    try {
      const multipartFile = await request.file();

      if (!multipartFile) {
        throw new EmptyFileException();
      }

      return multipartFile;
    } catch (error) {
      this.rethrowMultipartLimitError(error);
      throw error;
    }
  }

  private async readMultipartBuffer(
    multipartFile: MultipartFile,
  ): Promise<Buffer> {
    try {
      const buffer = await multipartFile.toBuffer();

      if (buffer.length > MAX_FILE_SIZE_BYTES || multipartFile.file.truncated) {
        throw new FileTooLargeException(MAX_FILE_SIZE_MB);
      }

      return buffer;
    } catch (error) {
      this.rethrowMultipartLimitError(error);
      throw error;
    }
  }

  private rethrowMultipartLimitError(error: unknown): void {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new FileTooLargeException(MAX_FILE_SIZE_MB);
    }
  }

  private async detectMimeType(
    fileName: string,
    buffer: Buffer,
  ): Promise<SupportedMimeType> {
    const ext = extname(fileName).toLowerCase();
    const expectedMimeType = EXTENSION_MIME_MAP[ext];

    if (!expectedMimeType) {
      throw new UnsupportedFileTypeException(fileName);
    }

    const detectedFileType = await fileTypeFromBuffer(buffer);

    if (detectedFileType) {
      if (
        !this.supportedMimeTypes.has(detectedFileType.mime as SupportedMimeType)
      ) {
        throw new UnsupportedFileTypeException(fileName);
      }

      if (detectedFileType.mime !== expectedMimeType) {
        throw new UnsupportedFileTypeException(fileName);
      }

      return detectedFileType.mime;
    }

    if (this.textExtensions.has(ext) && this.isTextBuffer(buffer)) {
      return expectedMimeType;
    }

    throw new UnsupportedFileTypeException(fileName);
  }

  private isTextBuffer(buffer: Buffer): boolean {
    if (buffer.includes(0)) {
      return false;
    }

    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupUploadedObject(storageKey: string): Promise<void> {
    this.logger.error(`数据库写入失败，清理已上传文件: ${storageKey}`);
    await this.storageService
      .delete(storageKey)
      .catch((cleanupError: unknown) => {
        this.logger.error(`清理 MinIO 文件失败: ${storageKey}`, cleanupError);
      });
  }

  private async rollbackPersistedDocument(
    documentId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      const db = getTenantDb(this.db);
      await db
        .delete(documents)
        .where(
          and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
        );
    } catch (error) {
      this.logger.warn(
        `回滚文档记录失败: ${documentId}`,
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }

  private async cleanupDeletedObject(
    storageKey: string,
    context: string,
  ): Promise<void> {
    try {
      await this.storageService.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `元数据已删除，但对象存储清理失败: ${context} (${storageKey})`,
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }

  private async deleteVectorsOrThrow(
    documentId: string,
    tenantId: string,
    context: string,
  ): Promise<void> {
    try {
      await this.ragService.deleteByDocument(documentId, tenantId);
    } catch (error) {
      this.logger.error(
        `删除操作中止，向量索引清理失败: ${context}`,
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
      throw error;
    }
  }

  private async cleanupIncompleteUpload(storageKey: string): Promise<void> {
    this.logger.error(`上传失败，清理未完成的 MinIO 分片: ${storageKey}`);
    await this.storageService
      .removeIncompleteUpload(storageKey)
      .catch((cleanupError: unknown) => {
        this.logger.error(
          `清理未完成的 MinIO 分片失败: ${storageKey}`,
          cleanupError,
        );
      });
  }
}
