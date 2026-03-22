import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewActions } from '../ReviewActions';
import type { AuditLogEntry } from '../types';

// Mock API hooks
const mockReview = vi.hoisted(() => vi.fn());
const mockRollback = vi.hoisted(() => vi.fn());

vi.mock('../api', () => ({
  useReview: mockReview,
  useRollback: mockRollback,
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'entry-1',
    instanceId: 'inst-1',
    nodeId: 'node-1',
    nodeName: '测试节点',
    versionId: 'v-1',
    operationType: 'update',
    actor: '测试用户',
    actorId: 'user-1',
    timestamp: '2025-06-01T10:00:00Z',
    changeSummary: '内容修改',
    previousValue: '旧值',
    currentValue: '新值',
    reviewStatus: 'pending',
    metadata: {},
    ...overrides,
  };
}

function setupMocks() {
  const mutateFn = vi.fn();
  mockReview.mockReturnValue({ mutate: mutateFn, isPending: false });
  mockRollback.mockReturnValue({ mutate: vi.fn(), isPending: false });
  return { reviewMutate: mutateFn };
}

describe('ReviewActions', () => {
  it('无选中条目时显示空态提示', () => {
    setupMocks();
    render(
      <ReviewActions instanceId="inst-1" entry={null} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByTestId('review-actions-empty')).toBeInTheDocument();
    expect(screen.getByText('选择一条记录以执行审核操作')).toBeInTheDocument();
  });

  it('pending 状态显示批准和拒绝按钮', () => {
    setupMocks();
    const entry = makeEntry({ reviewStatus: 'pending' });
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByTestId('approve-btn')).toBeInTheDocument();
    expect(screen.getByTestId('reject-btn')).toBeInTheDocument();
    expect(screen.getByText('批准')).toBeInTheDocument();
    expect(screen.getByText('拒绝')).toBeInTheDocument();
  });

  it('回滚按钮始终可见', () => {
    setupMocks();
    const entry = makeEntry({ reviewStatus: 'approved' });
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByTestId('rollback-btn')).toBeInTheDocument();
    expect(screen.getByText('回滚')).toBeInTheDocument();
  });

  it('非 pending 状态隐藏批准和拒绝按钮', () => {
    setupMocks();
    const entry = makeEntry({ reviewStatus: 'approved' });
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    expect(screen.queryByTestId('approve-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reject-btn')).not.toBeInTheDocument();
  });

  it('点击批准弹出确认对话框', () => {
    setupMocks();
    const entry = makeEntry();
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByTestId('approve-btn'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('确认批准此版本变更？')).toBeInTheDocument();
  });

  it('点击拒绝弹出确认对话框', () => {
    setupMocks();
    const entry = makeEntry();
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByTestId('reject-btn'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(
      screen.getByText('确认拒绝此版本变更？拒绝后可回滚到上一版本。'),
    ).toBeInTheDocument();
  });

  it('点击回滚弹出确认对话框', () => {
    setupMocks();
    const entry = makeEntry();
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByTestId('rollback-btn'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('确认对话框取消关闭', () => {
    setupMocks();
    const entry = makeEntry();
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByTestId('approve-btn'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('确认批准调用 review mutation', () => {
    const { reviewMutate } = setupMocks();
    const entry = makeEntry();
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByTestId('approve-btn'));
    fireEvent.click(screen.getByText('确认'));
    expect(reviewMutate).toHaveBeenCalledWith(
      { nodeId: 'node-1', versionId: 'v-1', action: 'approve' },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it('显示当前审核状态', () => {
    setupMocks();
    const entry = makeEntry({ reviewStatus: 'pending' });
    render(
      <ReviewActions instanceId="inst-1" entry={entry} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText(/待审核/)).toBeInTheDocument();
  });
});
