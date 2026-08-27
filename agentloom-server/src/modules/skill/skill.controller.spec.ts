import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillStorageService } from './skill-storage.service';

const mocks = vi.hoisted(() => {
  const createMockSkillService = () => ({
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
    refreshFileMeta: vi.fn().mockResolvedValue(undefined),
  });

  const createMockSkillStorageService = () => ({
    uploadSkillFile: vi.fn().mockResolvedValue(undefined),
    downloadSkillFile: vi.fn(),
    deleteSkillFiles: vi.fn().mockResolvedValue(undefined),
    deleteSkillFile: vi.fn().mockResolvedValue(undefined),
    listSkillFiles: vi.fn().mockResolvedValue([]),
    getSkillContent: vi.fn(),
  });


  return {
    createMockSkillService,
    createMockSkillStorageService,
  };
});

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const SKILL_ID = '33333333-3333-3333-3333-333333333333';

function makeReq(overrides: Partial<Record<string, any>> = {}): any {
  return {
    tenantId: TENANT_ID,
    user: { sub: USER_ID },
    parts: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockResolvedValue({ done: true }),
      }),
    }),
    ...overrides,
  };
}

function getRoles(controller: any, methodName: string): string[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, controller[methodName]);
}

function getHttpCode(controller: any, methodName: string): number | undefined {
  return Reflect.getMetadata(HTTP_CODE_METADATA, controller[methodName]);
}

