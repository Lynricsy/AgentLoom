import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';
import { Readable } from 'node:stream';
import { MINIO_CLIENT } from '../../infrastructure/storage/storage.constants';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { SKILL_FILE_MAX_SIZE } from './skill.constants';

@Injectable()
export class SkillStorageService {
  private readonly logger = new Logger(SkillStorageService.name);
  private readonly bucket: string;

  constructor(
    private readonly storageService: StorageService,
    @Inject(MINIO_CLIENT) private readonly minioClient: Client,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>(
      'APP_MINIO_BUCKET',
      'agentloom-documents',
    );
  }

  private buildSkillKey(
    tenantId: string,
    skillId: string,
    fileName?: string,
  ): string {
    const prefix = `tenants/${tenantId}/skills/${skillId}/`;
    return fileName ? `${prefix}${fileName}` : prefix;
  }

  async uploadSkillFile(
    tenantId: string,
    skillId: string,
    fileName: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<void> {
    if (buffer.length > SKILL_FILE_MAX_SIZE) {
      const maxMb = SKILL_FILE_MAX_SIZE / (1024 * 1024);
      throw new BadRequestException(
        `文件大小 (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) 超过单文件限制 ${maxMb}MB`,
      );
    }

    const key = this.buildSkillKey(tenantId, skillId, fileName);

    this.logger.debug(`上传 Skill 文件: ${key} (${buffer.length} bytes)`);

    await this.storageService.upload(key, buffer, buffer.length, contentType);
  }

  async downloadSkillFile(
    tenantId: string,
    skillId: string,
    fileName: string,
  ): Promise<Readable> {
    const key = this.buildSkillKey(tenantId, skillId, fileName);
    return this.storageService.download(key);
  }

  async deleteSkillFiles(tenantId: string, skillId: string): Promise<void> {
    const prefix = this.buildSkillKey(tenantId, skillId);

    const objectNames: string[] = [];
    const stream = this.minioClient.listObjectsV2(this.bucket, prefix, true);

    for await (const obj of stream) {
      if (obj.name) {
        objectNames.push(obj.name);
      }
    }

    if (objectNames.length === 0) {
      this.logger.debug(`Skill 前缀 ${prefix} 下无文件，跳过删除`);
      return;
    }

    this.logger.debug(
      `删除 Skill 文件: ${prefix} (${objectNames.length} 个文件)`,
    );

    await this.minioClient.removeObjects(this.bucket, objectNames);
  }

  async listSkillFiles(
    tenantId: string,
    skillId: string,
  ): Promise<{ name: string; size: number }[]> {
    const prefix = this.buildSkillKey(tenantId, skillId);
    const files: { name: string; size: number }[] = [];

    const stream = this.minioClient.listObjectsV2(this.bucket, prefix, true);

    for await (const obj of stream) {
      if (obj.name) {
        const relativeName = obj.name.slice(prefix.length);
        if (relativeName) {
          files.push({
            name: relativeName,
            size: obj.size,
          });
        }
      }
    }

    return files;
  }

  async getSkillFileMap(
    tenantId: string,
    skillId: string,
  ): Promise<Record<string, string>> {
    const files = await this.listSkillFiles(tenantId, skillId);
    if (files.length === 0) {
      return {};
    }

    const entries = await Promise.all(
      files.map(async (file) => {
        const stream = await this.downloadSkillFile(tenantId, skillId, file.name);
        const chunks: Buffer[] = [];

        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        return [file.name, Buffer.concat(chunks).toString('utf-8')] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  async getSkillContent(
    tenantId: string,
    skillId: string,
  ): Promise<string | null> {
    const key = this.buildSkillKey(tenantId, skillId, 'SKILL.md');

    try {
      const exists = await this.storageService.exists(key);
      if (!exists) {
        return null;
      }

      const stream = await this.storageService.download(key);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return Buffer.concat(chunks).toString('utf-8');
    } catch (error) {
      this.logger.warn(
        `读取 SKILL.md 失败 (${key}): ${(error as Error).message}`,
      );
      return null;
    }
  }
}
