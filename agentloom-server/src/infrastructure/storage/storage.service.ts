import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MINIO_CLIENT } from './storage.constants';

type ResolvedUploadSource = {
  data: Buffer | Readable;
  size: number;
  cleanup?: () => Promise<void>;
};

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
    const resolved = await this.resolveUploadSource(data, size);
    const metaData = contentType ? { 'Content-Type': contentType } : undefined;

    try {
      await this.minioClient.putObject(
        this.bucket,
        key,
        resolved.data,
        resolved.size,
        metaData,
      );
    } finally {
      await resolved.cleanup?.();
    }
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

  private async resolveUploadSource(
    data: Buffer | Readable,
    size?: number,
  ): Promise<ResolvedUploadSource> {
    if (Buffer.isBuffer(data)) {
      return {
        data,
        size: size ?? data.length,
      };
    }

    if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
      return { data, size };
    }

    const contentLength = this.extractContentLength(data);
    if (contentLength !== undefined) {
      return { data, size: contentLength };
    }

    return this.stageReadableUpload(data);
  }

  private extractContentLength(data: Readable): number | undefined {
    if (!('headers' in data)) {
      return undefined;
    }

    const { headers } = data;
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }

    const rawValue =
      Reflect.get(headers, 'content-length') ??
      Reflect.get(headers, 'Content-Length');

    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
      return rawValue;
    }

    if (typeof rawValue === 'string') {
      const parsed = Number.parseInt(rawValue, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }

    if (Array.isArray(rawValue) && typeof rawValue[0] === 'string') {
      const parsed = Number.parseInt(rawValue[0], 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }

    return undefined;
  }

  private async stageReadableUpload(
    data: Readable,
  ): Promise<ResolvedUploadSource> {
    const stagingDir = await mkdtemp(join(tmpdir(), 'agentloom-upload-'));
    const stagingFile = join(stagingDir, 'payload.bin');

    await pipeline(data, createWriteStream(stagingFile));

    const fileStats = await stat(stagingFile);
    const stagedStream = createReadStream(stagingFile);

    return {
      data: stagedStream,
      size: fileStats.size,
      cleanup: async () => {
        if (!stagedStream.destroyed) {
          stagedStream.destroy();
        }
        await rm(stagingDir, { recursive: true, force: true });
      },
    };
  }
}
