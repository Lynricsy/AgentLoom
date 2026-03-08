import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';
import { Readable } from 'node:stream';
import { MINIO_CLIENT } from './storage.module';

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
    const exists = await this.minioClient.bucketExists(this.bucket);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucket);
      this.logger.log(`已创建存储桶: ${this.bucket}`);
    }
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    size: number,
    contentType: string,
  ): Promise<void> {
    await this.minioClient.putObject(this.bucket, key, data, size, {
      'Content-Type': contentType,
    });
  }

  async download(key: string): Promise<Readable> {
    return this.minioClient.getObject(this.bucket, key);
  }

  async delete(key: string): Promise<void> {
    await this.minioClient.removeObject(this.bucket, key);
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
    return `${tenantId}/${knowledgeBaseId}/${documentId}/${fileName}`;
  }
}
