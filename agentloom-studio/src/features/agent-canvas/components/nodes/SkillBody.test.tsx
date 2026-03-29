import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasNodeData } from '@/features/canvas/types'
import { SkillBody } from './SkillBody'

const mockUseViewport = vi.fn()

vi.mock('@xyflow/react', () => ({
  useViewport: () => mockUseViewport(),
}))

function createSkillNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: 'Skill',
    nodeType: 'skill',
    category: 'agent',
    config: {
      skillId: 'skill-1',
      skillName: '代码审查助手',
      skillDescription: '帮助审查代码与定位问题',
    },
    inputPorts: [],
    outputPorts: [],
    ...overrides,
  }
}

describe('SkillBody', () => {
  beforeEach(() => {
    mockUseViewport.mockReturnValue({ zoom: 1 })
  })

  it('未配置时显示占位文案', () => {
    render(<SkillBody data={createSkillNodeData({ config: {} })} />)

    expect(screen.getByText('选择 Skill')).toBeInTheDocument()
  })

  it('低缩放级别只显示名称', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.3 })

    render(<SkillBody data={createSkillNodeData()} />)

    expect(screen.getByText('代码审查助手')).toBeInTheDocument()
    expect(screen.queryByText('帮助审查代码与定位问题')).not.toBeInTheDocument()
  })

  it('高缩放级别显示描述', () => {
    render(<SkillBody data={createSkillNodeData()} />)

    expect(screen.getByText('代码审查助手')).toBeInTheDocument()
    expect(screen.getByText('帮助审查代码与定位问题')).toBeInTheDocument()
  })
})
