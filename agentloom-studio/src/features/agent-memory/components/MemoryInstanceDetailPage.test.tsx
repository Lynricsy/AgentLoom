import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '@/shared/ui/toast';
import { MemoryInstanceDetailPage } from './MemoryInstanceDetailPage';
import type { MemoryInstanceDetail } from '../types';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  useMemoryInstance: vi.fn(),
  useDeleteMemoryInstance: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../hooks/useMemoryInstances', () => ({
  useMemoryInstance: mocks.useMemoryInstance,
  useDeleteMemoryInstance: mocks.useDeleteMemoryInstance,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

/** 页面依赖 ToastProvider 上报删除失败 */
function renderPage(memoryInstanceId = 'mi-1') {
  return render(
    <ToastProvider>
      <MemoryInstanceDetailPage memoryInstanceId={memoryInstanceId} />
    </ToastProvider>,
  );
}

// --- Test data factory ---

function createMemoryInstanceDetail(
  overrides: Partial<MemoryInstanceDetail> = {},
): MemoryInstanceDetail {
  return {
    id: 'mi-1',
    name: '测试记忆实例',
    description: '这是一个测试描述',
    tenantId: 'tenant-1',
    status: 'active',
    validDomains: ['domain-a', 'domain-b'],
    coreMemoryUris: ['memory://persona/default'],
    systemPromptOverride: null,
    config: null,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-03-01T00:00:00Z',
    stats: {
      nodeCount: 42,
      edgeCount: 78,
    },
    ...overrides,
  };
}

// --- Setup ---

function setupMocks(
  overrides: {
    instance?: MemoryInstanceDetail | null;
    isLoading?: boolean;
    isError?: boolean;
  } = {},
) {
  const {
    instance = createMemoryInstanceDetail(),
    isLoading = false,
    isError = false,
  } = overrides;

  const deleteFn = vi.fn().mockResolvedValue(undefined);

  mocks.useMemoryInstance.mockReturnValue({
    data: instance,
    isLoading,
    isError,
  });

  mocks.useDeleteMemoryInstance.mockReturnValue({
    mutateAsync: deleteFn,
    isPending: false,
  });

  return { deleteFn };
}

// --- Tests ---

describe('MemoryInstanceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('显示加载状态', () => {
    setupMocks({ isLoading: true });
    renderPage();
    expect(screen.getByTestId('memory-detail-skeleton')).toBeInTheDocument();
  });

  it('显示错误信息', () => {
    setupMocks({ isError: true, instance: null });
    renderPage();
    expect(screen.getByText('加载记忆实例失败')).toBeInTheDocument();
    expect(screen.getByText('返回列表')).toBeInTheDocument();
  });

  it('显示记忆实例名称和描述', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        name: '产品知识库',
        description: '包含产品相关的知识图谱',
      }),
    });
    renderPage();

    expect(screen.getByText('产品知识库')).toBeInTheDocument();
    expect(
      screen.getByText('包含产品相关的知识图谱'),
    ).toBeInTheDocument();
  });

  it('显示统计卡片', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        stats: { nodeCount: 42, edgeCount: 78 },
        validDomains: ['d1', 'd2'],
      }),
    });
    renderPage();

    expect(screen.getByText('节点数')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('边数')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    const statCards = document.querySelectorAll(
      '[data-testid="memory-stat-card"]',
    );
    expect(statCards.length).toBe(4);
    expect(screen.getByText('创建时间')).toBeInTheDocument();
  });

  it('显示有效域列表', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        validDomains: ['product-knowledge', 'customer-service'],
      }),
    });
    renderPage();

    expect(screen.getByText('product-knowledge')).toBeInTheDocument();
    expect(screen.getByText('customer-service')).toBeInTheDocument();
  });

  it('无有效域时显示空态', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({ validDomains: [] }),
    });
    renderPage();
    expect(screen.getByText('未配置有效域')).toBeInTheDocument();
  });

  it('显示核心记忆 URI 列表', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        coreMemoryUris: ['memory://persona/default', 'memory://rules/safety'],
      }),
    });
    renderPage();

    expect(
      screen.getByText('memory://persona/default'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('memory://rules/safety'),
    ).toBeInTheDocument();
  });

  it('无核心记忆 URI 时显示空态', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({ coreMemoryUris: [] }),
    });
    renderPage();
    expect(screen.getByText('未配置核心记忆 URI')).toBeInTheDocument();
  });

  it('有自定义系统提示词时显示内容', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: '你是一个专业的客服助手',
      }),
    });
    renderPage();
    expect(
      screen.getByText('你是一个专业的客服助手'),
    ).toBeInTheDocument();
  });

  it('无自定义系统提示词时显示默认提示', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: null,
      }),
    });
    renderPage();
    expect(screen.getByText('使用默认模板')).toBeInTheDocument();
  });

  it('点击返回按钮导航到列表', async () => {
    setupMocks();
    renderPage();

    await userEvent.click(screen.getByText('返回'));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/memory' });
  });

  it('点击设置按钮导航到设置页', async () => {
    setupMocks();
    renderPage();

    await userEvent.click(screen.getByText('设置'));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/memory/$id/settings',
      params: { id: 'mi-1' },
    });
  });

  it('点击删除按钮并确认后调用 mutation', async () => {
    const { deleteFn } = setupMocks();
    renderPage();

    // 删除走 AlertDialog 二次确认，不再使用 window.confirm
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(deleteFn).toHaveBeenCalledWith('mi-1');
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/memory' });
  });

  it('显示状态标签', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({ status: 'active' }),
    });
    renderPage();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('错误页面返回列表按钮可用', async () => {
    setupMocks({ isError: true, instance: null });
    renderPage();

    await userEvent.click(screen.getByText('返回列表'));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/memory' });
  });
});
