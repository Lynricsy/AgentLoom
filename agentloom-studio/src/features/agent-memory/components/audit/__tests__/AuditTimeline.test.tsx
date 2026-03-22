import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTimeline } from '../AuditTimeline';
import type { AuditLogEntry } from '../types';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'entry-1',
    instanceId: 'inst-1',
    nodeId: 'node-1',
    nodeName: '知识节点A',
    versionId: 'v-1',
    operationType: 'update',
    actor: '测试用户',
    actorId: 'user-1',
    timestamp: '2025-06-01T10:00:00Z',
    changeSummary: '修改了节点内容',
    previousValue: '旧值',
    currentValue: '新值',
    reviewStatus: 'pending',
    metadata: {},
    ...overrides,
  };
}

describe('AuditTimeline', () => {
  it('加载态显示骨架屏', () => {
    render(<AuditTimeline entries={[]} isLoading={true} />);
    expect(screen.getByTestId('audit-timeline-loading')).toBeInTheDocument();
  });

  it('空数据显示空态文案', () => {
    render(<AuditTimeline entries={[]} isLoading={false} />);
    expect(screen.getByTestId('audit-timeline-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无审计记录')).toBeInTheDocument();
  });

  it('渲染审计条目列表', () => {
    const entries = [
      makeEntry({ id: 'e1', operationType: 'create', nodeName: '节点A' }),
      makeEntry({ id: 'e2', operationType: 'update', nodeName: '节点B' }),
    ];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    expect(screen.getByTestId('audit-timeline')).toBeInTheDocument();
    expect(screen.getByText('节点A')).toBeInTheDocument();
    expect(screen.getByText('节点B')).toBeInTheDocument();
  });

  it('显示操作类型标签和审核状态标签', () => {
    const entries = [
      makeEntry({ operationType: 'create', reviewStatus: 'approved' }),
    ];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    expect(screen.getByText('创建')).toBeInTheDocument();
    expect(screen.getByText('已批准')).toBeInTheDocument();
  });

  it('显示变更摘要', () => {
    const entries = [makeEntry({ changeSummary: '更新了核心记忆内容' })];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    expect(screen.getByText('更新了核心记忆内容')).toBeInTheDocument();
  });

  it('显示操作者和时间戳', () => {
    const entries = [makeEntry({ actor: '管理员' })];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    expect(screen.getByText('管理员')).toBeInTheDocument();
  });

  it('点击条目触发 onSelectEntry', () => {
    const onSelect = vi.fn();
    const entry = makeEntry();
    render(
      <AuditTimeline
        entries={[entry]}
        isLoading={false}
        onSelectEntry={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('audit-entry-entry-1'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(entry);
  });

  it('选中条目高亮显示', () => {
    const entry = makeEntry();
    render(
      <AuditTimeline
        entries={[entry]}
        isLoading={false}
        selectedEntryId="entry-1"
      />,
    );
    const el = screen.getByTestId('audit-entry-entry-1');
    expect(el.className).toContain('bg-blue-50');
  });

  it('按时间倒序排列条目', () => {
    const entries = [
      makeEntry({
        id: 'e-old',
        nodeName: '旧条目',
        timestamp: '2025-01-01T00:00:00Z',
      }),
      makeEntry({
        id: 'e-new',
        nodeName: '新条目',
        timestamp: '2025-06-01T00:00:00Z',
      }),
    ];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    const items = screen.getAllByTestId(/^audit-entry-/);
    // 第一个应该是最新的
    expect(items[0]).toHaveAttribute('data-testid', 'audit-entry-e-new');
    expect(items[1]).toHaveAttribute('data-testid', 'audit-entry-e-old');
  });

  it('四种操作类型都能正确渲染', () => {
    const entries = [
      makeEntry({ id: 'e1', operationType: 'create' }),
      makeEntry({ id: 'e2', operationType: 'update' }),
      makeEntry({ id: 'e3', operationType: 'delete' }),
      makeEntry({ id: 'e4', operationType: 'rollback' }),
    ];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    expect(screen.getByText('创建')).toBeInTheDocument();
    expect(screen.getByText('更新')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
    expect(screen.getByText('回滚')).toBeInTheDocument();
  });

  it('三种审核状态都能正确渲染', () => {
    const entries = [
      makeEntry({ id: 'e1', reviewStatus: 'pending', nodeName: '待审A' }),
      makeEntry({ id: 'e2', reviewStatus: 'approved', nodeName: '已批B' }),
      makeEntry({ id: 'e3', reviewStatus: 'rejected', nodeName: '已拒C' }),
    ];
    render(<AuditTimeline entries={entries} isLoading={false} />);
    expect(screen.getByText('待审核')).toBeInTheDocument();
    expect(screen.getByText('已批准')).toBeInTheDocument();
    expect(screen.getByText('已拒绝')).toBeInTheDocument();
  });
});
