import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../../../database/database.module';
import { TemplateService } from '../template.service';
import { TemplateNotFoundException } from '../template.exceptions';

// ── mock DB chain ──────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const selectFn = vi.fn();

  return {
    db: { select: selectFn },
    selectFn,
  };
});

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [TemplateService, { provide: DRIZZLE, useValue: mocks.db }],
    }).compile();

    service = moduleRef.get(TemplateService);
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      const updatedAt = new Date('2025-01-02T00:00:00.000Z');
      const mockRows = [
        {
          id: '1',
          slug: 'chatbot',
          name: 'Chatbot',
          description: 'desc',
          category: 'automation',
          tags: ['tag'],
          thumbnailUrl: null,
          metadata: {},
          displayOrder: 0,
          createdAt,
          updatedAt,
        },
      ];

      // count query chain
      const countWhere = vi.fn().mockResolvedValue([{ value: 1 }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });

      // data query chain
      const dataOffset = vi.fn().mockResolvedValue(mockRows);
      const dataLimit = vi.fn().mockReturnValue({ offset: dataOffset });
      const dataOrderBy = vi.fn().mockReturnValue({ limit: dataLimit });
      const dataWhere = vi.fn().mockReturnValue({ orderBy: dataOrderBy });
      const dataFrom = vi.fn().mockReturnValue({ where: dataWhere });

      mocks.db.select
        .mockReturnValueOnce({ from: countFrom })
        .mockReturnValueOnce({ from: dataFrom });

      const result = await service.findAll(undefined, 1, 20);

      expect(result.data).toEqual([
        {
          ...mockRows[0],
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ]);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(mocks.db.select).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      const countWhere = vi.fn().mockResolvedValue([{ value: 0 }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });

      const dataOffset = vi.fn().mockResolvedValue([]);
      const dataLimit = vi.fn().mockReturnValue({ offset: dataOffset });
      const dataOrderBy = vi.fn().mockReturnValue({ limit: dataLimit });
      const dataWhere = vi.fn().mockReturnValue({ orderBy: dataOrderBy });
      const dataFrom = vi.fn().mockReturnValue({ where: dataWhere });

      mocks.db.select
        .mockReturnValueOnce({ from: countFrom })
        .mockReturnValueOnce({ from: dataFrom });

      const result = await service.findAll(undefined, 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('should filter by category when provided', async () => {
      const countWhere = vi.fn().mockResolvedValue([{ value: 0 }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });

      const dataOffset = vi.fn().mockResolvedValue([]);
      const dataLimit = vi.fn().mockReturnValue({ offset: dataOffset });
      const dataOrderBy = vi.fn().mockReturnValue({ limit: dataLimit });
      const dataWhere = vi.fn().mockReturnValue({ orderBy: dataOrderBy });
      const dataFrom = vi.fn().mockReturnValue({ where: dataWhere });

      mocks.db.select
        .mockReturnValueOnce({ from: countFrom })
        .mockReturnValueOnce({ from: dataFrom });

      await service.findAll('automation', 1, 10);

      // Verify where was called (with category filter)
      expect(countWhere).toHaveBeenCalled();
      expect(dataWhere).toHaveBeenCalled();
    });

    it('should calculate correct pagination offset', async () => {
      const countWhere = vi.fn().mockResolvedValue([{ value: 50 }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });

      const dataOffset = vi.fn().mockResolvedValue([]);
      const dataLimit = vi.fn().mockReturnValue({ offset: dataOffset });
      const dataOrderBy = vi.fn().mockReturnValue({ limit: dataLimit });
      const dataWhere = vi.fn().mockReturnValue({ orderBy: dataOrderBy });
      const dataFrom = vi.fn().mockReturnValue({ where: dataWhere });

      mocks.db.select
        .mockReturnValueOnce({ from: countFrom })
        .mockReturnValueOnce({ from: dataFrom });

      const result = await service.findAll(undefined, 3, 10);

      expect(result.meta.totalPages).toBe(5);
      // Verify offset(20) was called for page 3 with pageSize 10
      expect(dataOffset).toHaveBeenCalledWith(20);
    });
  });

  describe('findBySlug', () => {
    it('should return template when found', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      const updatedAt = new Date('2025-01-02T00:00:00.000Z');
      const mockTemplate = {
        id: '1',
        slug: 'chatbot',
        name: 'Chatbot',
        description: 'desc',
        category: 'automation',
        tags: ['tag'],
        thumbnailUrl: null,
        metadata: {},
        displayOrder: 0,
        createdAt,
        updatedAt,
        definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      };

      const limitFn = vi.fn().mockResolvedValue([mockTemplate]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      mocks.db.select.mockReturnValue({ from: fromFn });

      const result = await service.findBySlug('chatbot');

      expect(result).toEqual({
        ...mockTemplate,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
    });

    it('should throw TemplateNotFoundException when not found', async () => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      mocks.db.select.mockReturnValue({ from: fromFn });

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(
        TemplateNotFoundException,
      );
    });
  });
});
