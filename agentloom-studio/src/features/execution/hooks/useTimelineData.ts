import { useMemo } from 'react'

import type { EvidenceRecord } from '@/features/evidence'
import { useEvidenceList } from '@/features/evidence'

import type { ExecutionStep } from '../types'

export interface TimelineData {
  step: ExecutionStep
  agentDecisionEvidence?: EvidenceRecord
  interventionEvidence?: EvidenceRecord
  outputFormatLevel?: number
  autonomyMode?: string
  evidenceCount: number
}

export function useTimelineData(
  executionId: string,
  steps: ExecutionStep[],
): {
  timelineData: TimelineData[]
  isLoading: boolean
} {
  const { data: evidenceResponse, isLoading } = useEvidenceList(executionId, {
    limit: 200,
  })

  const timelineData = useMemo(() => {
    const evidenceByStep = new Map<string, EvidenceRecord[]>()

    if (evidenceResponse?.data) {
      for (const record of evidenceResponse.data) {
        const existing = evidenceByStep.get(record.stepId) ?? []
        existing.push(record)
        evidenceByStep.set(record.stepId, existing)
      }
    }

    return steps.map((step): TimelineData => {
      const stepEvidence = evidenceByStep.get(step.id) ?? []

      const agentDecisionEvidence = stepEvidence.find(
        (e) => e.sourceType === 'agent_decision',
      )
      const interventionEvidence = stepEvidence.find(
        (e) => e.sourceType === 'intervention',
      )

      const checkpointAutonomy = (
        step.checkpointData as Record<string, unknown> | null | undefined
      )?.autonomyMode as string | undefined

      const evidenceAutonomy =
        agentDecisionEvidence?.sourceType === 'agent_decision'
          ? (
              agentDecisionEvidence.packet as {
                agentDecision?: { autonomyMode?: string }
              }
            ).agentDecision?.autonomyMode
          : undefined

      const autonomyMode = checkpointAutonomy ?? evidenceAutonomy

      const outputMeta = (step.output as Record<string, unknown> | null)
        ?.meta as Record<string, unknown> | undefined
      const outputFormatLevel = outputMeta?.outputFormatLevel as
        | number
        | undefined

      return {
        step,
        agentDecisionEvidence,
        interventionEvidence,
        outputFormatLevel,
        autonomyMode,
        evidenceCount: stepEvidence.length,
      }
    })
  }, [steps, evidenceResponse?.data])

  return { timelineData, isLoading }
}
