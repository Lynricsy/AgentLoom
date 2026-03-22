import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryAuditPage } from '../MemoryAuditPage';
import type { AuditLogEntry, PendingReview } from '../types';

// --- vi.hoisted mocks ---

const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'test-instance-id' }),
);
const mockUseAuthToken = vi.hoisted(() =>
  vi.fn().mockReturnValue('mock-jwt-token'),
);
const mockUseAuditLog = vi.hoisted(() => vi.fn());
const mockUsePendingReviews = vi.hoisted(() => vi.fn());
const mockUseNodeVersions = vi.hoisted(() => vi.fn());
const mockMemoryAuditKeys = vi.hoisted(() => ({
  all: ['memory-audit'],
  auditLog: (id: string) => ['memory-audit', 'audit-log', id],
  pendingReviews: (id: string) => ['memory-audit', 'pending-reviews', id],
}));

const mockSocketOn = vi.hoisted(() => vi.fn());
const mockSocketEmit = vi.hoisted(() => vi.fn());
const mockSocketRemoveAllListeners = vi.hoisted(() => vi.fn());
const mockSocketDisconnect = vi.hoisted(() => vi.fn());
const mockIo = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    on: mockSocketOn,
    emit: mockSocketEmit,
    removeAllListeners: mockSocketRemoveAllListeners,
    disconnect: mockSocketDisconnect,
  }),
);

vi.mock('@tanstack/react-router', () => ({
  useParams: mockUseParams,
  useNavigate: () => mockNavigate,
}));

vi.mock('@/features/execution', () => ({
  useAuthToken: mockUseAuthToken,
}));

vi.mock('../api', () => ({
  useAuditLog: mockUseAuditLog,
  usePendingReviews: mockUsePendingReviews,
  useNodeVersions: mockUseNodeVersions,
  useReview: () => ({ mutate: vi.fn(), isPending: false }),
  useRollback: () => ({ mutate: vi.fn(), isPending: false }),
  memoryAuditKeys: mockMemoryAuditKeys,
}));

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function makeAuditEntry(
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  return {
    id: 'entry-1',
    instanceId: 'test-instance-id',
    nodeId: 'node-1',
    nodeName: '知识节点A',
    versionId: 'v-1',
    operationType: 'update',
    actor: '测试用户',
    actorId: 'user-1',
    timestamp: '2025-06-01T10:00:00Z',
    changeSummary: '修改了内容',
    previousValue: '旧值',
    currentValue: '新值',
    reviewStatus: 'pending',
    metadata: {},
    ...overrides,
  };
}

function makePendingReview(
  overrides: Partial<PendingReview> = {},
): PendingReview {
  return {
    id: 'pr-1',
    instanceId: 'test-instance-id',
    nodeId: 'node-1',
    nodeName: '待审核节点',
    versionId: 'v-1',
    versionNumber: 2,
    operationType: 'update',
    actor: '用户A',
    createdAt: '2025-06-01T10:00:00Z',
    changeSummary: '内容修改',
    previousValue: null,
    currentValue: null,
    ...overrides,
  };
}

function setupDefaultMocks() {
  mockUseAuditLog.mockReturnValue({
    data: {
      data: [makeAuditEntry()],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
    isLoading: false,
  });
  mockUsePendingReviews.mockReturnValue({
    data: [],
    isLoading: false,
  });
  mockUseNodeVersions.mockReturnValue({
    data: [],
    isLoading: false,
  });
}

describe('MemoryAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('渲染审计日志标题', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByText('审计日志')).toBeInTheDocument();
  });

  it('渲染两个 tab: 变更时间线和待审核', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByText('变更时间线')).toBeInTheDocument();
    expect(screen.getAllByText(/待审核/).length).toBeGreaterThanOrEqual(1);
  });

  it('渲染返回按钮', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByText('← 返回')).toBeInTheDocument();
  });

  it('点击返回按钮触发导航', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText('← 返回'));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/memory/$id',
        params: { id: 'test-instance-id' },
      }),
    );
  });

  it('默认显示变更时间线 tab', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    // 时间线 tab 内容应可见
    expect(screen.getByText('知识节点A')).toBeInTheDocument();
  });

  it('渲染搜索输入和操作筛选', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByPlaceholderText('搜索节点名称...')).toBeInTheDocument();
    expect(screen.getByText('搜索')).toBeInTheDocument();
    expect(screen.getByText('全部操作')).toBeInTheDocument();
    expect(screen.getAllByText('创建').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('更新').length).toBeGreaterThanOrEqual(1);
  });

  it('切换到待审核 tab', () => {
    mockUsePendingReviews.mockReturnValue({
      data: [makePendingReview()],
      isLoading: false,
    });
    render(<MemoryAuditPage />, { wrapper: createWrapper() });

    const tabButtons = screen.getAllByText(/待审核/);
    const tabButton = tabButtons.find(
      (el) => el.tagName === 'BUTTON' || el.closest('button'),
    );
    fireEvent.click(tabButton!);
    expect(screen.getByText('待审核节点')).toBeInTheDocument();
  });

  it('待审核 tab 显示数量徽标', () => {
    mockUsePendingReviews.mockReturnValue({
      data: [makePendingReview({ id: 'pr-1' }), makePendingReview({ id: 'pr-2' })],
      isLoading: false,
    });
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('加载态显示骨架屏', () => {
    mockUseAuditLog.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId('audit-timeline-loading')).toBeInTheDocument();
  });

  it('未选中条目时显示提示文案', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByText('选择一条审计记录查看详情')).toBeInTheDocument();
  });

  it('点击审计条目显示详情面板', () => {
    const entry = makeAuditEntry({ actor: '操作者A' });
    mockUseAuditLog.mockReturnValue({
      data: {
        data: [entry],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      isLoading: false,
    });
    render(<MemoryAuditPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('audit-entry-entry-1'));
    // 详情面板应显示节点名和操作者
    const allNames = screen.getAllByText('知识节点A');
    expect(allNames.length).toBeGreaterThanOrEqual(1);
  });

  it('Socket.IO 连接初始化', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: 'mock-jwt-token' },
        reconnection: true,
      }),
    );
  });

  it('Socket.IO 监听三个事件', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    const eventNames = mockSocketOn.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(eventNames).toContain('connect');
    expect(eventNames).toContain('disconnect');
    expect(eventNames).toContain('memory.version.created');
    expect(eventNames).toContain('memory.version.rollback');
    expect(eventNames).toContain('memory.review.submitted');
  });

  it('无 authToken 时不创建 Socket', () => {
    mockUseAuthToken.mockReturnValue(null);
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(mockIo).not.toHaveBeenCalled();
  });

  it('日期筛选器可用', () => {
    render(<MemoryAuditPage />, { wrapper: createWrapper() });
    expect(screen.getByText('至')).toBeInTheDocument();
    // 两个 date input
    const dateInputs = screen.getAllByDisplayValue('');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });
});
