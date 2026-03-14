import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { GraphTimelineEntry } from '../types'

interface GraphTimelinePlayerProps {
  timeline: GraphTimelineEntry[]
  onStepChange: (stepIndex: number) => void
  className?: string
}

const INTERVAL_MS = 800

export const GraphTimelinePlayer = memo(function GraphTimelinePlayer({
  timeline,
  onStepChange,
  className,
}: GraphTimelinePlayerProps) {
  const [currentStep, setCurrentStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const totalSteps = timeline.length

  useEffect(() => {
    if (!isPlaying || totalSteps === 0) {
      clearTimer()
      return
    }

    intervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1

        if (next >= totalSteps) {
          setIsPlaying(false)
          return prev
        }

        onStepChange(next)
        return next
      })
    }, INTERVAL_MS)

    return clearTimer
  }, [isPlaying, totalSteps, onStepChange, clearTimer])

  const handlePlay = useCallback(() => {
    if (currentStep >= totalSteps - 1) {
      setCurrentStep(-1)
      onStepChange(-1)
    }

    setIsPlaying(true)
  }, [currentStep, totalSteps, onStepChange])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const handleReset = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(-1)
    onStepChange(-1)
  }, [onStepChange])

  const currentEntry = currentStep >= 0 && currentStep < totalSteps
    ? timeline[currentStep]
    : null

  if (totalSteps === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1.5',
        className,
      )}
      data-testid="graph-timeline-player"
    >
      {isPlaying ? (
        <button
          type="button"
          onClick={handlePause}
          className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="暂停"
          data-testid="timeline-pause"
        >
          <Pause className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="播放"
          data-testid="timeline-play"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={handleReset}
        className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="重置"
        data-testid="timeline-reset"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-border/60" />

      <span className="text-[10px] text-muted-foreground tabular-nums" data-testid="timeline-step-info">
        {currentStep >= 0 ? currentStep + 1 : 0}/{totalSteps}
      </span>

      {currentEntry && (
        <span className="truncate text-[10px] text-foreground/80" data-testid="timeline-step-label">
          {currentEntry.label}
        </span>
      )}
    </div>
  )
})
