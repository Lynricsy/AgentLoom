import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasNode } from '../../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { NodeInfoCard } from './NodeInfoCard'

const getNodeMock = vi.fn()

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ getNode: getNodeMock }),
  useViewport: () => ({ x: 10, y: 5, zoom: 2 }),
}))

function createNode(): CanvasNode {
  const config = getNodeTypeConfig('llm-agent')

  return {
    id: 'node-1',
    type: config.category,
    position: { x: 40, y: 20 },
    measured: { width: 150, height: 80 },
    data: {
      label: '分析 Agent',
      nodeType: config.type,
      category: config.category,
      description: config.description,
      config: {},
      inputPorts: clonePortDefinitions(config.inputPorts),
      outputPorts: clonePortDefinitions(config.outputPorts),
    },
  }
}

describe('NodeInfoCard', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    getNodeMock.mockReset()
  })

  it('未悬浮节点时不渲染卡片', () => {
    render(<NodeInfoCard />)

    expect(screen.queryByTestId('node-info-card')).not.toBeInTheDocument()
  })

  it('渲染图标、节点名、类型、端口摘要和定位偏移', () => {
    useCanvasStore.getState().actions.setHoveredNodeId('node-1')
    getNodeMock.mockReturnValue(createNode())

    render(<NodeInfoCard />)

    const card = screen.getByTestId('node-info-card')
    expect(card.getAttribute('style')).toContain('translate(402px, 37px)')
    expect(screen.getByTestId('node-info-card-icon')).toBeInTheDocument()
    expect(screen.getByText('分析 Agent')).toBeInTheDocument()
    expect(screen.getByText('LLM Agent')).toBeInTheDocument()
    expect(screen.getByText('9 输入, 4 输出')).toBeInTheDocument()
    expect(screen.getByText('空闲')).toBeInTheDocument()
  })
})
