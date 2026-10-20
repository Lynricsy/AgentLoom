import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SkillController } from './skill.controller';
import {
  SkillFileNameConflictException,
  SkillFileNameInvalidException,
  SkillMultipartRequiredException,
} from './skill.exceptions';
import { SkillService } from './skill.service';

const mocks = vi.hoisted(() => {
  const createMockSkillService = () => ({
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    downloadFile: vi.fn(),
    uploadFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  });

  return { createMockSkillService };
});

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const SKILL_ID = '33333333-3333-3333-3333-333333333333';

function makeReq(overrides: Partial<Record<string, any>> = {}): any {
  return {
    tenantId: TENANT_ID,
    user: { sub: USER_ID },
    isMultipart: vi.fn().mockReturnValue(true),
    parts: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockResolvedValue({ done: true }),
      }),
    }),
    ...overrides,
  };
}

function makeFilePart(filename: string, content = 'x') {
  return {
    type: 'file',
    fieldname: 'file',
    filename,
    mimetype: 'text/plain',
    toBuffer: vi.fn().mockResolvedValue(Buffer.from(content)),
  };
}

function makeParts(...items: unknown[]) {
  return vi.fn().mockReturnValue({
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  });
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

  beforeEach(async () => {
    skillService = mocks.createMockSkillService();

    const module = await Test.createTestingModule({
      controllers: [SkillController],
      providers: [{ provide: SkillService, useValue: skillService }],
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
    it('delegates to skillService.findById and wraps the result in { data }', async () => {
      const record = { id: SKILL_ID, name: 'Skill' };
      skillService.findById.mockResolvedValue(record);

      const result = await controller.findById(makeReq(), SKILL_ID);
      expect(result).toEqual({ data: record });
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
    it('delegates to skillService.archive and wraps the result in { data }', async () => {
      const record = { id: SKILL_ID, status: 'archived' };
      skillService.archive.mockResolvedValue(record);

      const result = await controller.archive(makeReq(), SKILL_ID);
      expect(result).toEqual({ data: record });
      expect(skillService.archive).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        SKILL_ID,
      );
    });
  });

  describe('listFiles', () => {
    it('delegates to skillService.listFiles (checks skill existence) and wraps the list in { data }', async () => {
      const files = [{ name: 'SKILL.md', size: 100 }];
      skillService.listFiles.mockResolvedValue(files);

      const result = await controller.listFiles(makeReq(), SKILL_ID);
      expect(result).toEqual({ data: files });
      expect(skillService.listFiles).toHaveBeenCalledWith(TENANT_ID, SKILL_ID);
    });
  });

  describe('downloadFile', () => {
    it('delegates to skillService.downloadFile', async () => {
      const mockStream = { pipe: vi.fn() };
      skillService.downloadFile.mockResolvedValue(mockStream);

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
      expect(skillService.downloadFile).toHaveBeenCalledWith(
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
    it('delegates to skillService.deleteFile', async () => {
      await controller.deleteFile(makeReq(), SKILL_ID, 'test.md');

      expect(skillService.deleteFile).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
        'test.md',
      );
    });
  });

  describe('uploadFile', () => {
    it('requests preserved multipart paths and rejects traversal names', async () => {
      const parts = makeParts(makeFilePart('../secret.txt', 'secret'));
      const req = makeReq({ parts });

      await expect(controller.uploadFile(req, SKILL_ID)).rejects.toThrow(
        '文件名无效',
      );
      expect(parts).toHaveBeenCalledWith({ preservePath: true });
      expect(skillService.uploadFile).not.toHaveBeenCalled();
    });

    it('keeps a safe nested multipart path instead of flattening it', async () => {
      const parts = makeParts(makeFilePart('scripts/run.sh', 'example'));

      const result = await controller.uploadFile(makeReq({ parts }), SKILL_ID);

      expect(skillService.uploadFile).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
        expect.objectContaining({
          filename: 'scripts/run.sh',
          buffer: Buffer.from('example'),
        }),
      );
      expect(result).toEqual({
        data: { name: 'scripts/run.sh', size: Buffer.byteLength('example') },
      });
    });

    it('rejects absolute paths', async () => {
      const parts = makeParts(makeFilePart('/etc/passwd'));

      await expect(
        controller.uploadFile(makeReq({ parts }), SKILL_ID),
      ).rejects.toThrow(SkillFileNameInvalidException);
    });

    it('rejects non-multipart requests with 415 before reading parts', async () => {
      const parts = vi.fn();
      const req = makeReq({
        isMultipart: vi.fn().mockReturnValue(false),
        parts,
      });

      await expect(controller.uploadFile(req, SKILL_ID)).rejects.toThrow(
        SkillMultipartRequiredException,
      );
      await expect(controller.create(req)).rejects.toThrow(
        SkillMultipartRequiredException,
      );
      expect(parts).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rejects duplicate file paths in one request instead of overwriting', async () => {
      const parts = makeParts(
        { type: 'field', fieldname: 'metadata', value: '{"name":"s"}' },
        makeFilePart('a/x.md', 'aaa'),
        makeFilePart('b/x.md', 'bbbbb'),
        makeFilePart('a/x.md', 'again'),
      );

      await expect(controller.create(makeReq({ parts }))).rejects.toThrow(
        SkillFileNameConflictException,
      );
      expect(skillService.create).not.toHaveBeenCalled();
    });

    it('stores same basename under different directories as distinct files', async () => {
      const parts = makeParts(
        {
          type: 'field',
          fieldname: 'metadata',
          value: '{"name":"s","description":"d"}',
        },
        makeFilePart('a/x.md', 'aaa'),
        makeFilePart('b/x.md', 'bbbbb'),
      );

      await controller.create(makeReq({ parts }));

      const files = skillService.create.mock.calls[0][3] as Array<{
        filename: string;
      }>;
      expect(files.map((file) => file.filename)).toEqual(['a/x.md', 'b/x.md']);
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
