import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TemplateCard } from './TemplateCard';
import type { TemplateListItem } from '../types';

function makeTemplate(overrides?: Partial<TemplateListItem>): TemplateListItem {
  return {
    id: 'tpl-1',
    slug: 'test-template',
    name: '测试模板',
    description: '这是一个测试模板的描述文本',
    category: 'analysis',
    tags: ['test'],
    thumbnailUrl: null,
    metadata: {
      complexity: 'intermediate',
      nodeCount: 5,
    },
    displayOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TemplateCard', () => {
  it('渲染模板名称和类别标签', () => {
    const template = makeTemplate();
    render(<TemplateCard template={template} onClick={vi.fn()} />);

    expect(screen.getByText('测试模板')).toBeInTheDocument();
    expect(screen.getByText('分析')).toBeInTheDocument();
  });

  it('渲染描述文本', () => {
    const template = makeTemplate();
    render(<TemplateCard template={template} onClick={vi.fn()} />);

    expect(
      screen.getByText('这是一个测试模板的描述文本'),
    ).toBeInTheDocument();
  });

  it('渲染复杂度和节点数', () => {
    const template = makeTemplate();
    render(<TemplateCard template={template} onClick={vi.fn()} />);

    expect(screen.getByText('中级')).toBeInTheDocument();
    expect(screen.getByText('5 节点')).toBeInTheDocument();
  });

  it('无描述时不渲染描述段落', () => {
    const template = makeTemplate({ description: null });
    render(<TemplateCard template={template} onClick={vi.fn()} />);

    expect(
      screen.queryByText('这是一个测试模板的描述文本'),
    ).not.toBeInTheDocument();
  });

  it('点击时调用 onClick 并传入模板', () => {
    const onClick = vi.fn();
    const template = makeTemplate();
    render(<TemplateCard template={template} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(template);
  });

  it('无 nodeCount 时不显示节点数', () => {
    const template = makeTemplate({ metadata: { complexity: 'beginner' } });
    render(<TemplateCard template={template} onClick={vi.fn()} />);

    expect(screen.queryByText(/节点/)).not.toBeInTheDocument();
  });

  it('各类别的中文标签正确渲染', () => {
    const categories = [
      { value: 'content', label: '内容' },
      { value: 'development', label: '开发' },
      { value: 'automation', label: '自动化' },
      { value: 'reporting', label: '报告' },
    ] as const;

    for (const { value, label } of categories) {
      const { unmount } = render(
        <TemplateCard
          template={makeTemplate({ category: value })}
          onClick={vi.fn()}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('各复杂度等级的中文标签正确渲染', () => {
    const levels = [
      { value: 'beginner', label: '入门' },
      { value: 'intermediate', label: '中级' },
      { value: 'advanced', label: '高级' },
    ] as const;

    for (const { value, label } of levels) {
      const { unmount } = render(
        <TemplateCard
          template={makeTemplate({
            metadata: { complexity: value, nodeCount: 1 },
          })}
          onClick={vi.fn()}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});
