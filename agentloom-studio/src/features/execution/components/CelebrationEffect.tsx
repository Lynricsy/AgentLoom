import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ExecutionStatus } from '../types'

export function getCelebrationStorageKey(workflowId: string) {
  return `agentloom:workflow:${workflowId}:first-success-celebrated`
}

function triggerCelebration() {
  void confetti({
    particleCount: 160,
    spread: 90,
    startVelocity: 32,
    origin: { y: 0.62 },
  })

  window.setTimeout(() => {
    void confetti({
      particleCount: 80,
      spread: 120,
      startVelocity: 24,
      origin: { x: 0.2, y: 0.68 },
    })
    void confetti({
      particleCount: 80,
      spread: 120,
      startVelocity: 24,
      origin: { x: 0.8, y: 0.68 },
    })
  }, 220)
}

export function useCelebrationEffect(
  workflowId: string | null | undefined,
  executionId: string | null | undefined,
  executionStatus: ExecutionStatus | null | undefined,
) {
  const hasMountedRef = useRef(false)
  const previousExecutionIdRef = useRef<string | null | undefined>(undefined)
  const previousStatusRef = useRef<ExecutionStatus | null | undefined>(undefined)

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      previousExecutionIdRef.current = executionId
      previousStatusRef.current = executionStatus
      return
    }

    const shouldCelebrate =
      typeof window !== 'undefined' &&
      workflowId &&
      executionStatus === 'completed' &&
      previousExecutionIdRef.current === executionId &&
      previousStatusRef.current != null &&
      previousStatusRef.current !== 'completed'

    if (shouldCelebrate) {
      try {
        const storageKey = getCelebrationStorageKey(workflowId)
        const isCelebrated = window.localStorage.getItem(storageKey) === 'true'

        if (!isCelebrated) {
          window.localStorage.setItem(storageKey, 'true')
          triggerCelebration()
        }
      } catch {
        triggerCelebration()
      }
    }

    previousExecutionIdRef.current = executionId
    previousStatusRef.current = executionStatus
  }, [executionId, executionStatus, workflowId])
}

interface CelebrationEffectProps {
  workflowId: string | null | undefined
  executionId: string | null | undefined
  executionStatus: ExecutionStatus | null | undefined
}

export function CelebrationEffect({
  workflowId,
  executionId,
  executionStatus,
}: CelebrationEffectProps) {
  useCelebrationEffect(workflowId, executionId, executionStatus)
  return null
}
