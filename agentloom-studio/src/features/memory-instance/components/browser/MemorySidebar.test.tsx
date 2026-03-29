import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemorySidebar } from './MemorySidebar'

const mocks = vi.hoisted(() => ({
  browseMemoryNode: vi.fn(),
  onNavigate: vi.fn(),
}))

vi.mock('../../api/memoryInstanceApi', () => ({
  browseMemoryNode: mocks.browseMemoryNode,
}))

describe('MemorySidebar', () => {
  beforeEach(() => {
    mocks.browseMemoryNode.mockReset()
    mocks.onNavigate.mockReset()
    mocks.browseMemoryNode.mockResolvedValue({
      node: null,
      breadcrumbs: [],
      children: [
        {
          id: 'child-1',
          nodeUuid: 'uuid-child-1',
          name: 'Project Alpha',
          path: 'projects/alpha',
          domain: 'core',
          content: null,
          contentType: 'text/plain',
          priority: 1,
          disclosure: null,
          isVirtual: false,
          aliases: [],
          glossaryKeywords: [],
          glossaryMatches: [],
          approxChildrenCount: 0,
          versionCount: 1,
          latestVersion: 1,
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:00.000Z',
        },
      ],
    })
  })

  it('展开域树并在点击子节点时触发导航', async () => {
    render(
      <MemorySidebar
        instanceId="memory-1"
        domains={[{ domain: 'core', rootCount: 1 }]}
        activeDomain="core"
        activePath=""
        onNavigate={mocks.onNavigate}
      />,
    )

    await waitFor(() => {
      expect(mocks.browseMemoryNode).toHaveBeenCalledWith('memory-1', {
        domain: 'core',
        path: '',
        navOnly: true,
      })
    })

    fireEvent.click(await screen.findByText('Project Alpha'))

    expect(mocks.onNavigate).toHaveBeenCalledWith('projects/alpha', 'core')
  })

  it('当实例没有返回 domains 时仍回退到 core 域', async () => {
    render(
      <MemorySidebar
        instanceId="memory-1"
        domains={[]}
        activeDomain="core"
        activePath=""
        onNavigate={mocks.onNavigate}
      />,
    )

    await waitFor(() => {
      expect(mocks.browseMemoryNode).toHaveBeenCalledWith('memory-1', {
        domain: 'core',
        path: '',
        navOnly: true,
      })
    })

    expect(screen.getByText('Core Memory')).toBeInTheDocument()
  })
})
