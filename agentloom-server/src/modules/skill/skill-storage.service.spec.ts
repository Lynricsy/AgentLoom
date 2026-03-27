import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MINIO_CLIENT } from '../../infrastructure/storage/storage.constants';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { SKILL_FILE_MAX_SIZE } from './skill.constants';
import { SkillStorageService } from './skill-storage.service';

const mocks = vi.hoisted(() => ({
  createMockStorageService: () => ({
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn(),
    exists: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  }),

  createMockMinioClient: () => ({
    listObjectsV2: vi.fn(),
    removeObjects: vi.fn().mockResolvedValue(undefined),
  }),

  createMockConfigService: () => ({
    get: vi.fn().mockReturnValue('test-bucket'),
  }),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SKILL_ID = '33333333-3333-3333-3333-333333333333';

function createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < items.length) {
            return { value: items[index++], done: false as const };
          }
          return { value: undefined, done: true as const };
        },
      };
    },
  };
}

describe('SkillStorageService', () => {
  let service: SkillStorageService;
  let storageService: ReturnType<typeof mocks.createMockStorageService>;
  let minioClient: ReturnType<typeof mocks.createMockMinioClient>;

  beforeEach(async () => {
    storageService = mocks.createMockStorageService();
    minioClient = mocks.createMockMinioClient();
    const configService = mocks.createMockConfigService();

    const module = await Test.createTestingModule({
      providers: [
        SkillStorageService,
        { provide: StorageService, useValue: storageService },
        { provide: MINIO_CLIENT, useValue: minioClient },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(SkillStorageService);
  });

  // ─── uploadSkillFile ───────────────────────────────────────────────────
  describe('uploadSkillFile', () => {
    it('delegates to storageService.upload', async () => {
      const buffer = Buffer.from('hello');
      await service.uploadSkillFile(
        TENANT_ID,
        SKILL_ID,
        'test.md',
        buffer,
        'text/markdown',
      );

      expect(storageService.upload).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/skills/${SKILL_ID}/test.md`,
        buffer,
        buffer.length,
        'text/markdown',
      );
    });

    it('throws BadRequestException when file exceeds max size', async () => {
      const buffer = Buffer.alloc(SKILL_FILE_MAX_SIZE + 1);

      await expect(
        service.uploadSkillFile(TENANT_ID, SKILL_ID, 'large.bin', buffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows files at exactly the max size limit', async () => {
      const buffer = Buffer.alloc(SKILL_FILE_MAX_SIZE);
      await service.uploadSkillFile(TENANT_ID, SKILL_ID, 'exact.bin', buffer);
      expect(storageService.upload).toHaveBeenCalledOnce();
    });
  });

  // ─── downloadSkillFile ─────────────────────────────────────────────────
  describe('downloadSkillFile', () => {
    it('delegates to storageService.download', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      storageService.download.mockResolvedValue(mockStream);

      const result = await service.downloadSkillFile(
        TENANT_ID,
        SKILL_ID,
        'file.txt',
      );
      expect(result).toBe(mockStream);
      expect(storageService.download).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/skills/${SKILL_ID}/file.txt`,
      );
    });
  });

  // ─── deleteSkillFiles ──────────────────────────────────────────────────
  describe('deleteSkillFiles', () => {
    it('lists and removes all objects under prefix', async () => {
      const prefix = `tenants/${TENANT_ID}/skills/${SKILL_ID}/`;
      minioClient.listObjectsV2.mockReturnValue(
        createAsyncIterable([
          { name: `${prefix}file1.md`, size: 100 },
          { name: `${prefix}file2.json`, size: 200 },
        ]),
      );

      await service.deleteSkillFiles(TENANT_ID, SKILL_ID);

      expect(minioClient.removeObjects).toHaveBeenCalledWith('test-bucket', [
        `${prefix}file1.md`,
        `${prefix}file2.json`,
      ]);
    });

    it('skips removeObjects when no files found', async () => {
      minioClient.listObjectsV2.mockReturnValue(createAsyncIterable([]));

      await service.deleteSkillFiles(TENANT_ID, SKILL_ID);

      expect(minioClient.removeObjects).not.toHaveBeenCalled();
    });

    it('skips objects without name', async () => {
      const prefix = `tenants/${TENANT_ID}/skills/${SKILL_ID}/`;
      minioClient.listObjectsV2.mockReturnValue(
        createAsyncIterable([
          { name: `${prefix}valid.md`, size: 100 },
          { size: 50 },
        ]),
      );

      await service.deleteSkillFiles(TENANT_ID, SKILL_ID);

      expect(minioClient.removeObjects).toHaveBeenCalledWith('test-bucket', [
        `${prefix}valid.md`,
      ]);
    });
  });

  // ─── listSkillFiles ────────────────────────────────────────────────────
  describe('listSkillFiles', () => {
    it('returns relative names and sizes', async () => {
      const prefix = `tenants/${TENANT_ID}/skills/${SKILL_ID}/`;
      minioClient.listObjectsV2.mockReturnValue(
        createAsyncIterable([
          { name: `${prefix}SKILL.md`, size: 1000 },
          { name: `${prefix}data.json`, size: 500 },
        ]),
      );

      const result = await service.listSkillFiles(TENANT_ID, SKILL_ID);

      expect(result).toEqual([
        { name: 'SKILL.md', size: 1000 },
        { name: 'data.json', size: 500 },
      ]);
    });

    it('returns empty array when no files', async () => {
      minioClient.listObjectsV2.mockReturnValue(createAsyncIterable([]));

      const result = await service.listSkillFiles(TENANT_ID, SKILL_ID);
      expect(result).toEqual([]);
    });

    it('skips objects without name or with empty relative name', async () => {
      const prefix = `tenants/${TENANT_ID}/skills/${SKILL_ID}/`;
      minioClient.listObjectsV2.mockReturnValue(
        createAsyncIterable([
          { name: prefix, size: 0 },
          { name: `${prefix}valid.md`, size: 100 },
          { size: 200 },
        ]),
      );

      const result = await service.listSkillFiles(TENANT_ID, SKILL_ID);
      expect(result).toEqual([{ name: 'valid.md', size: 100 }]);
    });
  });

  // ─── getSkillContent ───────────────────────────────────────────────────
  describe('getSkillContent', () => {
    it('returns utf-8 content when SKILL.md exists', async () => {
      storageService.exists.mockResolvedValue(true);
      const stream = Readable.from([Buffer.from('# Hello')]);
      storageService.download.mockResolvedValue(stream);

      const result = await service.getSkillContent(TENANT_ID, SKILL_ID);

      expect(result).toBe('# Hello');
      expect(storageService.exists).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/skills/${SKILL_ID}/SKILL.md`,
      );
    });

    it('returns null when SKILL.md does not exist', async () => {
      storageService.exists.mockResolvedValue(false);

      const result = await service.getSkillContent(TENANT_ID, SKILL_ID);
      expect(result).toBeNull();
    });

    it('returns null when download throws', async () => {
      storageService.exists.mockResolvedValue(true);
      storageService.download.mockRejectedValue(new Error('Network error'));

      const result = await service.getSkillContent(TENANT_ID, SKILL_ID);
      expect(result).toBeNull();
    });
  });
});
