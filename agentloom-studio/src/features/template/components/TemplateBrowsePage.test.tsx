import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TemplateBrowsePage } from './TemplateBrowsePage';
import type { TemplateListItem } from '../types';

const mockUseTemplates = vi.fn();
const mockUseTemplateBySlug = vi.fn();

vi.mock('../api/templateQueries', () => ({
  useTemplates: (...args: unknown[]) => mockUseTemplates(...args),
  useTemplateBySlug: (...args: unknown[]) => mockUseTemplateBySlug(...args),
}));

vi.mock('./TemplateCard', () => ({
  TemplateCard: ({
    template,
    onClick,
  }: {
    template: TemplateListItem;
    onClick: (t: TemplateListItem) => void;
  }) => (
    <button type="button" data-testid={`card-${template.slug}`} onClick={() => onClick(template)}>
      {template.name}
    </button>
  ),
}));

vi.mock('./TemplateWizardDialog', () => ({
  TemplateWizardDialog: ({
    template,
    open,
  }: {
    template: unknown;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="wizard-dialog">
        {(template as TemplateListItem | null)?.name ?? 'no-template'}
      </div>
    ) : null,
}));

function makeTemplate(
  overrides?: Partial<TemplateListItem>,
): TemplateListItem {
  return {
    id: 'tpl-1',
    slug: 'test-tpl',
    name: '测试模板',
    description: '描述',
    category: 'analysis',
    tags: [],
    thumbnailUrl: null,
    metadata: {},
    displayOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TemplateBrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTemplateBySlug.mockReturnValue({ data: null });
    mockUseTemplates.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('渲染页面标题和搜索框', () => {
    render(<TemplateBrowsePage />);

    expect(screen.getByText('模板')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索模板...')).toBeInTheDocument();
  });

  it('渲染所有分类标签', () => {
    render(<TemplateBrowsePage />);

    expect(screen.getByText('全部')).toBeInTheDocument();
    expect(screen.getByText('分析')).toBeInTheDocument();
    expect(screen.getByText('内容')).toBeInTheDocument();
    expect(screen.getByText('开发')).toBeInTheDocument();
    expect(screen.getByText('自动化')).toBeInTheDocument();
    expect(screen.getByText('报告')).toBeInTheDocument();
  });

  it('加载中显示 spinner', () => {
    mockUseTemplates.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = render(<TemplateBrowsePage />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('无模板时显示空状态', () => {
    mockUseTemplates.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<TemplateBrowsePage />);

    expect(screen.getByText('暂无模板')).toBeInTheDocument();
  });

  it('渲染模板列表', () => {
    const templates = [
      makeTemplate({ id: '1', slug: 'a', name: '模板A' }),
      makeTemplate({ id: '2', slug: 'b', name: '模板B' }),
    ];
    mockUseTemplates.mockReturnValue({
      data: { data: templates },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<TemplateBrowsePage />);

    expect(screen.getByTestId('card-a')).toBeInTheDocument();
    expect(screen.getByTestId('card-b')).toBeInTheDocument();
  });

  it('搜索过滤模板', () => {
    const templates = [
      makeTemplate({ id: '1', slug: 'foo', name: '竞品分析' }),
      makeTemplate({ id: '2', slug: 'bar', name: '代码审查' }),
    ];
    mockUseTemplates.mockReturnValue({
      data: { data: templates },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<TemplateBrowsePage />);

    fireEvent.change(screen.getByPlaceholderText('搜索模板...'), {
      target: { value: '竞品' },
    });

    expect(screen.getByTestId('card-foo')).toBeInTheDocument();
    expect(screen.queryByTestId('card-bar')).not.toBeInTheDocument();
  });

  it('搜索无结果时显示空状态', () => {
    mockUseTemplates.mockReturnValue({
      data: { data: [makeTemplate()] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<TemplateBrowsePage />);

    fireEvent.change(screen.getByPlaceholderText('搜索模板...'), {
      target: { value: '不存在的模板' },
    });

    expect(screen.getByText('没有匹配的模板')).toBeInTheDocument();
    expect(
      screen.getByText('尝试其他搜索词或清除筛选条件。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清除筛选' })).toBeInTheDocument();
  });

  it('点击模板卡片打开向导对话框', () => {
    const template = makeTemplate({ slug: 'clicked-tpl', name: '被点击模板' });
    mockUseTemplates.mockReturnValue({
      data: { data: [template] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseTemplateBySlug.mockReturnValue({
      data: { ...template, definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } },
    });

    render(<TemplateBrowsePage />);

    fireEvent.click(screen.getByTestId('card-clicked-tpl'));

    expect(screen.getByTestId('wizard-dialog')).toBeInTheDocument();
  });

  it('请求失败时显示错误状态并支持重试', () => {
    const refetch = vi.fn();
    mockUseTemplates.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<TemplateBrowsePage />);

    expect(screen.getByText('模板加载失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
