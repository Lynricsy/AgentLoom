import { describe, it, expect, vi } from 'vitest';

import { TemplateController } from '../template.controller';
import type { TemplateService } from '../template.service';

const IS_PUBLIC_KEY = 'isPublic';

describe('TemplateController', () => {
  const mockService: Record<keyof TemplateService, ReturnType<typeof vi.fn>> = {
    findAll: vi.fn(),
    findBySlug: vi.fn(),
  };

  const controller = new TemplateController(mockService as never);

  describe('decorators', () => {
    it('should have @Public() on the controller class', () => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, TemplateController);
      expect(isPublic).toBe(true);
    });
  });

  describe('list', () => {
    it('should delegate to service.findAll with query params', async () => {
      const mockResult = {
        data: [{ id: '1', slug: 'test', name: 'Test' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
      mockService.findAll.mockResolvedValue(mockResult);

      const query = { category: 'automation' as const, page: 2, pageSize: 10 };
      const result = await controller.list(query);

      expect(result).toEqual(mockResult);
      expect(mockService.findAll).toHaveBeenCalledWith('automation', 2, 10);
    });

    it('should pass undefined category when not provided', async () => {
      const mockResult = {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      };
      mockService.findAll.mockResolvedValue(mockResult);

      await controller.list({ page: 1, pageSize: 20 });

      expect(mockService.findAll).toHaveBeenCalledWith(undefined, 1, 20);
    });
  });

  describe('detail', () => {
    it('should delegate to service.findBySlug', async () => {
      const mockTemplate = { id: '1', slug: 'chatbot', name: 'Chatbot' };
      mockService.findBySlug.mockResolvedValue(mockTemplate);

      const result = await controller.detail('chatbot');

      expect(result).toEqual(mockTemplate);
      expect(mockService.findBySlug).toHaveBeenCalledWith('chatbot');
    });
  });
});
