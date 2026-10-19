import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MINIO_CLIENT } from './storage.constants';
import {
  StorageKeyInvalidException,
  StorageObjectNotFoundException,
  StorageUnavailableException,
} from './storage.exceptions';

type ResolvedUploadSource = {
  data: Buffer | Readable;
  size: number;
  cleanup?: () => Promise<void>;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly publicUrl: URL | undefined;
  private presignClient: Promise<Client> | undefined;

  constructor(
    @Inject(MINIO_CLIENT) private readonly minioClient: Client,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>(
      'APP_MINIO_BUCKET',
      'agentloom-documents',
    );
    const publicUrl = this.configService.get<string>('APP_MINIO_PUBLIC_URL');
    this.publicUrl = publicUrl ? new URL(publicUrl) : undefined;
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
    try {
      return await this.minioClient.getObject(this.bucket, key);
    } catch (error) {
      // MinIO 原始错误会被全局异常链当成 500，必须在基础设施边界稳定映射为公开 HTTP 语义。
      if (this.isNotFoundError(error)) {
        throw new StorageObjectNotFoundException(key);
      }

      throw new StorageUnavailableException('getObject', key, error);
    }
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

  /**
   * 生成对象的预签名下载 URL
   * @param key 对象存储路径
   * @param expirySeconds URL 有效期（秒），默认 3600（1小时）
   */
  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    const normalizedKey = this.normalizeKey(key);
    if (!normalizedKey) {
      throw new StorageKeyInvalidException();
    }

    await this.assertObjectExists(normalizedKey);

    try {
      const signer = await this.resolvePresignClient();
      return await signer.presignedGetObject(
        this.bucket,
        normalizedKey,
        expirySeconds,
      );
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new StorageObjectNotFoundException(normalizedKey);
      }

      throw new StorageUnavailableException(
        'presignedGetObject',
        normalizedKey,
        error,
      );
    }
  }

  private normalizeKey(key: string): string {
    return key.trim();
  }

  /**
   * 预签名 URL 交给浏览器打开，SigV4 把 host 签进签名，必须用浏览器可达的地址签名；
   * 内网连接地址（compose 里的 `minio:9000`）公网不可达。配置了 APP_MINIO_PUBLIC_URL 时
   * 用该地址单独建一个只做签名的客户端，region 取自内网客户端，签名本身不发请求。
   */
  private resolvePresignClient(): Promise<Client> {
    const publicUrl = this.publicUrl;
    if (!publicUrl) {
      return Promise.resolve(this.minioClient);
    }

    this.presignClient ??= this.minioClient
      .getBucketRegionAsync(this.bucket)
      .then((region) => {
        const useSSL = publicUrl.protocol === 'https:';
        return new Client({
          endPoint: publicUrl.hostname,
          port: publicUrl.port ? Number(publicUrl.port) : useSSL ? 443 : 80,
          useSSL,
          accessKey: this.configService.getOrThrow<string>(
            'APP_MINIO_ACCESS_KEY',
          ),
          secretKey: this.configService.getOrThrow<string>(
            'APP_MINIO_SECRET_KEY',
          ),
          region,
        });
      })
      .catch((error: unknown) => {
        this.presignClient = undefined;
        throw error;
      });

    return this.presignClient;
  }

  private async assertObjectExists(key: string): Promise<void> {
    try {
      await this.minioClient.statObject(this.bucket, key);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new StorageObjectNotFoundException(key);
      }

      throw new StorageUnavailableException('statObject', key, error);
    }
  }

  private isNotFoundError(error: unknown): boolean {
    const code = this.getStringField(error, 'code');
    const name = this.getStringField(error, 'name');
    const message = this.getStringField(error, 'message');

    const haystack = [code, name, message].filter(Boolean).join(' ');
    return /NoSuchKey|NoSuchObject|NotFound|NoSuchBucket/i.test(haystack);
  }

  private getStringField(error: unknown, field: string): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const value = (error as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
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

    if (
      typeof rawValue === 'number' &&
      Number.isFinite(rawValue) &&
      rawValue >= 0
    ) {
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
