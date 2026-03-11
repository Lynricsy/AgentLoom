import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VersionListResponse, WorkflowVersion } from '@/features/workflow/types';

import { PublishSheet } from './PublishSheet';

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

let versionsData: VersionListResponse | undefined;

vi.mock('../api/versionMutations', () => ({
  usePublishWorkflow: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('../api/versionQueries', () => ({
  useWorkflowVersions: () => ({
    data: versionsData,
    isLoading: false,
  }),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}));

function makeVersion(overrides: Partial<WorkflowVersion> = {}): WorkflowVersion {
  return {
    id: 'ver-001',
    workflowDefinitionId: 'wf-001',
    versionNumber: 1,
    label: '初始版本',
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
    },
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
  onOpenChange: vi.fn(),
};

describe('PublishSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionsData = {
      data: [
        makeVersion({ id: 'ver-001', versionNumber: 2, label: '稳定版' }),
        makeVersion({ id: 'ver-002', versionNumber: 1, label: '初始版' }),
      ],
      meta: {
        total: 2,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      },
    };
  });

  it('打开时渲染发布表单', () => {
    render(<PublishSheet {...defaultProps} />);

    expect(screen.getByTestId('publish-label-input')).toBeInTheDocument();
    expect(screen.getByTestId('publish-release-notes-input')).toBeInTheDocument();
    expect(screen.getByTestId('source-current')).toBeInTheDocument();
    expect(screen.getByTestId('source-existing')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-publish')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-publish')).toBeInTheDocument();
  });

  it('关闭时不渲染内容', () => {
    render(<PublishSheet {...defaultProps} open={false} />);

    expect(screen.queryByTestId('publish-label-input')).not.toBeInTheDocument();
  });

  it('默认选择当前版本', () => {
    render(<PublishSheet {...defaultProps} />);

    const currentRadio = screen.getByRole('radio', { name: /当前画布快照/ });
    expect(currentRadio).toBeChecked();
    expect(screen.queryByTestId('version-select')).not.toBeInTheDocument();
  });

  it('带 initialVersionId 打开时预选已有版本', () => {
    render(<PublishSheet {...defaultProps} initialVersionId="ver-001" />);

    expect(screen.getByRole('radio', { name: /选择已有版本/ })).toBeChecked();
    expect(screen.getByTestId('version-select')).toHaveValue('ver-001');
  });

  it('切换到已有版本显示版本选择器', () => {
    render(<PublishSheet {...defaultProps} />);

    const existingRadio = screen.getByRole('radio', { name: /选择已有版本/ });
    fireEvent.click(existingRadio);
    expect(screen.getByTestId('version-select')).toBeInTheDocument();
  });

  it('当前版本提交发布时带上发布说明', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<PublishSheet {...defaultProps} />);

    fireEvent.change(screen.getByTestId('publish-label-input'), {
      target: { value: '正式发布' },
    });
    fireEvent.change(screen.getByTestId('publish-release-notes-input'), {
      target: { value: '修复节点编排与发布链路' },
    });
    fireEvent.click(screen.getByTestId('confirm-publish'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          label: '正式发布',
          releaseNotes: '修复节点编排与发布链路',
        }),
      );
    });

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '发布成功' }),
      );
    });
  });

  it('发布返回 warnings 时追加 warning toast', async () => {
    mutateAsyncMock.mockResolvedValueOnce({
      warnings: [
        {
          code: 'TYPE_MISMATCH_WARNING',
          sourceNodeId: 'node-source',
          targetNodeId: 'node-target',
          sourcePort: { name: 'output', dataType: 'text' },
          targetPort: { name: 'input', dataType: 'json' },
          message: '检测到潜在类型不兼容',
        },
      ],
    });

    render(<PublishSheet {...defaultProps} />);
    fireEvent.click(screen.getByTestId('confirm-publish'));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '发布成功',
          description: '工作流已发布，并返回 1 条兼容性警告',
          variant: 'success',
        }),
      );
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '发布兼容性警告',
          variant: 'warning',
        }),
      );
    });
  });

  it('选择已有版本提交发布', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<PublishSheet {...defaultProps} />);

    fireEvent.click(screen.getByRole('radio', { name: /选择已有版本/ }));
    fireEvent.change(screen.getByTestId('version-select'), {
      target: { value: 'ver-001' },
    });
    fireEvent.click(screen.getByTestId('confirm-publish'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: 'ver-001' }),
      );
    });
  });

  it('未选择版本时显示验证错误', () => {
    render(<PublishSheet {...defaultProps} />);

    fireEvent.click(screen.getByRole('radio', { name: /选择已有版本/ }));
    fireEvent.change(screen.getByTestId('version-select'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('confirm-publish'));

    expect(screen.getByTestId('publish-validation-error')).toBeInTheDocument();
    expect(screen.getByText('请选择一个已有版本')).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('服务端返回多条校验错误时逐条展示', async () => {
    mutateAsyncMock.mockRejectedValueOnce({
      response: new Response(
        JSON.stringify({
          detail: '发布校验失败',
          errors: [
            { message: '工作流必须至少包含一个节点' },
            { message: '仅草稿工作流允许发布' },
          ],
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    });

    render(<PublishSheet {...defaultProps} />);
    fireEvent.click(screen.getByTestId('confirm-publish'));

    await waitFor(() => {
      expect(screen.getAllByTestId('publish-validation-error-item')).toHaveLength(2);
    });

    expect(screen.getByText('工作流必须至少包含一个节点')).toBeInTheDocument();
    expect(screen.getByText('仅草稿工作流允许发布')).toBeInTheDocument();
  });

  it('点击取消关闭面板', () => {
    render(<PublishSheet {...defaultProps} />);

    fireEvent.click(screen.getByTestId('cancel-publish'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });
});
