import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingReviewsList } from '../PendingReviewsList';
import type { PendingReview } from '../types';

function makeReview(overrides: Partial<PendingReview> = {}): PendingReview {
  return {
    id: 'pr-1',
    instanceId: 'inst-1',
    nodeId: 'node-1',
    nodeName: '核心概念',
    versionId: 'v-1',
    versionNumber: 3,
    operationType: 'update',
    actor: '测试用户',
    createdAt: '2025-06-01T10:00:00Z',
    changeSummary: '更新了节点描述',
    previousValue: '旧值',
    currentValue: '新值',
    ...overrides,
  };
}

describe('PendingReviewsList', () => {
  it('加载态显示骨架屏', () => {
    render(
      <PendingReviewsList reviews={[]} isLoading={true} />,
    );
    expect(screen.getByTestId('pending-reviews-loading')).toBeInTheDocument();
  });

  it('空数据显示空态文案', () => {
    render(
      <PendingReviewsList reviews={[]} isLoading={false} />,
    );
    expect(screen.getByTestId('pending-reviews-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无待审核项')).toBeInTheDocument();
  });

  it('渲染待审核列表', () => {
    const reviews = [
      makeReview({ id: 'pr-1', nodeName: '节点A' }),
      makeReview({ id: 'pr-2', nodeName: '节点B' }),
    ];
    render(
      <PendingReviewsList reviews={reviews} isLoading={false} />,
    );
    expect(screen.getByTestId('pending-reviews-list')).toBeInTheDocument();
    expect(screen.getByText('节点A')).toBeInTheDocument();
    expect(screen.getByText('节点B')).toBeInTheDocument();
  });

  it('显示待审核总数', () => {
    const reviews = [
      makeReview({ id: 'pr-1' }),
      makeReview({ id: 'pr-2' }),
      makeReview({ id: 'pr-3' }),
    ];
    render(
      <PendingReviewsList reviews={reviews} isLoading={false} />,
    );
    expect(screen.getByText('共 3 项待审核')).toBeInTheDocument();
  });

  it('显示操作类型标签', () => {
    const reviews = [makeReview({ operationType: 'create' })];
    render(
      <PendingReviewsList reviews={reviews} isLoading={false} />,
    );
    expect(screen.getByText('创建')).toBeInTheDocument();
  });

  it('显示版本号和操作者', () => {
    const reviews = [makeReview({ versionNumber: 5, actor: '管理员' })];
    render(
      <PendingReviewsList reviews={reviews} isLoading={false} />,
    );
    expect(screen.getByText('v5')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();
  });

  it('显示变更摘要', () => {
    const reviews = [makeReview({ changeSummary: '修改了重要字段' })];
    render(
      <PendingReviewsList reviews={reviews} isLoading={false} />,
    );
    expect(screen.getByText('修改了重要字段')).toBeInTheDocument();
  });

  it('点击审核项触发 onSelectReview', () => {
    const onSelect = vi.fn();
    const review = makeReview();
    render(
      <PendingReviewsList
        reviews={[review]}
        isLoading={false}
        onSelectReview={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('pending-review-pr-1'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(review);
  });

  it('按时间倒序排列', () => {
    const reviews = [
      makeReview({
        id: 'pr-old',
        nodeName: '旧项',
        createdAt: '2025-01-01T00:00:00Z',
      }),
      makeReview({
        id: 'pr-new',
        nodeName: '新项',
        createdAt: '2025-06-01T00:00:00Z',
      }),
    ];
    render(
      <PendingReviewsList reviews={reviews} isLoading={false} />,
    );
    const items = screen.getAllByTestId(/^pending-review-/);
    expect(items[0]).toHaveAttribute('data-testid', 'pending-review-pr-new');
    expect(items[1]).toHaveAttribute('data-testid', 'pending-review-pr-old');
  });
});
