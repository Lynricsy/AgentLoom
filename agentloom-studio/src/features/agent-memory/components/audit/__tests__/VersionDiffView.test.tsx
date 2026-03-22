import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionDiffView } from '../VersionDiffView';
import type { MemoryVersion } from '../types';

function makeVersion(overrides: Partial<MemoryVersion> = {}): MemoryVersion {
  return {
    id: 'v-1',
    nodeId: 'node-1',
    nodeName: '知识节点',
    versionNumber: 1,
    content: '初始内容',
    createdAt: '2025-06-01T10:00:00Z',
    createdBy: '测试用户',
    reviewStatus: 'pending',
    changeDescription: '创建节点',
    ...overrides,
  };
}

describe('VersionDiffView', () => {
  it('无版本时显示空态提示', () => {
    render(<VersionDiffView oldVersion={null} newVersion={null} />);
    expect(screen.getByTestId('version-diff-empty')).toBeInTheDocument();
    expect(screen.getByText('选择一条审计记录以查看版本对比')).toBeInTheDocument();
  });

  it('渲染差异视图容器', () => {
    const oldVer = makeVersion({ id: 'v1', versionNumber: 1, content: '旧内容' });
    const newVer = makeVersion({ id: 'v2', versionNumber: 2, content: '新内容' });
    render(<VersionDiffView oldVersion={oldVer} newVersion={newVer} />);
    expect(screen.getByTestId('version-diff-view')).toBeInTheDocument();
  });

  it('显示版本号标题', () => {
    const oldVer = makeVersion({
      id: 'v1',
      versionNumber: 1,
      nodeName: '节点X',
      content: '旧',
    });
    const newVer = makeVersion({
      id: 'v2',
      versionNumber: 2,
      nodeName: '节点X',
      content: '新',
    });
    render(<VersionDiffView oldVersion={oldVer} newVersion={newVer} />);
    expect(screen.getByText('v1 — 节点X')).toBeInTheDocument();
    expect(screen.getByText('v2 — 节点X')).toBeInTheDocument();
  });

  it('显示新增行差异标记', () => {
    const oldVer = makeVersion({ id: 'v1', versionNumber: 1, content: '' });
    const newVer = makeVersion({
      id: 'v2',
      versionNumber: 2,
      content: '新增的内容',
    });
    render(<VersionDiffView oldVersion={oldVer} newVersion={newVer} />);
    const addedLines = screen.getAllByTestId('diff-added');
    expect(addedLines.length).toBeGreaterThan(0);
  });

  it('显示删除行差异标记', () => {
    const oldVer = makeVersion({
      id: 'v1',
      versionNumber: 1,
      content: '被删除的内容',
    });
    const newVer = makeVersion({ id: 'v2', versionNumber: 2, content: '' });
    render(<VersionDiffView oldVersion={oldVer} newVersion={newVer} />);
    const removedLines = screen.getAllByTestId('diff-removed');
    expect(removedLines.length).toBeGreaterThan(0);
  });

  it('内容相同时显示未变更行', () => {
    const content = '相同的内容';
    const oldVer = makeVersion({ id: 'v1', versionNumber: 1, content });
    const newVer = makeVersion({ id: 'v2', versionNumber: 2, content });
    render(<VersionDiffView oldVersion={oldVer} newVersion={newVer} />);
    const unchangedLines = screen.getAllByTestId('diff-unchanged');
    expect(unchangedLines.length).toBeGreaterThan(0);
  });

  it('仅有新版本时也能渲染', () => {
    const newVer = makeVersion({
      id: 'v1',
      versionNumber: 1,
      content: '首次创建',
    });
    render(<VersionDiffView oldVersion={null} newVersion={newVer} />);
    expect(screen.getByTestId('version-diff-view')).toBeInTheDocument();
    expect(screen.getByText('v1 — 知识节点')).toBeInTheDocument();
  });
});
