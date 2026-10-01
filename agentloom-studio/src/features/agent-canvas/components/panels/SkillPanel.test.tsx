import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Skill } from '@/features/skill'
import { SkillPanel } from './SkillPanel'

const mocks = vi.hoisted(() => ({
  useSkills: vi.fn(),
  useSkill: vi.fn(),
}))

vi.mock('@/features/skill', () => ({
  useSkills: mocks.useSkills,
  useSkill: mocks.useSkill,
}))

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    tenantId: 'tenant-1',
    name: '代码审查助手',
    slug: 'code-review',
    description: '帮助审查代码与定位问题',
    content: '# Skill',
    frontmatter: null,
    isBuiltin: false,
    status: 'active',
    fileCount: 1,
    totalSizeBytes: 128,
    version: 1,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('SkillPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSkill.mockReturnValue({ data: undefined, isError: false })
  })

  it('在加载中时显示占位状态', () => {
    mocks.useSkills.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<SkillPanel config={{}} onApply={vi.fn()} />)

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('选择 skill 时回填 skill 元数据', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const selectedSkill = createSkill({
      id: 'skill-2',
      name: '调试专家',
      description: '帮助定位运行时异常',
    })

    mocks.useSkills.mockReturnValue({
      data: {
        data: [createSkill(), selectedSkill],
      },
      isLoading: false,
    })

    render(<SkillPanel config={{}} onApply={onApply} />)

    await user.click(screen.getByRole('button', { name: /调试专家/ }))

    expect(onApply).toHaveBeenCalledWith({
      skillId: 'skill-2',
      skillName: '调试专家',
      skillDescription: '帮助定位运行时异常',
    })
  })

  it('清除当前已选 skill', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    mocks.useSkills.mockReturnValue({
      data: {
        data: [createSkill()],
      },
      isLoading: false,
    })

    render(
      <SkillPanel
        config={{
          skillId: 'skill-1',
          skillName: '代码审查助手',
          skillDescription: '帮助审查代码与定位问题',
        }}
        onApply={onApply}
      />,
    )

    await user.click(screen.getByRole('button', { name: '清除' }))

    expect(onApply).toHaveBeenCalledWith({
      skillId: '',
      skillName: '',
      skillDescription: '',
    })
  })

  it.each([
    ['已停用', { data: createSkill({ id: 'skill-9', status: 'archived' }), isError: false }],
    ['已删除（404）', { data: undefined, isError: true }],
  ])('已选 skill %s 时提示重新选择并上报校验错误', (_label, query) => {
    mocks.useSkills.mockReturnValue({ data: { data: [createSkill()] }, isLoading: false })
    mocks.useSkill.mockReturnValue(query)
    const onValidationChange = vi.fn()

    render(
      <SkillPanel
        config={{ skillId: 'skill-9', skillName: '旧技能' }}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('已删除或停用')
    expect(onValidationChange).toHaveBeenLastCalledWith(true)
  })

  it('未选择 skill 时上报校验错误，选中可用 skill 后清除', () => {
    mocks.useSkills.mockReturnValue({ data: { data: [createSkill()] }, isLoading: false })
    const onValidationChange = vi.fn()

    const { rerender } = render(
      <SkillPanel config={{}} onApply={vi.fn()} onValidationChange={onValidationChange} />,
    )
    expect(onValidationChange).toHaveBeenLastCalledWith(true)

    mocks.useSkill.mockReturnValue({ data: createSkill(), isError: false })
    rerender(
      <SkillPanel
        config={{ skillId: 'skill-1', skillName: '代码审查助手' }}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )
    expect(onValidationChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
