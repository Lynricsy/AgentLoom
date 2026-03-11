import { useMemo } from 'react'

import type { EvidenceRecord } from '@/features/evidence'
import { useAllEvidenceRecords } from '@/features/evidence'

import type { ExecutionStep } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNodeDataAutonomy(nodeData: Record<string, unknown> | null | undefined) {
  if (!nodeData) {
    return undefined
  }

  const directAutonomy = nodeData.autonomyMode

  if (typeof directAutonomy === 'string') {
    return directAutonomy
  }

  const nestedConfig = isRecord(nodeData.config) ? nodeData.config.autonomyMode : undefined

  if (typeof nestedConfig === 'string') {
    return nestedConfig
  }

  const nestedSettings = isRecord(nodeData.settings)
    ? nodeData.settings.autonomyMode
    : undefined

  return typeof nestedSettings === 'string' ? nestedSettings : undefined
}

function isAgentNode(nodeType: string) {
  return nodeType.includes('agent')
}

export interface TimelineData {
  step: ExecutionStep
  agentDecisionEvidence?: EvidenceRecord
  interventionEvidence?: EvidenceRecord
  nodeErrorEvidenceRecords?: EvidenceRecord[]
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
  const { data: evidenceRecords, isLoading } = useAllEvidenceRecords(executionId)

  const timelineData = useMemo(() => {
    const evidenceByStep = new Map<string, EvidenceRecord[]>()

    if (evidenceRecords) {
      for (const record of evidenceRecords) {
        const existing = evidenceByStep.get(record.stepId) ?? []
        existing.push(record)
        evidenceByStep.set(record.stepId, existing)
      }
    }

    return steps.map((step): TimelineData => {
      const stepEvidence = [...(evidenceByStep.get(step.id) ?? [])].sort(
        (left: EvidenceRecord, right: EvidenceRecord) => {
          const timeDiff =
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()

          if (timeDiff !== 0) {
            return timeDiff
          }

          return right.id.localeCompare(left.id)
        },
      )

      const agentDecisionEvidence = stepEvidence.find(
        (e: EvidenceRecord) => e.sourceType === 'agent_decision',
      )
      const interventionEvidence = stepEvidence.find(
        (e: EvidenceRecord) => e.sourceType === 'intervention',
      )
      const nodeErrorEvidenceRecords = stepEvidence.filter(
        (e: EvidenceRecord) => e.sourceType === 'node_error',
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

      const nodeDataAutonomy = readNodeDataAutonomy(step.nodeData)

      const autonomyMode =
        checkpointAutonomy ??
        evidenceAutonomy ??
        nodeDataAutonomy ??
        (isAgentNode(step.nodeType) ? 'FIXED' : undefined)

      const outputMeta = (step.output as Record<string, unknown> | null)
        ?.meta as Record<string, unknown> | undefined
      const outputFormatLevel = outputMeta?.outputFormatLevel as
        | number
        | undefined

      return {
        step,
        agentDecisionEvidence,
        interventionEvidence,
        nodeErrorEvidenceRecords,
        outputFormatLevel,
        autonomyMode,
        evidenceCount: stepEvidence.length,
      }
    })
  }, [steps, evidenceRecords])

  return { timelineData, isLoading }
}
