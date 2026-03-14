import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAG_TRANSFER_TYPE } from '@/features/canvas/components/NodePalette';

import { BlockLibraryPanel } from './BlockLibraryPanel';
import type { ReusableBlockListItem } from '../types';

const blockQueryMock = vi.hoisted(() => ({
  useBlocks: vi.fn(),
}));

vi.mock('../api/blockQueries', () => ({
  useBlocks: blockQueryMock.useBlocks,
}));

vi.mock('./BlockImportDialog', () => ({
  BlockImportDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="block-import-dialog">导入对话框</div> : null,
}));

function makeBlock(
  overrides: Partial<ReusableBlockListItem> = {},
): ReusableBlockListItem {
  return {
    id: 'block-1',
    name: '客户洞察块',
    description: '用于生成客户洞察摘要',
    category: 'analysis',
    tags: ['customer'],
    metadata: { nodeCount: 3, version: 1 },
    version: 1,
    isPublished: true,
    createdAt: '2026-03-14T00:00:00.000Z',
    updatedAt: '2026-03-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('BlockLibraryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockQueryMock.useBlocks.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      },
      isLoading: false,
      error: null,
    });
  });

  it('renders blocks from the API response', () => {
    blockQueryMock.useBlocks.mockReturnValue({
      data: {
        data: [makeBlock(), makeBlock({ id: 'block-2', name: '周报块' })],
        meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<BlockLibraryPanel />);

    expect(screen.getByText('客户洞察块')).toBeInTheDocument();
    expect(screen.getByText('周报块')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    blockQueryMock.useBlocks.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<BlockLibraryPanel />);

    expect(screen.getByText('加载块库中…')).toBeInTheDocument();
  });

  it('shows empty state when there are no blocks', () => {
    render(<BlockLibraryPanel />);

    expect(screen.getByText('还没有保存任何块')).toBeInTheDocument();
  });

  it('filters blocks by search query', async () => {
    const user = userEvent.setup();

    blockQueryMock.useBlocks.mockReturnValue({
      data: {
        data: [
          makeBlock({ id: 'block-1', name: '客户洞察块' }),
          makeBlock({ id: 'block-2', name: '周报块', description: '用于生成周报' }),
        ],
        meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<BlockLibraryPanel />);

    await user.type(screen.getByPlaceholderText('搜索块...'), '周报');

    expect(screen.getByText('周报块')).toBeInTheDocument();
    expect(screen.queryByText('客户洞察块')).not.toBeInTheDocument();
  });

  it('sets the reusable block drag payload', () => {
    blockQueryMock.useBlocks.mockReturnValue({
      data: {
        data: [makeBlock()],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<BlockLibraryPanel />);

    const setData = vi.fn();
    const dragTarget = screen.getByTestId('block-item-block-1');

    fireEvent.dragStart(dragTarget, {
      dataTransfer: {
        setData,
        effectAllowed: 'none',
      } as unknown as DataTransfer,
    });

    expect(setData).toHaveBeenCalledWith(DRAG_TRANSFER_TYPE, expect.any(String));

    const [, rawPayload] = setData.mock.calls[0] ?? [];
    const payload = JSON.parse(String(rawPayload));

    expect(payload).toEqual({
      type: 'reusable-block',
      blockId: 'block-1',
      label: '客户洞察块',
      category: 'control',
    });
  });
});
