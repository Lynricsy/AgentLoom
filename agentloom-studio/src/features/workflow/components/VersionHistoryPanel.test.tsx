import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowVersion } from '@/features/workflow/types';

import { VersionHistoryPanel } from './VersionHistoryPanel';

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

let versionsData: {
  data: WorkflowVersion[];
  total: number;
  page: number;
  pageSize: number;
} | undefined;
let versionsLoading = false;

vi.mock('../api/versionQueries', () => ({
  useWorkflowVersions: () => ({
    data: versionsLoading ? undefined : versionsData,
    isLoading: versionsLoading,
  }),
}));

vi.mock('../api/versionMutations', () => ({
  useRollbackVersion: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}));

vi.mock('@/features/canvas/lib/formatRelativeTime', () => ({
  formatRelativeTime: () => '1 小时前',
}));

function makeVersion(overrides: Partial<WorkflowVersion> = {}): WorkflowVersion {
  return {
    id: 'ver-001',
    workflowDefinitionId: 'wf-001',
    versionNumber: 1,
    label: null,
    snapshot: { nodes: [], edges: [], viewport: null, metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 } },
    publishedAt: null,
    archivedAt: null,
    createdBy: 'user-001',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultProps = {
  open: true,
  workflowId: 'wf-001',
  workflowStatus: 'draft' as const,
  onClose: vi.fn(),
  onPublish: vi.fn(),
};

describe('VersionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionsData = { data: [], total: 0, page: 1, pageSize: 20 };
    versionsLoading = false;
  });

  it('关闭时面板被移出视口', () => {
    render(<VersionHistoryPanel {...defaultProps} open={false} />);

    const panel = screen.getByTestId('version-history-panel');
    expect(panel.className).toContain('translate-x-full');
  });

  it('打开时面板可见', () => {
    render(<VersionHistoryPanel {...defaultProps} open={true} />);

    const panel = screen.getByTestId('version-history-panel');
    expect(panel.className).toContain('translate-x-0');
  });

  it('加载时显示骨架屏', () => {
    versionsLoading = true;

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getAllByTestId('version-item-skeleton').length).toBeGreaterThan(0);
  });

  it('无版本时显示空状态', () => {
    versionsData = { data: [], total: 0, page: 1, pageSize: 20 };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByTestId('version-list-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无版本历史')).toBeInTheDocument();
  });

  it('渲染版本列表', () => {
    versionsData = {
      data: [
        makeVersion({ id: 'ver-001', versionNumber: 2, label: '稳定版本' }),
        makeVersion({ id: 'ver-002', versionNumber: 1, label: null }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByTestId('version-item-2')).toBeInTheDocument();
    expect(screen.getByTestId('version-item-1')).toBeInTheDocument();
    expect(screen.getByText('稳定版本')).toBeInTheDocument();
  });

  it('已发布版本显示发布标签', () => {
    versionsData = {
      data: [
        makeVersion({ id: 'ver-001', versionNumber: 1, publishedAt: '2024-01-01T00:00:00Z' }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByText('已发布')).toBeInTheDocument();
  });

  it('已归档版本显示归档标签', () => {
    versionsData = {
      data: [
        makeVersion({ id: 'ver-001', versionNumber: 1, archivedAt: '2024-01-01T00:00:00Z' }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByText('已归档')).toBeInTheDocument();
  });

  describe('回滚', () => {
    beforeEach(() => {
      versionsData = {
        data: [
          makeVersion({ id: 'ver-001', versionNumber: 2 }),
          makeVersion({ id: 'ver-002', versionNumber: 1 }),
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      };
    });

    it('点击回滚按钮显示确认提示', () => {
      render(<VersionHistoryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('rollback-version-2'));
      expect(screen.getByTestId('rollback-confirm')).toBeInTheDocument();
    });

    it('确认回滚调用 mutateAsync', async () => {
      mutateAsyncMock.mockResolvedValueOnce({});

      render(<VersionHistoryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('rollback-version-2'));
      fireEvent.click(screen.getByTestId('confirm-rollback'));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith('ver-001');
      });
    });

    it('取消回滚隐藏确认提示', () => {
      render(<VersionHistoryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('rollback-version-2'));
      expect(screen.getByTestId('rollback-confirm')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-rollback'));
      expect(screen.queryByTestId('rollback-confirm')).not.toBeInTheDocument();
    });
  });

  describe('分页', () => {
    it('多页时显示分页控件', () => {
      versionsData = {
        data: Array.from({ length: 20 }, (_, i) =>
          makeVersion({ id: `ver-${i}`, versionNumber: 20 - i }),
        ),
        total: 40,
        page: 1,
        pageSize: 20,
      };

      render(<VersionHistoryPanel {...defaultProps} />);

      expect(screen.getByTestId('version-page-next')).toBeInTheDocument();
      expect(screen.getByText(/第 1\/2 页/)).toBeInTheDocument();
    });

    it('单页时不显示分页控件', () => {
      versionsData = {
        data: [makeVersion()],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      render(<VersionHistoryPanel {...defaultProps} />);

      expect(screen.queryByTestId('version-page-next')).not.toBeInTheDocument();
    });
  });

  it('归档工作流隐藏操作按钮', () => {
    versionsData = {
      data: [makeVersion({ id: 'ver-001', versionNumber: 1 })],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    render(<VersionHistoryPanel {...defaultProps} workflowStatus="archived" />);

    expect(screen.queryByTestId('rollback-version-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('publish-version-1')).not.toBeInTheDocument();
  });

  it('点击关闭按钮调用 onClose', () => {
    render(<VersionHistoryPanel {...defaultProps} />);

    fireEvent.click(screen.getByTestId('close-version-history'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
