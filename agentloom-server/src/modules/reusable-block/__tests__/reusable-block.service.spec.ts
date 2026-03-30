import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import {
  CreateReusableBlockDto,
  QueryReusableBlockDto,
  UpdateReusableBlockDto,
} from '../dto/reusable-block.dto';
import {
  InvalidBlockDefinitionException,
  ReusableBlockConflictException,
  ReusableBlockNotFoundException,
} from '../reusable-block.exceptions';
import { ReusableBlockService } from '../reusable-block.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const BLOCK_ID = '00000000-0000-0000-0000-000000000004';
const NOW = new Date('2025-01-01T00:00:00.000Z');

const VALID_DEFINITION = {
  nodes: [
    {
      id: 'node-1',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { label: '开始' },
    },
  ],
  edges: [],
  inputPorts: [
    {
      id: 'input-topic',
      label: '主题',
      dataType: 'text' as const,
    },
  ],
  outputPorts: [
    {
      id: 'output-result',
      label: '结果',
      dataType: 'json' as const,
      sourceNodeId: 'node-1',
      sourcePortId: 'result-out',
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

function createReusableBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: BLOCK_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    name: '测试可复用块',
    description: '测试描述',
    category: 'analysis',
    tags: ['analysis'],
    definition: VALID_DEFINITION,
    metadata: {
      nodeCount: 1,
      author: '狐娘',
      version: 1,
    },
    version: 1,
    isPublished: false,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createReusableBlockListItem(overrides: Record<string, unknown> = {}) {
  const { definition: _definition, ...listItem } =
    createReusableBlock(overrides);
  return listItem;
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit, offset };
}

function createSelectChainWithLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function createDeleteChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  return { where, returning };
}

function createQueryDto(
  overrides: Partial<QueryReusableBlockDto> = {},
): QueryReusableBlockDto {
  return Object.assign(new QueryReusableBlockDto(), overrides);
}

function createCreateDto(
  overrides: Partial<CreateReusableBlockDto> = {},
): CreateReusableBlockDto {
  return Object.assign(new CreateReusableBlockDto(), {
    name: '新的可复用块',
    definition: VALID_DEFINITION,
    metadata: {
      nodeCount: 1,
      author: '狐娘',
      version: 1,
    },
    ...overrides,
  });
}

function createUpdateDto(
  overrides: Partial<UpdateReusableBlockDto> = {},
): UpdateReusableBlockDto {
  return Object.assign(new UpdateReusableBlockDto(), {
    version: 1,
    ...overrides,
  });
}

describe('ReusableBlockService', () => {
  let service: ReusableBlockService;
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (callback: (tx: typeof db) => unknown) =>
        callback(db),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReusableBlockService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(ReusableBlockService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('findAll', () => {
    it('应当返回分页后的可复用块列表并排除 definition', async () => {
      const selectData = createSelectChainWithPagination([
        createReusableBlockListItem({ name: '块 A' }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAll(
        TENANT_ID,
        createQueryDto({ page: 2, pageSize: 10, search: '块' }),
      );

      expect(selectData.limit).toHaveBeenCalledWith(10);
      expect(selectData.offset).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: [createReusableBlockListItem({ name: '块 A' })],
        meta: {
          page: 2,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
      });
      expect(result.data[0]).not.toHaveProperty('definition');
    });
  });

  describe('findById', () => {
    it('应当返回指定可复用块', async () => {
      const selectBlock = createSelectChain([createReusableBlock()]);
      db.select.mockReturnValue(selectBlock);

      const result = await service.findById(TENANT_ID, BLOCK_ID);

      expect(result).toEqual(createReusableBlock());
    });

    it('未找到时应抛出 404', async () => {
      const selectBlock = createSelectChain([]);
      db.select.mockReturnValue(selectBlock);

      await expect(
        service.findById(TENANT_ID, BLOCK_ID),
      ).rejects.toBeInstanceOf(ReusableBlockNotFoundException);
    });
  });

  describe('create', () => {
    it('应当创建可复用块并自动补全默认 tags', async () => {
      const selectOrg = createSelectChainWithLimit([{ id: ORG_ID }]);
      const insertBlock = createInsertChain([createReusableBlock()]);
      db.select.mockReturnValue(selectOrg);
      db.insert.mockReturnValue(insertBlock);

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        createCreateDto(),
      );

      expect(selectOrg.limit).toHaveBeenCalledWith(1);
      expect(insertBlock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          tenantId: TENANT_ID,
          createdBy: USER_ID,
          tags: [],
          category: null,
        }),
      );
      expect(result).toEqual(createReusableBlock());
    });
  });

  describe('update', () => {
    it('应当在 OCC 通过时更新可复用块', async () => {
      const updatedBlock = createReusableBlock({
        name: '已更新块',
        description: null,
        version: 2,
        isPublished: true,
        updatedAt: NOW,
      });
      const updateBlock = createUpdateChain([updatedBlock]);
      db.update.mockReturnValue(updateBlock);

      const result = await service.update(
        TENANT_ID,
        BLOCK_ID,
        createUpdateDto({
          name: '已更新块',
          description: null,
          isPublished: true,
        }),
      );

      expect(updateBlock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '已更新块',
          description: null,
          isPublished: true,
          updatedAt: NOW,
        }),
      );
      expect(result).toEqual(updatedBlock);
    });

    it('更新不存在的可复用块时应抛出 404', async () => {
      const updateBlock = createUpdateChain([]);
      const selectBlock = createSelectChain([]);
      db.update.mockReturnValue(updateBlock);
      db.select.mockReturnValue(selectBlock);

      await expect(
        service.update(TENANT_ID, BLOCK_ID, createUpdateDto()),
      ).rejects.toBeInstanceOf(ReusableBlockNotFoundException);
    });

    it('版本冲突时应抛出 409 并返回 currentVersion', async () => {
      const updateBlock = createUpdateChain([]);
      const selectBlock = createSelectChain([
        createReusableBlock({ version: 3 }),
      ]);
      db.update.mockReturnValue(updateBlock);
      db.select.mockReturnValue(selectBlock);

      await expect(
        service.update(TENANT_ID, BLOCK_ID, createUpdateDto({ version: 1 })),
      ).rejects.toMatchObject({
        constructor: ReusableBlockConflictException,
        extensions: { currentVersion: 3 },
      });
    });
  });

  describe('remove', () => {
    it('应当删除可复用块', async () => {
      const deleteBlock = createDeleteChain([{ id: BLOCK_ID }]);
      db.delete.mockReturnValue(deleteBlock);

      await expect(
        service.remove(TENANT_ID, BLOCK_ID),
      ).resolves.toBeUndefined();
    });

    it('删除不存在的可复用块时应抛出 404', async () => {
      const deleteBlock = createDeleteChain([]);
      db.delete.mockReturnValue(deleteBlock);

      await expect(service.remove(TENANT_ID, BLOCK_ID)).rejects.toBeInstanceOf(
        ReusableBlockNotFoundException,
      );
    });
  });

  describe('definition validation', () => {
    it('nodes 为空时应抛出 422', async () => {
      await expect(
        service.create(
          TENANT_ID,
          USER_ID,
          createCreateDto({
            definition: {
              ...VALID_DEFINITION,
              nodes: [],
            },
          }),
        ),
      ).rejects.toBeInstanceOf(InvalidBlockDefinitionException);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('边引用不存在节点时应抛出 422', async () => {
      await expect(
        service.create(
          TENANT_ID,
          USER_ID,
          createCreateDto({
            definition: {
              ...VALID_DEFINITION,
              edges: [
                {
                  id: 'edge-1',
                  source: 'node-1',
                  target: 'missing-node',
                },
              ],
            },
          }),
        ),
      ).rejects.toBeInstanceOf(InvalidBlockDefinitionException);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('非法端口类型时应抛出 422', async () => {
      await expect(
        service.update(
          TENANT_ID,
          BLOCK_ID,
          createUpdateDto({
            definition: {
              ...VALID_DEFINITION,
              inputPorts: [
                {
                  id: 'input-topic',
                  label: '主题',
                  dataType: 'number' as unknown as 'text',
                },
              ],
            },
          }),
        ),
      ).rejects.toBeInstanceOf(InvalidBlockDefinitionException);
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
