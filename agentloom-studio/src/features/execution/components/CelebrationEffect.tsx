import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ExecutionStatus } from '../types'

export const FIRST_SUCCESS_CELEBRATION_KEY = 'agentloom:first-success-celebrated'

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

export function useCelebrationEffect(executionStatus: ExecutionStatus | null | undefined) {
  const hasCheckedRef = useRef(false)

  useEffect(() => {
    if (executionStatus !== 'completed' || hasCheckedRef.current || typeof window === 'undefined') {
      return
    }

    hasCheckedRef.current = true

    try {
      const isCelebrated = window.localStorage.getItem(FIRST_SUCCESS_CELEBRATION_KEY) === 'true'
      if (isCelebrated) {
        return
      }

      window.localStorage.setItem(FIRST_SUCCESS_CELEBRATION_KEY, 'true')
      triggerCelebration()
    } catch {
      triggerCelebration()
    }
  }, [executionStatus])
}

interface CelebrationEffectProps {
  executionStatus: ExecutionStatus | null | undefined
}

export function CelebrationEffect({ executionStatus }: CelebrationEffectProps) {
  useCelebrationEffect(executionStatus)
  return null
}
