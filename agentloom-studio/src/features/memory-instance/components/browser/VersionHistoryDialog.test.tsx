import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionHistoryDialog } from './VersionHistoryDialog'

const mocks = vi.hoisted(() => ({
  rollbackMutate: vi.fn(),
  notify: vi.fn(),
  versions: [
    {
      id: 'version-2',
      versionNumber: 2,
      content: 'Latest content',
      priority: 1,
      disclosure: null,
      mode: 'patch',
      createdAt: '2026-03-28T10:00:00.000Z',
      createdBy: null,
    },
    {
      id: 'version-1',
      versionNumber: 1,
      content: 'Initial content',
      priority: 1,
      disclosure: null,
      mode: 'patch',
      createdAt: '2026-03-28T09:00:00.000Z',
      createdBy: null,
    },
  ],
}))

vi.mock('../../api/memoryInstanceQueries', () => ({
  useNodeVersions: () => ({
    data: mocks.versions,
    isLoading: false,
  }),
}))

vi.mock('../../api/memoryInstanceMutations', () => ({
  useRollbackNodeVersion: () => ({
    mutate: mocks.rollbackMutate,
  }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

describe('VersionHistoryDialog', () => {
  beforeEach(() => {
    mocks.rollbackMutate.mockReset()
    mocks.notify.mockReset()
  })

  it('展示版本历史并允许回滚到旧版本', () => {
    render(
      <VersionHistoryDialog
        open
        onOpenChange={vi.fn()}
        instanceId="memory-1"
        nodeId="node-1"
        nodeName="Root Node"
      />,
    )

    expect(screen.getByText('版本历史')).toBeInTheDocument()
    expect(screen.getByText('Latest content')).toBeInTheDocument()
    expect(screen.getByText('Initial content')).toBeInTheDocument()
    expect(screen.getByText('最新')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '回滚' }))

    expect(mocks.rollbackMutate).toHaveBeenCalledWith(
      { nodeId: 'node-1', versionId: 'version-1' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })
})
