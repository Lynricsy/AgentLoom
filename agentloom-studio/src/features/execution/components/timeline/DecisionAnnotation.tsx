import { memo } from 'react'
import { cva } from 'class-variance-authority'
import { Bot, ShieldCheck, Sparkles, UserCheck } from 'lucide-react'

import type { EvidenceRecord } from '@/features/evidence'
import { cn } from '@/shared/lib/utils'

const autonomyVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      mode: {
        FIXED: 'border-border bg-muted/40 text-muted-foreground',
        LLM_SUGGEST: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        LLM_DECIDE: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
      },
    },
    defaultVariants: {
      mode: 'FIXED',
    },
  },
)

const autonomyLabels: Record<string, { label: string; Icon: typeof Bot }> = {
  FIXED: { label: '固定决策', Icon: ShieldCheck },
  LLM_SUGGEST: { label: 'LLM 建议', Icon: Sparkles },
  LLM_DECIDE: { label: 'LLM 决策', Icon: Bot },
}

interface AutonomyBadgeProps {
  mode: string | undefined
  className?: string
}

export const AutonomyBadge = memo(function AutonomyBadge({
  mode,
  className,
}: AutonomyBadgeProps) {
  if (!mode || !(mode in autonomyLabels)) {
    return null
  }

  const meta = autonomyLabels[mode]!

  return (
    <span
      className={cn(
        autonomyVariants({
          mode: mode as 'FIXED' | 'LLM_SUGGEST' | 'LLM_DECIDE',
        }),
        className,
      )}
      data-testid={`autonomy-badge-${mode}`}
    >
      <meta.Icon className="h-3 w-3" />
      {meta.label}
    </span>
  )
})

interface ReasoningBlockProps {
  reasoning: string | undefined
  className?: string
}

export const ReasoningBlock = memo(function ReasoningBlock({
  reasoning,
  className,
}: ReasoningBlockProps) {
  if (!reasoning) {
    return null
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-muted/20 px-3 py-2',
        className,
      )}
      data-testid="reasoning-block"
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        推理过程
      </p>
      <p className="whitespace-pre-wrap text-xs text-foreground/90">
        {reasoning}
      </p>
    </div>
  )
})

interface AlternativesListProps {
  alternatives: string[] | undefined
  confidence?: number
  className?: string
}

export const AlternativesList = memo(function AlternativesList({
  alternatives,
  confidence,
  className,
}: AlternativesListProps) {
  if (!alternatives || alternatives.length === 0) {
    return null
  }

  return (
    <div
      className={cn('space-y-1', className)}
      data-testid="alternatives-list"
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        备选方案
        {confidence != null && (
          <span className="ml-2 normal-case tracking-normal text-foreground/70">
            置信度 {Math.round(confidence * 100)}%
          </span>
        )}
      </p>
      <ul className="space-y-0.5">
        {alternatives.map((alt) => (
          <li
            key={alt}
            className="flex items-start gap-1.5 text-xs text-foreground/80"
          >
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            {alt}
          </li>
        ))}
      </ul>
    </div>
  )
})

interface InterventionTagProps {
  evidence: EvidenceRecord | undefined
  className?: string
}

const actionLabels: Record<string, { label: string; className: string }> = {
  approve: { label: '已批准', className: 'text-emerald-300' },
  modify: { label: '已修改', className: 'text-amber-300' },
  reject: { label: '已拒绝', className: 'text-rose-300' },
}

export const InterventionTag = memo(function InterventionTag({
  evidence,
  className,
}: InterventionTagProps) {
  if (!evidence || evidence.sourceType !== 'intervention') {
    return null
  }

  const packet = evidence.packet as {
    intervention: {
      action: string
      resolvedBy?: string
      feedback?: string
    }
  }
  const { action, resolvedBy, feedback } = packet.intervention
  const actionMeta = actionLabels[action] ?? {
    label: action,
    className: 'text-foreground',
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2',
        className,
      )}
      data-testid="intervention-tag"
    >
      <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={cn('text-xs font-medium', actionMeta.className)}>
        {actionMeta.label}
      </span>
      {resolvedBy && (
        <span className="text-xs text-muted-foreground">by {resolvedBy}</span>
      )}
      {feedback && (
        <p className="w-full text-xs text-foreground/80">{feedback}</p>
      )}
    </div>
  )
})

interface DecisionAnnotationProps {
  autonomyMode: string | undefined
  agentDecisionEvidence: EvidenceRecord | undefined
  interventionEvidence: EvidenceRecord | undefined
  className?: string
}

export const DecisionAnnotation = memo(function DecisionAnnotation({
  autonomyMode,
  agentDecisionEvidence,
  interventionEvidence,
  className,
}: DecisionAnnotationProps) {
  if (!autonomyMode && !interventionEvidence) {
    return null
  }

  const showDetails =
    autonomyMode === 'LLM_SUGGEST' || autonomyMode === 'LLM_DECIDE'

  const decision =
    agentDecisionEvidence?.sourceType === 'agent_decision'
      ? (
          agentDecisionEvidence.packet as {
            agentDecision?: {
              reasoning?: string
              alternatives?: string[]
              confidence?: number
            }
          }
        ).agentDecision
      : undefined

  return (
    <div
      className={cn('space-y-2', className)}
      data-testid="decision-annotation"
    >
      <AutonomyBadge mode={autonomyMode} />

      {showDetails && decision && (
        <>
          <ReasoningBlock reasoning={decision.reasoning} />
          <AlternativesList
            alternatives={decision.alternatives}
            confidence={decision.confidence}
          />
        </>
      )}

      <InterventionTag evidence={interventionEvidence} />
    </div>
  )
})
