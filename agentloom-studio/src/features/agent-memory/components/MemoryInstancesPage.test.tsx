import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryInstancesPage } from './MemoryInstancesPage';
import type { MemoryInstance } from '../types';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  useMemoryInstances: vi.fn(),
  useAllMemoryInstances: vi.fn(),
  useDeleteMemoryInstance: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../hooks/useMemoryInstances', () => ({
  useMemoryInstances: mocks.useMemoryInstances,
  useAllMemoryInstances: mocks.useAllMemoryInstances,
  useDeleteMemoryInstance: mocks.useDeleteMemoryInstance,
}));

vi.mock('./CreateMemoryDialog', () => ({
  CreateMemoryDialog: ({
    open,
    onClose,
    onSuccess,
  }: {
    open: boolean;
    onClose: () => void;
    onSuccess?: (id: string) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="新建记忆实例">
        <button onClick={onClose}>取消</button>
        <button onClick={() => onSuccess?.('new-id')}>创建</button>
      </div>
    ) : null,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

// --- Test data factory ---

function createMemoryInstance(
  overrides: Partial<MemoryInstance> = {},
): MemoryInstance {
  return {
    id: 'mi-1',
    name: '测试记忆',
    description: '这是一个测试记忆实例',
    tenantId: 'tenant-1',
    status: 'active',
    validDomains: ['domain-1'],
    coreMemoryUris: [],
    systemPromptOverride: null,
    config: null,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-03-01T00:00:00Z',
    ...overrides,
  };
}

// --- Setup ---

function setupMocks(
  overrides: {
    memoryInstances?: MemoryInstance[];
    allMemoryInstances?: MemoryInstance[];
    isLoading?: boolean;
    isAllLoading?: boolean;
  } = {},
) {
  const {
    memoryInstances = [],
    allMemoryInstances = memoryInstances,
    isLoading = false,
    isAllLoading = false,
  } = overrides;

  const deleteFn = vi.fn().mockResolvedValue(undefined);

  mocks.useMemoryInstances.mockReturnValue({
    data: {
      data: memoryInstances,
      meta: {
        page: 1,
        pageSize: 12,
        total: memoryInstances.length,
        totalPages: Math.max(1, Math.ceil(memoryInstances.length / 12)),
      },
    },
    isLoading,
  });

  mocks.useAllMemoryInstances.mockImplementation(
    ({ enabled }: { enabled?: boolean } = {}) => ({
      data: enabled ? allMemoryInstances : undefined,
      isLoading: enabled ? isAllLoading : false,
    }),
  );

  mocks.useDeleteMemoryInstance.mockReturnValue({
    mutateAsync: deleteFn,
    isPending: false,
  });

  return { deleteFn };
}

// --- Tests ---

describe('MemoryInstancesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('显示加载状态', () => {
    setupMocks({ isLoading: true });
    render(<MemoryInstancesPage />);
    // Loader2 图标会渲染，无文本指示但有旋转动画
    expect(
      document.querySelector('.animate-spin'),
    ).toBeInTheDocument();
  });

  it('显示空状态提示', () => {
    setupMocks({ memoryInstances: [] });
    render(<MemoryInstancesPage />);
    expect(screen.getByText('还没有记忆实例')).toBeInTheDocument();
    expect(
      screen.getByText(/点击「新建实例」创建你的第一个 Agent 记忆图谱/),
    ).toBeInTheDocument();
  });

  it('渲染记忆实例卡片列表', () => {
    const items = [
      createMemoryInstance({
        id: 'mi-1',
        name: '知识记忆A',
        description: '描述A',
        status: 'active',
        validDomains: ['d1', 'd2'],
      }),
      createMemoryInstance({
        id: 'mi-2',
        name: '知识记忆B',
        description: '描述B',
        status: 'archived',
        validDomains: [],
      }),
    ];
    setupMocks({ memoryInstances: items });
    render(<MemoryInstancesPage />);

    expect(screen.getByText('知识记忆A')).toBeInTheDocument();
    expect(screen.getByText('描述A')).toBeInTheDocument();
    expect(screen.getByText('知识记忆B')).toBeInTheDocument();
    expect(screen.getByText('描述B')).toBeInTheDocument();
    expect(screen.getByText('2 域')).toBeInTheDocument();
    expect(screen.getByText('0 域')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('已归档')).toBeInTheDocument();
  });

  it('搜索过滤记忆实例', async () => {
    const items = [
      createMemoryInstance({ id: 'mi-1', name: 'Alpha记忆' }),
      createMemoryInstance({ id: 'mi-2', name: 'Beta记忆' }),
    ];
    setupMocks({
      memoryInstances: items,
      allMemoryInstances: items,
    });
    render(<MemoryInstancesPage />);

    const searchInput = screen.getByPlaceholderText('搜索记忆实例...');
    await userEvent.type(searchInput, 'Alpha');

    expect(mocks.useAllMemoryInstances).toHaveBeenLastCalledWith({
      enabled: true,
    });
    expect(screen.getByText('Alpha记忆')).toBeInTheDocument();
    expect(screen.queryByText('Beta记忆')).not.toBeInTheDocument();
  });

  it('搜索无结果时显示提示', async () => {
    const items = [createMemoryInstance()];
    setupMocks({
      memoryInstances: items,
      allMemoryInstances: items,
    });
    render(<MemoryInstancesPage />);

    const searchInput = screen.getByPlaceholderText('搜索记忆实例...');
    await userEvent.type(searchInput, '不存在的内容');

    expect(screen.getByText('没有找到匹配的记忆实例')).toBeInTheDocument();
  });

  it('点击卡片导航到详情页', async () => {
    const item = createMemoryInstance({ id: 'mi-123', name: '点击测试' });
    setupMocks({ memoryInstances: [item] });
    render(<MemoryInstancesPage />);

    await userEvent.click(screen.getByText('点击测试'));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/memory/$id',
      params: { id: 'mi-123' },
    });
  });

  it('打开和关闭创建对话框', async () => {
    setupMocks();
    render(<MemoryInstancesPage />);

    // 打开对话框
    await userEvent.click(screen.getByText('新建实例'));
    expect(
      screen.getByRole('dialog', { name: '新建记忆实例' }),
    ).toBeInTheDocument();

    // 关闭对话框
    await userEvent.click(screen.getByText('取消'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('创建成功后导航到详情页', async () => {
    setupMocks();
    render(<MemoryInstancesPage />);

    await userEvent.click(screen.getByText('新建实例'));
    await userEvent.click(screen.getByText('创建'));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/memory/$id',
      params: { id: 'new-id' },
    });
  });

  it('点击删除按钮显示确认弹出框', async () => {
    const item = createMemoryInstance({
      id: 'mi-del',
      name: '待删除实例',
    });
    setupMocks({ memoryInstances: [item] });
    render(<MemoryInstancesPage />);

    await userEvent.click(screen.getByLabelText('删除 待删除实例'));
    expect(
      screen.getByText('确定要删除「待删除实例」吗？此操作不可恢复。'),
    ).toBeInTheDocument();
  });

  it('确认删除调用 mutation', async () => {
    const item = createMemoryInstance({
      id: 'mi-del',
      name: '待删除实例',
    });
    const { deleteFn } = setupMocks({ memoryInstances: [item] });
    render(<MemoryInstancesPage />);

    // 打开确认框
    await userEvent.click(screen.getByLabelText('删除 待删除实例'));
    // 点击删除
    await userEvent.click(screen.getByText('删除'));

    expect(deleteFn).toHaveBeenCalledWith('mi-del');
  });

  it('取消删除关闭确认框', async () => {
    const item = createMemoryInstance({
      id: 'mi-del',
      name: '待删除实例',
    });
    setupMocks({ memoryInstances: [item] });
    render(<MemoryInstancesPage />);

    await userEvent.click(screen.getByLabelText('删除 待删除实例'));
    expect(screen.getByText(/确定要删除/)).toBeInTheDocument();

    // 找到弹出框中的取消按钮（不是对话框的取消）
    const popover = screen.getByText(/确定要删除/).closest('div')!;
    const cancelBtn = popover.querySelector(
      'button:first-of-type',
    ) as HTMLButtonElement;
    await userEvent.click(cancelBtn);

    expect(screen.queryByText(/确定要删除/)).not.toBeInTheDocument();
  });
});
