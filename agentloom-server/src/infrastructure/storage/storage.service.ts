import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';
import { Readable } from 'node:stream';
import { MINIO_CLIENT } from './storage.constants';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(MINIO_CLIENT) private readonly minioClient: Client,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>(
      'APP_MINIO_BUCKET',
      'agentloom-documents',
    );
  }

  async onModuleInit() {
    try {
      const timeoutMs = 3_000;
      const exists = await Promise.race([
        this.minioClient.bucketExists(this.bucket),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`连接超时 (${timeoutMs}ms)`)),
            timeoutMs,
          ),
        ),
      ]);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucket);
        this.logger.log(`已创建存储桶: ${this.bucket}`);
      }
    } catch (error) {
      this.logger.warn(
        `MinIO 连接失败，对象存储功能暂不可用: ${(error as Error).message}`,
      );
    }
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    size?: number,
    contentType?: string,
  ): Promise<void> {
    const resolvedSize = size ?? (Buffer.isBuffer(data) ? data.length : undefined);
    const metaData = contentType ? { 'Content-Type': contentType } : undefined;
    await this.minioClient.putObject(this.bucket, key, data, resolvedSize, metaData);
  }

  async download(key: string): Promise<Readable> {
    return this.minioClient.getObject(this.bucket, key);
  }

  async delete(key: string): Promise<void> {
    await this.minioClient.removeObject(this.bucket, key);
  }

  async removeIncompleteUpload(key: string): Promise<void> {
    await this.minioClient.removeIncompleteUpload(this.bucket, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.minioClient.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  buildStorageKey(
    tenantId: string,
    knowledgeBaseId: string,
    documentId: string,
    fileName: string,
  ): string {
    return `tenants/${tenantId}/kb/${knowledgeBaseId}/${documentId}/${fileName}`;
  }
}
