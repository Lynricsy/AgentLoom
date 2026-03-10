import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTimelineData } from './useTimelineData'
import type { ExecutionStep } from '../types'
import type { EvidenceRecord } from '@/features/evidence'

const mocks = vi.hoisted(() => ({
  useEvidenceListMock: vi.fn(),
}))

vi.mock('@/features/evidence', () => ({
  useEvidenceList: (...args: unknown[]) => mocks.useEvidenceListMock(...args),
}))

function createStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: 'step-1',
    executionId: 'exec-1',
    nodeId: 'node-1',
    nodeName: 'Test Node',
    nodeType: 'llm-agent',
    status: 'completed',
    input: null,
    output: null,
    errorMessage: null,
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:01:00Z',
    retryCount: 0,
    ...overrides,
  }
}

function createEvidenceRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'ev-1',
    executionId: 'exec-1',
    stepId: 'step-1',
    tenantId: 'tenant-1',
    sourceType: 'agent_decision',
    packet: {
      evidenceId: 'ev-1',
      sourceType: 'agent_decision',
      contentHash: 'hash-1',
      timestamp: '2026-01-01T00:00:30Z',
      agentDecision: {
        nodeId: 'node-1',
        agentName: 'Test Agent',
        autonomyMode: 'LLM_DECIDE',
        reasoning: 'Because reasons',
        selectedAction: 'action-1',
        alternatives: ['alt-1', 'alt-2'],
        confidence: 85,
      },
    },
    contentHash: 'hash-1',
    createdAt: '2026-01-01T00:00:30Z',
    ...overrides,
  }
}

describe('useTimelineData', () => {
  it('返回空数据当 evidence 仍在加载', () => {
    mocks.useEvidenceListMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const steps = [createStep()]
    const { result } = renderHook(() => useTimelineData('exec-1', steps))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.timelineData).toHaveLength(1)
    expect(result.current.timelineData[0]!.evidenceCount).toBe(0)
  })

  it('将 evidence 按 stepId 聚合到对应步骤', () => {
    const agentDecisionEvidence = createEvidenceRecord({
      id: 'ev-agent',
      sourceType: 'agent_decision',
    })
    const interventionEvidence = createEvidenceRecord({
      id: 'ev-intervention',
      stepId: 'step-1',
      sourceType: 'intervention',
      packet: {
        evidenceId: 'ev-intervention',
        sourceType: 'intervention',
        contentHash: 'hash-2',
        timestamp: '2026-01-01T00:00:45Z',
        intervention: {
          action: 'approve',
          resolvedAt: '2026-01-01T00:00:50Z',
          resolvedBy: 'user-1',
        },
      },
    })
    const toolEvidence = createEvidenceRecord({
      id: 'ev-tool',
      stepId: 'step-1',
      sourceType: 'tool_output',
      packet: {
        evidenceId: 'ev-tool',
        sourceType: 'tool_output',
        contentHash: 'hash-3',
        timestamp: '2026-01-01T00:00:40Z',
        toolOutput: {
          toolName: 'web-search',
          toolInput: {},
          toolOutput: {},
        },
      },
    })

    mocks.useEvidenceListMock.mockReturnValue({
      data: {
        data: [agentDecisionEvidence, interventionEvidence, toolEvidence],
        total: 3,
        page: 1,
        limit: 200,
      },
      isLoading: false,
    })

    const steps = [createStep()]
    const { result } = renderHook(() => useTimelineData('exec-1', steps))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.timelineData).toHaveLength(1)
    const entry = result.current.timelineData[0]!
    expect(entry.step.id).toBe('step-1')
    expect(entry.agentDecisionEvidence).toBeDefined()
    expect(entry.interventionEvidence).toBeDefined()
    expect(entry.evidenceCount).toBe(3)
  })

  it('从 checkpointData 读取 autonomyMode', () => {
    mocks.useEvidenceListMock.mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 200 },
      isLoading: false,
    })

    const steps = [
      createStep({
        checkpointData: { autonomyMode: 'FIXED' },
      }),
    ]
    const { result } = renderHook(() => useTimelineData('exec-1', steps))

    expect(result.current.timelineData[0]!.autonomyMode).toBe('FIXED')
  })

  it('从 output.meta 读取 outputFormatLevel', () => {
    mocks.useEvidenceListMock.mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 200 },
      isLoading: false,
    })

    const steps = [
      createStep({
        output: { meta: { outputFormatLevel: 2 } },
      }),
    ]
    const { result } = renderHook(() => useTimelineData('exec-1', steps))

    expect(result.current.timelineData[0]!.outputFormatLevel).toBe(2)
  })

  it('多步骤各自关联对应 evidence', () => {
    const ev1 = createEvidenceRecord({ id: 'ev-1', stepId: 'step-1' })
    const ev2 = createEvidenceRecord({
      id: 'ev-2',
      stepId: 'step-2',
      sourceType: 'tool_output',
      packet: {
        evidenceId: 'ev-2',
        sourceType: 'tool_output',
        contentHash: 'hash-2',
        timestamp: '2026-01-01T00:01:30Z',
        toolOutput: {
          toolName: 'code-exec',
          toolInput: {},
          toolOutput: {},
        },
      },
    })

    mocks.useEvidenceListMock.mockReturnValue({
      data: { data: [ev1, ev2], total: 2, page: 1, limit: 200 },
      isLoading: false,
    })

    const steps = [
      createStep({ id: 'step-1', nodeId: 'node-1' }),
      createStep({ id: 'step-2', nodeId: 'node-2', nodeName: 'Node Two' }),
    ]
    const { result } = renderHook(() => useTimelineData('exec-1', steps))

    expect(result.current.timelineData).toHaveLength(2)
    expect(result.current.timelineData[0]!.evidenceCount).toBe(1)
    expect(result.current.timelineData[1]!.evidenceCount).toBe(1)
  })

  it('从 evidence 的 agentDecision.autonomyMode 回退', () => {
    const ev = createEvidenceRecord({
      id: 'ev-agent',
      sourceType: 'agent_decision',
      packet: {
        evidenceId: 'ev-agent',
        sourceType: 'agent_decision',
        contentHash: 'hash-1',
        timestamp: '2026-01-01T00:00:30Z',
        agentDecision: {
          nodeId: 'node-1',
          agentName: 'Test Agent',
          autonomyMode: 'LLM_SUGGEST',
          reasoning: 'reasoning',
          selectedAction: 'action',
        },
      },
    })

    mocks.useEvidenceListMock.mockReturnValue({
      data: { data: [ev], total: 1, page: 1, limit: 200 },
      isLoading: false,
    })

    const steps = [createStep()]
    const { result } = renderHook(() => useTimelineData('exec-1', steps))

    expect(result.current.timelineData[0]!.autonomyMode).toBe('LLM_SUGGEST')
  })
})