describe('SkillController', () => {
  let controller: SkillController;
  let skillService: ReturnType<typeof mocks.createMockSkillService>;
  let skillStorageService: ReturnType<
    typeof mocks.createMockSkillStorageService
  >;

  beforeEach(async () => {
    skillService = mocks.createMockSkillService();
    skillStorageService = mocks.createMockSkillStorageService();

    const module = await Test.createTestingModule({
      controllers: [SkillController],
      providers: [
        { provide: SkillService, useValue: skillService },
        { provide: SkillStorageService, useValue: skillStorageService },
      ],
    }).compile();

    controller = module.get(SkillController);
  });

  // ─── Metadata ──────────────────────────────────────────────────────────
  describe('metadata', () => {
    it('create: CREATED + owner/admin/creator', () => {
      expect(getHttpCode(controller, 'create')).toBe(HttpStatus.CREATED);
      expect(getRoles(controller, 'create')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });

    it('findAll: no roles', () => {
      expect(getRoles(controller, 'findAll')).toBeUndefined();
    });

    it('findById: no roles', () => {
      expect(getRoles(controller, 'findById')).toBeUndefined();
    });

    it('update: owner/admin/creator', () => {
      expect(getRoles(controller, 'update')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });

    it('delete: NO_CONTENT + owner/admin', () => {
      expect(getHttpCode(controller, 'delete')).toBe(HttpStatus.NO_CONTENT);
      expect(getRoles(controller, 'delete')).toEqual(['owner', 'admin']);
    });

    it('archive: owner/admin/creator', () => {
      expect(getRoles(controller, 'archive')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });

    it('listFiles: no roles', () => {
      expect(getRoles(controller, 'listFiles')).toBeUndefined();
    });

    it('downloadFile: no roles', () => {
      expect(getRoles(controller, 'downloadFile')).toBeUndefined();
    });

    it('uploadFile: CREATED + owner/admin/creator', () => {
      expect(getHttpCode(controller, 'uploadFile')).toBe(HttpStatus.CREATED);
      expect(getRoles(controller, 'uploadFile')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });

    it('deleteFile: NO_CONTENT + owner/admin/creator', () => {
      expect(getHttpCode(controller, 'deleteFile')).toBe(HttpStatus.NO_CONTENT);
      expect(getRoles(controller, 'deleteFile')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
    });
  });

  // ─── Endpoint delegation ───────────────────────────────────────────────
  describe('findAll', () => {
    it('delegates to skillService.findAll', async () => {
      const response = {
        data: [],
        meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
      };
      skillService.findAll.mockResolvedValue(response);

      const query = {
        page: 1,
        pageSize: 20,
        search: undefined,
        status: undefined,
        isBuiltin: undefined,
        sourceKind: undefined,
      };

      const result = await controller.findAll(query);
      expect(result).toEqual(response);
      expect(skillService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('delegates to skillService.findById', async () => {
      const record = { id: SKILL_ID, name: 'Skill' };
      skillService.findById.mockResolvedValue(record);

      const result = await controller.findById(makeReq(), SKILL_ID);
      expect(result).toEqual(record);
      expect(skillService.findById).toHaveBeenCalledWith(TENANT_ID, SKILL_ID);
    });
  });

  describe('delete', () => {
    it('delegates to skillService.delete', async () => {
      skillService.delete.mockResolvedValue(undefined);

      await controller.delete(makeReq(), SKILL_ID);
      expect(skillService.delete).toHaveBeenCalledWith(TENANT_ID, SKILL_ID);
    });
  });

  describe('archive', () => {
    it('delegates to skillService.archive', async () => {
      const record = { id: SKILL_ID, status: 'archived' };
      skillService.archive.mockResolvedValue(record);

      const result = await controller.archive(makeReq(), SKILL_ID);
      expect(result).toEqual(record);
      expect(skillService.archive).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        SKILL_ID,
      );
    });
  });

  describe('listFiles', () => {
    it('delegates to skillStorageService.listSkillFiles', async () => {
      const files = [{ name: 'SKILL.md', size: 100 }];
      skillStorageService.listSkillFiles.mockResolvedValue(files);

      const result = await controller.listFiles(makeReq(), SKILL_ID);
      expect(result).toEqual(files);
      expect(skillStorageService.listSkillFiles).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
      );
    });
  });

  describe('downloadFile', () => {
    it('delegates to skillStorageService.downloadSkillFile', async () => {
      const mockStream = { pipe: vi.fn() };
      skillStorageService.downloadSkillFile.mockResolvedValue(mockStream);

      const reply = {
        header: vi.fn(),
        type: vi.fn(),
        send: vi.fn().mockReturnValue('sent'),
      };

      const result = await controller.downloadFile(
        makeReq(),
        SKILL_ID,
        'test.md',
        reply,
      );
      expect(result).toBe('sent');
      expect(skillStorageService.downloadSkillFile).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
        'test.md',
      );
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent('test.md')}"`,
      );
      expect(reply.type).toHaveBeenCalledWith('application/octet-stream');
    });
  });

  describe('deleteFile', () => {
    it('delegates to skillStorageService.deleteSkillFile and refreshes meta', async () => {
      skillService.refreshFileMeta.mockResolvedValue(undefined);

      await controller.deleteFile(makeReq(), SKILL_ID, 'test.md');

      expect(skillStorageService.deleteSkillFile).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
        'test.md',
      );
      expect(skillService.refreshFileMeta).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
      );
    });
  });

  describe('uploadFile', () => {
    it('requests preserved multipart paths and rejects traversal names', async () => {
      const parts = vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'file',
            fieldname: 'file',
            filename: '../secret.txt',
            mimetype: 'text/plain',
            toBuffer: vi.fn().mockResolvedValue(Buffer.from('secret')),
          };
        },
      });
      const req = makeReq({ parts });

      await expect(controller.uploadFile(req, SKILL_ID)).rejects.toThrow(
        '文件名无效',
      );
      expect(parts).toHaveBeenCalledWith({ preservePath: true });
      expect(skillStorageService.uploadSkillFile).not.toHaveBeenCalled();
    });

    it('stores a safe nested multipart name by basename', async () => {
      const parts = vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'file',
            fieldname: 'file',
            filename: 'examples/input.txt',
            mimetype: 'text/plain',
            toBuffer: vi.fn().mockResolvedValue(Buffer.from('example')),
          };
        },
      });

      const result = await controller.uploadFile(makeReq({ parts }), SKILL_ID);

      expect(skillStorageService.uploadSkillFile).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
        'input.txt',
        Buffer.from('example'),
        'text/plain',
      );
      expect(result).toEqual({
        message: '文件上传成功',
        fileName: 'input.txt',
      });
    });
  });

  // ─── requireTenantId ───────────────────────────────────────────────────
  describe('requireTenantId', () => {
    it('throws TenantRequiredException when tenantId missing', async () => {
      const req = makeReq({ tenantId: undefined });

      await expect(controller.findById(req, SKILL_ID)).rejects.toThrow();
    });
  });
});
