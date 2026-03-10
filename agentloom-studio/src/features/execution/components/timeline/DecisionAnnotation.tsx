import { memo } from 'react'
import Markdown from 'react-markdown'
import { cva } from 'class-variance-authority'
import {
  Ban,
  Bot,
  PencilLine,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'

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
    <section
      aria-label="Agent decision reasoning"
      className={cn(
        'rounded-xl border border-border/60 bg-muted/20 px-3 py-2',
        className,
      )}
      data-testid="reasoning-block"
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        推理过程
      </p>
      <div className="space-y-2 text-xs text-foreground/90 [&_code]:rounded-md [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:leading-5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-background/60 [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-4">
        <Markdown skipHtml>{reasoning}</Markdown>
      </div>
    </section>
  )
})

function formatConfidenceLabel(confidence?: number) {
  if (confidence == null || Number.isNaN(confidence)) {
    return null
  }

  const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence

  return `${Math.round(normalizedConfidence * 100)}%`
}

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
        {formatConfidenceLabel(confidence) && (
          <span className="ml-2 normal-case tracking-normal text-foreground/70">
            置信度 {formatConfidenceLabel(confidence)}
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

const actionLabels: Record<
  string,
  { label: string; className: string; Icon: typeof UserCheck }
> = {
  approve: {
    label: '已批准',
    className: 'text-emerald-300',
    Icon: ShieldCheck,
  },
  modify: {
    label: '已修改',
    className: 'text-amber-300',
    Icon: PencilLine,
  },
  reject: { label: '已拒绝', className: 'text-rose-300', Icon: Ban },
}

function summarizeModifiedContent(modifiedContent: unknown) {
  if (modifiedContent == null) {
    return null
  }

  const rawSummary =
    typeof modifiedContent === 'string'
      ? modifiedContent.trim()
      : JSON.stringify(modifiedContent)

  if (!rawSummary) {
    return null
  }

  const collapsed = rawSummary.replace(/\s+/g, ' ')
  return collapsed.length > 160 ? `${collapsed.slice(0, 157)}…` : collapsed
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
      modifiedContent?: unknown
    }
  }
  const { action, resolvedBy, feedback, modifiedContent } = packet.intervention
  const actionMeta = actionLabels[action] ?? {
    label: action,
    className: 'text-foreground',
    Icon: UserCheck,
  }
  const modifiedSummary = summarizeModifiedContent(modifiedContent)

  return (
    <div
      className={cn(
        'space-y-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2',
        className,
      )}
      data-testid="intervention-tag"
    >
      <div className="flex flex-wrap items-center gap-2">
        <actionMeta.Icon className={cn('h-3.5 w-3.5', actionMeta.className)} />
        <span className={cn('text-xs font-medium', actionMeta.className)}>
          {actionMeta.label}
        </span>
        {resolvedBy && (
          <span className="text-xs text-muted-foreground">处理人 {resolvedBy}</span>
        )}
      </div>

      {feedback && (
        <p className="w-full text-xs text-foreground/80">{feedback}</p>
      )}

      {modifiedSummary && (
        <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            修改摘要
          </p>
          <p className="mt-1 text-xs text-foreground/80" data-testid="intervention-modified-content">
            {modifiedSummary}
          </p>
        </div>
      )}
    </div>
  )
})

interface DecisionAnnotationProps {
  autonomyMode: string | undefined
  agentDecisionEvidence: EvidenceRecord | undefined
  interventionEvidence: EvidenceRecord | undefined
  showDetails?: boolean
  className?: string
}

export const DecisionAnnotation = memo(function DecisionAnnotation({
  autonomyMode,
  agentDecisionEvidence,
  interventionEvidence,
  showDetails = true,
  className,
}: DecisionAnnotationProps) {
  if (!autonomyMode && !interventionEvidence) {
    return null
  }

  const canShowDecisionDetails =
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

      {showDetails && canShowDecisionDetails && decision && (
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
