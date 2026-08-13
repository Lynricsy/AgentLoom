import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '@/features/canvas/types'
import { SkillBody } from './SkillBody'

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
  it('未配置时显示占位文案', () => {
    render(<SkillBody data={createSkillNodeData({ config: {} })} />)

    expect(screen.getByText('选择 Skill')).toBeInTheDocument()
  })

  it('无描述时只显示名称', () => {
    render(
      <SkillBody
        data={createSkillNodeData({
          config: { skillId: 'skill-1', skillName: '代码审查助手' },
        })}
      />,
    )

    expect(screen.getByText('代码审查助手')).toBeInTheDocument()
    expect(screen.queryByText('帮助审查代码与定位问题')).not.toBeInTheDocument()
  })

  it('有描述时同时显示名称与描述', () => {
    render(<SkillBody data={createSkillNodeData()} />)

    expect(screen.getByText('代码审查助手')).toBeInTheDocument()
    expect(screen.getByText('帮助审查代码与定位问题')).toBeInTheDocument()
  })
})
