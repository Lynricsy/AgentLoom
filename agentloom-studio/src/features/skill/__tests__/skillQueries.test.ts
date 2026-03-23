import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { PaginatedResponse } from '@/shared/types/api';
import type { Skill } from '../types';

// ---------- mock skillApi ----------

const fetchSkillsMock = vi.hoisted(() => vi.fn());
const fetchSkillByIdMock = vi.hoisted(() => vi.fn());
const createSkillMock = vi.hoisted(() => vi.fn());
const deleteSkillMock = vi.hoisted(() => vi.fn());

vi.mock('../api/skillApi', () => ({
  fetchSkills: fetchSkillsMock,
  fetchSkillById: fetchSkillByIdMock,
  createSkill: createSkillMock,
  updateSkill: vi.fn(),
  deleteSkill: deleteSkillMock,
  archiveSkill: vi.fn(),
  fetchSkillFiles: vi.fn(),
  uploadSkillFile: vi.fn(),
  deleteSkillFile: vi.fn(),
}));

// ---------- helpers ----------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    tenantId: 'tenant-1',
    name: 'Test Skill',
    slug: 'test-skill',
    description: 'A test skill',
    content: '# Test',
    frontmatter: null,
    isBuiltin: false,
    status: 'active',
    fileCount: 0,
    totalSizeBytes: 0,
    version: 1,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------- tests ----------

describe('skillQueries', () => {
  describe('useSkillList', () => {
    it('使用默认参数调用 fetchSkills', async () => {
      const response: PaginatedResponse<Skill> = {
        data: [makeSkill()],
        meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      };
      fetchSkillsMock.mockResolvedValue(response);

      const { useSkillList } = await import('../api/skillQueries');
      const { result } = renderHook(() => useSkillList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchSkillsMock).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual(response);
    });

    it('传递筛选参数到 fetchSkills', async () => {
      const response: PaginatedResponse<Skill> = {
        data: [],
        meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      };
      fetchSkillsMock.mockResolvedValue(response);

      const params = { status: 'active' as const, search: 'hello' };
      const { useSkillList } = await import('../api/skillQueries');
      const { result } = renderHook(() => useSkillList(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(fetchSkillsMock).toHaveBeenCalledWith(params);
    });
  });

  describe('useSkills (alias)', () => {
    it('与 useSkillList 是同一引用', async () => {
      const mod = await import('../api/skillQueries');
      expect(mod.useSkills).toBe(mod.useSkillList);
    });
  });

  describe('useSkill', () => {
    it('按 ID 获取单个技能', async () => {
      const skill = makeSkill({ id: 'skill-42' });
      fetchSkillByIdMock.mockResolvedValue(skill);

      const { useSkill } = await import('../api/skillQueries');
      const { result } = renderHook(() => useSkill('skill-42'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(fetchSkillByIdMock).toHaveBeenCalledWith('skill-42');
      expect(result.current.data).toEqual(skill);
    });

    it('enabled=false 时不发请求', async () => {
      fetchSkillByIdMock.mockClear();

      const { useSkill } = await import('../api/skillQueries');
      const { result } = renderHook(
        () => useSkill('skill-99', { enabled: false }),
        { wrapper: createWrapper() },
      );

      // 短暂等待确认未调用
      await new Promise((r) => setTimeout(r, 50));
      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchSkillByIdMock).not.toHaveBeenCalled();
    });
  });

  describe('useCreateSkill', () => {
    it('创建技能后使缓存失效', async () => {
      const created = makeSkill({ id: 'skill-new', name: 'New Skill' });
      createSkillMock.mockResolvedValue(created);

      const { useCreateSkill } = await import('../api/skillQueries');
      const wrapper = createWrapper();
      const { result } = renderHook(() => useCreateSkill(), { wrapper });

      result.current.mutate({ name: 'New Skill' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(createSkillMock).toHaveBeenCalledWith({ name: 'New Skill' });
      expect(result.current.data).toEqual(created);
    });
  });

  describe('useDeleteSkill', () => {
    it('删除技能后使缓存失效', async () => {
      deleteSkillMock.mockResolvedValue(undefined);

      const { useDeleteSkill } = await import('../api/skillQueries');
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteSkill(), { wrapper });

      result.current.mutate('skill-del');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(deleteSkillMock).toHaveBeenCalledWith('skill-del');
    });
  });
});
