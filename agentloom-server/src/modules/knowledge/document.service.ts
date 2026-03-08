import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import { extname } from 'node:path';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import type { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { StorageService } from '../../infrastructure/storage';
import { documents } from '../../database/schema/knowledge-bases.schema';
import {
  type SupportedMimeType,
  TEXT_BASED_EXTENSIONS,
  EXTENSION_MIME_MAP,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_MIME_TYPES,
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

      const { storageKey: _key, ...safeDocument } = document;
      return safeDocument;
    } catch (error) {
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
      statuses?.length
        ? inArray(documents.status, statuses)
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

  private async readMultipartFile(request: FastifyRequest): Promise<MultipartFile> {
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

  private async readMultipartBuffer(multipartFile: MultipartFile): Promise<Buffer> {
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
      if (!this.supportedMimeTypes.has(detectedFileType.mime as SupportedMimeType)) {
        throw new UnsupportedFileTypeException(fileName);
      }

      if (detectedFileType.mime !== expectedMimeType) {
        throw new UnsupportedFileTypeException(fileName);
      }

      return detectedFileType.mime as SupportedMimeType;
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
    await this.storageService.delete(storageKey).catch((cleanupError: unknown) => {
      this.logger.error(`清理 MinIO 文件失败: ${storageKey}`, cleanupError);
    });
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
