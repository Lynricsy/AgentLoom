import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JevShadowBadge } from './JevShadowBadge'
import { formatJevShadowLabel } from '../lib/presentation'
import type { DecisionRecord } from '../types'

const mocks = vi.hoisted(() => ({
  useDecisionRecords: vi.fn(),
}))

vi.mock('../api/decision-record-queries', () => ({
  useDecisionRecords: mocks.useDecisionRecords,
}))

function createRecord(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: 'record-1',
    kind: 'team.message_relevance',
    subjectType: 'team_message',
    subjectId: 'message-1',
    provider: 'jev',
    model: 'jev-1.13.0',
    mode: 'shadow',
    definitionVersion: 1,
    outcome: { type: 'noul', value: 0.8234 },
    confidence: null,
    latencyMs: 420,
    inputTokens: 120,
    outputTokens: 3,
    error: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('formatJevShadowLabel', () => {
  it('noul 显示概率', () => {
    expect(formatJevShadowLabel(createRecord())).toBe('Jev 影子：p=0.82')
  })

  it('choice 显示映射后的选项名与置信度，未映射时显示原 id', () => {
    const record = createRecord({
      kind: 'routing.model_choice',
      outcome: {
        type: 'choice',
        choice: 'model-a',
        probabilities: { 'model-a': 0.7, 'model-b': 0.3 },
        confidence: 0.6,
      },
    })

    expect(formatJevShadowLabel(record, { 'model-a': 'GPT-4o' })).toBe(
      'Jev 影子：GPT-4o conf=0.60',
    )
    expect(formatJevShadowLabel(record)).toBe('Jev 影子：model-a conf=0.60')
  })

  it('影子调用失败显示失败', () => {
    expect(
      formatJevShadowLabel(createRecord({ outcome: null, error: 'Jev HTTP 401' })),
    ).toBe('Jev 影子：失败')
  })
})

describe('JevShadowBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按主体查询并显示影子结果', () => {
    mocks.useDecisionRecords.mockReturnValue({
      data: {
        data: [
          createRecord({ id: 'primary', mode: 'primary', provider: 'rule', outcome: { type: 'noul', value: 1 } }),
          createRecord(),
        ],
      },
    })

    render(<JevShadowBadge subjectType="team_message" subjectId="message-1" />)

    expect(mocks.useDecisionRecords).toHaveBeenCalledWith({
      subjectType: 'team_message',
      subjectId: 'message-1',
    })
    expect(screen.getByTestId('jev-shadow-badge')).toHaveTextContent('Jev 影子：p=0.82')
  })

  it('失败的影子记录以 error 作为提示', () => {
    mocks.useDecisionRecords.mockReturnValue({
      data: { data: [createRecord({ outcome: null, error: 'Jev HTTP 401: invalid key' })] },
    })

    render(<JevShadowBadge subjectType="team_message" subjectId="message-1" />)

    expect(screen.getByTestId('jev-shadow-badge')).toHaveAttribute(
      'title',
      'Jev HTTP 401: invalid key',
    )
  })

  it('只有主记录或尚未加载时不渲染', () => {
    mocks.useDecisionRecords.mockReturnValue({
      data: { data: [createRecord({ mode: 'primary', provider: 'rule' })] },
    })
    const { rerender } = render(
      <JevShadowBadge subjectType="team_message" subjectId="message-1" />,
    )
    expect(screen.queryByTestId('jev-shadow-badge')).not.toBeInTheDocument()

    mocks.useDecisionRecords.mockReturnValue({ data: undefined })
    rerender(<JevShadowBadge subjectType="team_message" subjectId="message-2" />)
    expect(screen.queryByTestId('jev-shadow-badge')).not.toBeInTheDocument()
  })
})
