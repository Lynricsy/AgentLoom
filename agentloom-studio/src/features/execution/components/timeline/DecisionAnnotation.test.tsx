import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  AutonomyBadge,
  ReasoningBlock,
  AlternativesList,
  InterventionTag,
  DecisionAnnotation,
} from './DecisionAnnotation'
import type { EvidenceRecord } from '@/features/evidence'

function createAgentDecisionEvidence(
  overrides: Record<string, unknown> = {},
): EvidenceRecord {
  return {
    id: 'ev-agent',
    executionId: 'exec-1',
    stepId: 'step-1',
    tenantId: 'tenant-1',
    sourceType: 'agent_decision',
    packet: {
      evidenceId: 'ev-agent',
      sourceType: 'agent_decision',
      contentHash: 'hash-1',
      timestamp: '2026-01-01T00:00:00Z',
      agentDecision: {
        nodeId: 'node-1',
        agentName: 'Agent',
        autonomyMode: 'LLM_DECIDE',
        reasoning: 'The model chose action A because of X',
        selectedAction: 'action-a',
        alternatives: ['action-b', 'action-c'],
        confidence: 0.92,
      },
    },
    contentHash: 'hash-1',
    isEncrypted: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function createInterventionEvidence(
  action: 'approve' | 'modify' | 'reject' = 'approve',
): EvidenceRecord {
  return {
    id: 'ev-intervention',
    executionId: 'exec-1',
    stepId: 'step-1',
    tenantId: 'tenant-1',
    sourceType: 'intervention',
    packet: {
      evidenceId: 'ev-intervention',
      sourceType: 'intervention',
      contentHash: 'hash-2',
      timestamp: '2026-01-01T00:01:00Z',
      intervention: {
        action,
        resolvedAt: '2026-01-01T00:01:00Z',
        resolvedBy: 'user-admin',
        feedback: action === 'reject' ? 'Not appropriate' : undefined,
        modifiedContent:
          action === 'modify'
            ? '将答案改为更保守的表述，并补充风险提示。'
            : undefined,
      },
    },
    contentHash: 'hash-2',
    isEncrypted: false,
    createdAt: '2026-01-01T00:01:00Z',
  }
}

describe('AutonomyBadge', () => {
  it('渲染 FIXED 模式灰色徽章', () => {
    render(<AutonomyBadge mode="FIXED" />)
    const badge = screen.getByTestId('autonomy-badge-FIXED')
    expect(badge).toHaveTextContent('固定决策')
  })

  it('渲染 LLM_SUGGEST 模式琥珀色徽章', () => {
    render(<AutonomyBadge mode="LLM_SUGGEST" />)
    const badge = screen.getByTestId('autonomy-badge-LLM_SUGGEST')
    expect(badge).toHaveTextContent('LLM 建议')
  })

  it('渲染 LLM_DECIDE 模式蓝色徽章', () => {
    render(<AutonomyBadge mode="LLM_DECIDE" />)
    const badge = screen.getByTestId('autonomy-badge-LLM_DECIDE')
    expect(badge).toHaveTextContent('LLM 决策')
  })

  it('无效模式不渲染', () => {
    const { container } = render(<AutonomyBadge mode={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('ReasoningBlock', () => {
  it('渲染推理文本', () => {
    render(<ReasoningBlock reasoning="Because X leads to Y" />)
    expect(screen.getByTestId('reasoning-block')).toHaveTextContent(
      'Because X leads to Y',
    )
  })

  it('无推理内容不渲染', () => {
    const { container } = render(<ReasoningBlock reasoning={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('按 markdown 渲染标题、列表与代码', () => {
    render(
      <ReasoningBlock
        reasoning={['## 结论', '', '- 选择方案 A', '', '`tool.run()`'].join('\n')}
      />,
    )

    expect(screen.getByRole('heading', { name: '结论' })).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveTextContent('选择方案 A')
    expect(screen.getByText('tool.run()')).toBeInTheDocument()
  })
})

describe('AlternativesList', () => {
  it('渲染备选方案列表及置信度', () => {
    render(
      <AlternativesList
        alternatives={['option-a', 'option-b']}
        confidence={0.85}
      />,
    )
    const list = screen.getByTestId('alternatives-list')
    expect(list).toHaveTextContent('option-a')
    expect(list).toHaveTextContent('option-b')
    expect(list).toHaveTextContent('85%')
  })

  it('空列表不渲染', () => {
    const { container } = render(
      <AlternativesList alternatives={[]} confidence={50} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('undefined alternatives 不渲染', () => {
    const { container } = render(
      <AlternativesList alternatives={undefined} confidence={50} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('InterventionTag', () => {
  it('渲染 approve 干预标签', () => {
    const evidence = createInterventionEvidence('approve')
    render(<InterventionTag evidence={evidence} />)
    const tag = screen.getByTestId('intervention-tag')
    expect(tag).toHaveTextContent('已批准')
    expect(tag).toHaveTextContent('user-admin')
  })

  it('渲染 modify 干预标签', () => {
    const evidence = createInterventionEvidence('modify')
    render(<InterventionTag evidence={evidence} />)
    expect(screen.getByTestId('intervention-tag')).toHaveTextContent('已修改')
    expect(screen.getByTestId('intervention-modified-content')).toHaveTextContent(
      '将答案改为更保守的表述，并补充风险提示。',
    )
  })

  it('渲染 reject 干预标签及反馈', () => {
    const evidence = createInterventionEvidence('reject')
    render(<InterventionTag evidence={evidence} />)
    const tag = screen.getByTestId('intervention-tag')
    expect(tag).toHaveTextContent('已拒绝')
    expect(tag).toHaveTextContent('Not appropriate')
  })

  it('非干预类型 evidence 不渲染', () => {
    const evidence = createAgentDecisionEvidence()
    const { container } = render(<InterventionTag evidence={evidence as EvidenceRecord} />)
    expect(container.firstChild).toBeNull()
  })

  it('undefined evidence 不渲染', () => {
    const { container } = render(<InterventionTag evidence={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('DecisionAnnotation', () => {
  it('渲染 LLM_DECIDE 模式的完整注解', () => {
    const agentEvidence = createAgentDecisionEvidence()
    render(
      <DecisionAnnotation
        autonomyMode="LLM_DECIDE"
        agentDecisionEvidence={agentEvidence}
        interventionEvidence={undefined}
      />,
    )
    expect(screen.getByTestId('decision-annotation')).toBeInTheDocument()
    expect(screen.getByTestId('autonomy-badge-LLM_DECIDE')).toBeInTheDocument()
    expect(screen.getByTestId('reasoning-block')).toBeInTheDocument()
    expect(screen.getByTestId('alternatives-list')).toBeInTheDocument()
  })

  it('FIXED 模式不渲染推理和备选', () => {
    render(
      <DecisionAnnotation
        autonomyMode="FIXED"
        agentDecisionEvidence={undefined}
        interventionEvidence={undefined}
      />,
    )
    expect(screen.getByTestId('autonomy-badge-FIXED')).toBeInTheDocument()
    expect(screen.queryByTestId('reasoning-block')).not.toBeInTheDocument()
    expect(screen.queryByTestId('alternatives-list')).not.toBeInTheDocument()
  })

  it('包含干预标签', () => {
    const interventionEvidence = createInterventionEvidence('modify')
    render(
      <DecisionAnnotation
        autonomyMode="LLM_SUGGEST"
        agentDecisionEvidence={undefined}
        interventionEvidence={interventionEvidence}
      />,
    )
    expect(screen.getByTestId('intervention-tag')).toBeInTheDocument()
  })

  it('折叠状态仅渲染 badge 与干预标签', () => {
    const agentEvidence = createAgentDecisionEvidence()
    render(
      <DecisionAnnotation
        autonomyMode="LLM_DECIDE"
        agentDecisionEvidence={agentEvidence}
        interventionEvidence={undefined}
        showDetails={false}
      />,
    )

    expect(screen.getByTestId('autonomy-badge-LLM_DECIDE')).toBeInTheDocument()
    expect(screen.queryByTestId('reasoning-block')).not.toBeInTheDocument()
    expect(screen.queryByTestId('alternatives-list')).not.toBeInTheDocument()
  })

  it('无 autonomyMode 和无干预 evidence 时不渲染', () => {
    const { container } = render(
      <DecisionAnnotation
        autonomyMode={undefined}
        agentDecisionEvidence={undefined}
        interventionEvidence={undefined}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
