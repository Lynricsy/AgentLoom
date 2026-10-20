import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import type { Skill } from '../types';

const updateMutate = vi.fn();
const createMutateAsync = vi.fn();

vi.mock('@monaco-editor/react', () => ({ default: () => null }));
vi.mock('@/shared/hooks/use-theme', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
vi.mock('../api/skillQueries', () => ({
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useSkillFiles: () => ({ data: [], isLoading: false }),
  useUploadSkillFile: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkillFile: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { CreateSkillDialog } from '../components/CreateSkillDialog';

const skill: Skill = {
  id: 'skill-1',
  tenantId: 'tenant-1',
  name: '代码审查',
  description: '审查 PR',
  content: '# 代码审查',
  status: 'active',
  isBuiltin: false,
  fileCount: 0,
  totalSizeBytes: 0,
  version: 3,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as Skill;

function conflictError(): HTTPError {
  const response = new Response(null, { status: 409 });
  const error = new HTTPError(
    response,
    new Request('http://localhost/api/v1/skills/skill-1', { method: 'PUT' }),
    {} as never,
  );
  // ky 把错误响应体预解析到 error.data（resolveProblemDetail 读取的位置）
  return Object.assign(error, {
    data: {
      type: 'https://agentloom.dev/errors/optimistic-lock-conflict',
      title: 'Conflict',
      detail: '技能已被其他人修改',
    },
  });
}

describe('CreateSkillDialog 编辑保存', () => {
  beforeEach(() => {
    updateMutate.mockReset();
    createMutateAsync.mockReset();
  });

  it('保存时携带当前版本作为 occVersion', () => {
    render(<CreateSkillDialog open onOpenChange={vi.fn()} skill={skill} />);

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'skill-1', name: '代码审查', occVersion: 3 }),
      expect.anything(),
    );
  });

  it('保存失败时显示服务端说明且对话框保持打开', async () => {
    const onOpenChange = vi.fn();
    updateMutate.mockImplementation(
      (_vars: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(conflictError());
      },
    );
    render(
      <CreateSkillDialog open onOpenChange={onOpenChange} skill={skill} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '技能已被其他人修改',
      );
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
