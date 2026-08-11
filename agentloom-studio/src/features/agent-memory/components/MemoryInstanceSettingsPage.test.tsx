import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '@/shared/ui/toast';
import { MemoryInstanceSettingsPage } from './MemoryInstanceSettingsPage';
import type { MemoryInstanceDetail } from '../types';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  useMemoryInstance: vi.fn(),
  useUpdateMemoryInstance: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../hooks/useMemoryInstances', () => ({
  useMemoryInstance: mocks.useMemoryInstance,
  useUpdateMemoryInstance: mocks.useUpdateMemoryInstance,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

/** 页面依赖 ToastProvider 上报保存失败 */
function renderPage(memoryInstanceId = 'mi-1') {
  return render(
    <ToastProvider>
      <MemoryInstanceSettingsPage memoryInstanceId={memoryInstanceId} />
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
    description: '这是测试描述',
    tenantId: 'tenant-1',
    status: 'active',
    validDomains: ['domain-a'],
    coreMemoryUris: ['memory://default'],
    systemPromptOverride: null,
    config: null,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-03-01T00:00:00Z',
    stats: { nodeCount: 10, edgeCount: 20 },
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

  const mutateAsyncFn = vi.fn().mockResolvedValue(instance);

  mocks.useMemoryInstance.mockReturnValue({
    data: instance,
    isLoading,
    isError,
  });

  mocks.useUpdateMemoryInstance.mockReturnValue({
    mutateAsync: mutateAsyncFn,
    isPending: false,
    isError: false,
  });

  return { mutateAsyncFn };
}

// --- Tests ---

describe('MemoryInstanceSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('显示加载状态', () => {
    setupMocks({ isLoading: true });
    renderPage();
    expect(screen.getByTestId('memory-settings-skeleton')).toBeInTheDocument();
  });

  it('显示错误页面', () => {
    setupMocks({ isError: true, instance: null });
    renderPage();
    expect(screen.getByText('加载记忆实例失败')).toBeInTheDocument();
    expect(screen.getByText('返回列表')).toBeInTheDocument();
  });

  it('加载后预填充表单', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        name: '预填充名称',
        description: '预填充描述',
        validDomains: ['d1', 'd2'],
        coreMemoryUris: ['uri1'],
      }),
    });
    renderPage();

    expect(screen.getByDisplayValue('预填充名称')).toBeInTheDocument();
    expect(screen.getByDisplayValue('预填充描述')).toBeInTheDocument();
    const domainsTextarea = screen.getByLabelText('有效域') as HTMLTextAreaElement;
    expect(domainsTextarea.value).toBe('d1\nd2');
    const urisTextarea = screen.getByLabelText('核心记忆 URI') as HTMLTextAreaElement;
    expect(urisTextarea.value).toBe('uri1');
  });

  it('默认选中"使用默认模板"模式', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: null,
      }),
    });
    renderPage();

    expect(screen.getByText('使用默认模板')).toBeInTheDocument();
    expect(
      screen.getByText(
        /将使用系统默认的记忆提示词模板/,
      ),
    ).toBeInTheDocument();
  });

  it('有自定义提示词时选中"自定义覆盖"模式', () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: '自定义提示词内容',
      }),
    });
    renderPage();

    expect(
      screen.getByDisplayValue('自定义提示词内容'),
    ).toBeInTheDocument();
  });

  it('切换到自定义模式显示编辑器', async () => {
    setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: null,
      }),
    });
    renderPage();

    // 默认不显示编辑器
    expect(
      screen.queryByPlaceholderText('输入自定义系统提示词...'),
    ).not.toBeInTheDocument();

    // 切换到自定义模式
    await userEvent.click(screen.getByRole('radio', { name: '自定义覆盖' }));

    // 现在显示编辑器
    expect(
      screen.getByPlaceholderText('输入自定义系统提示词...'),
    ).toBeInTheDocument();
  });

  it('保存时调用 mutation 并导航返回', async () => {
    const { mutateAsyncFn } = setupMocks({
      instance: createMemoryInstanceDetail({
        name: '原始名称',
        validDomains: [],
        coreMemoryUris: [],
      }),
    });
    renderPage();

    // 修改名称
    const nameInput = screen.getByDisplayValue('原始名称');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '新名称');

    // 点击保存
    await userEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mutateAsyncFn).toHaveBeenCalledWith({
        id: 'mi-1',
        input: expect.objectContaining({
          name: '新名称',
        }),
      });
    });

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/memory/$id',
        params: { id: 'mi-1' },
      });
    });
  });

  it('保存自定义提示词', async () => {
    const { mutateAsyncFn } = setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: null,
      }),
    });
    renderPage();

    // 切换到自定义模式
    await userEvent.click(screen.getByRole('radio', { name: '自定义覆盖' }));

    // 输入提示词
    const textarea = screen.getByPlaceholderText(
      '输入自定义系统提示词...',
    );
    await userEvent.type(textarea, '新的系统提示词');

    // 保存
    await userEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mutateAsyncFn).toHaveBeenCalledWith({
        id: 'mi-1',
        input: expect.objectContaining({
          systemPromptOverride: '新的系统提示词',
        }),
      });
    });
  });

  it('使用默认模板时 systemPromptOverride 为 null', async () => {
    const { mutateAsyncFn } = setupMocks({
      instance: createMemoryInstanceDetail({
        systemPromptOverride: '旧提示词',
      }),
    });
    renderPage();

    // 切换回默认模板
    await userEvent.click(screen.getByRole('radio', { name: '使用默认模板' }));

    // 保存
    await userEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mutateAsyncFn).toHaveBeenCalledWith({
        id: 'mi-1',
        input: expect.objectContaining({
          systemPromptOverride: null,
        }),
      });
    });
  });

  it('名称为空时保存按钮禁用', async () => {
    setupMocks();
    renderPage();

    const nameInput = screen.getByDisplayValue('测试记忆实例');
    await userEvent.clear(nameInput);

    const saveBtn = screen.getByText('保存');
    expect(saveBtn.closest('button')).toBeDisabled();
  });

  it('点击返回详情按钮导航', async () => {
    setupMocks();
    renderPage();

    await userEvent.click(screen.getByText('返回详情'));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/memory/$id',
      params: { id: 'mi-1' },
    });
  });

  it('点击取消按钮导航返回', async () => {
    setupMocks();
    renderPage();

    await userEvent.click(screen.getByText('取消'));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/memory/$id',
      params: { id: 'mi-1' },
    });
  });

  it('有效域文本按行分割保存', async () => {
    const { mutateAsyncFn } = setupMocks({
      instance: createMemoryInstanceDetail({ validDomains: [] }),
    });
    renderPage();

    const domainTextarea = screen.getByLabelText('有效域');
    await userEvent.type(
      domainTextarea,
      'product-knowledge\ncustomer-service',
    );

    await userEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mutateAsyncFn).toHaveBeenCalledWith({
        id: 'mi-1',
        input: expect.objectContaining({
          validDomains: ['product-knowledge', 'customer-service'],
        }),
      });
    });
  });
});
