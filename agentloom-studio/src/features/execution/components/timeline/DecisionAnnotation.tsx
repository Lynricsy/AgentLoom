import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
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
import {
  hasEvidenceRefs,
  parseEvidenceRefs,
} from '@/features/evidence'
import { InlineEvidenceRef } from '@/features/evidence'
import { cn } from '@/shared/lib/utils'

const autonomyVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      mode: {
        FIXED: 'border-border bg-surface-elevated text-muted',
        LLM_SUGGEST: 'border-warning/25 bg-warning/10 text-warning',
        LLM_DECIDE: 'border-info/25 bg-info/10 text-info',
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
  executionId?: string
  nodeId?: string
  nodeName?: string
  className?: string
}

interface EvidenceRefContext {
  executionId: string
  nodeId?: string
  nodeName?: string
}

function renderTextWithEvidenceRefs(text: string, ctx: EvidenceRefContext) {
  if (!hasEvidenceRefs(text)) {
    return text
  }

  return parseEvidenceRefs(text).map((seg) =>
    seg.type === 'text' ? (
      seg.content
    ) : (
      <InlineEvidenceRef
        key={`ref-${seg.evidenceId}-${seg.index}`}
        evidenceId={seg.evidenceId}
        index={seg.index}
        executionId={ctx.executionId}
        nodeId={ctx.nodeId}
        nodeName={ctx.nodeName}
      />
    ),
  )
}

function replaceEvidenceRefsInNode(node: ReactNode, ctx: EvidenceRefContext): ReactNode {
  if (typeof node === 'string') {
    return <>{renderTextWithEvidenceRefs(node, ctx)}</>
  }

  if (Array.isArray(node)) {
    return Children.map(node, (child) => replaceEvidenceRefsInNode(child, ctx))
  }

  if (!isValidElement<PropsWithChildren<unknown>>(node)) {
    return node
  }

  if (typeof node.type === 'string' && (node.type === 'code' || node.type === 'pre')) {
    return node
  }

  if (node.props.children == null) {
    return node
  }

  const nextChildren = Children.map(node.props.children, (child) =>
    replaceEvidenceRefsInNode(child, ctx),
  )

  return cloneElement(node, undefined, nextChildren)
}

export const ReasoningBlock = memo(function ReasoningBlock({
  reasoning,
  executionId,
  nodeId,
  nodeName,
  className,
}: ReasoningBlockProps) {
  if (!reasoning) {
    return null
  }

  const ctx: EvidenceRefContext | null = executionId
    ? {
        executionId,
        nodeId,
        nodeName,
      }
    : null

  return (
    <section
      aria-label="Agent decision reasoning"
      className={cn(
        'rounded-card border border-border bg-surface-elevated px-3 py-2',
        className,
      )}
      data-testid="reasoning-block"
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        推理过程
      </p>
      <div className="space-y-2 break-words text-xs text-foreground [&_code]:rounded-md [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:leading-5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-surface [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-4">
        <Markdown
          skipHtml
          components={{
            p: ({ children, ...props }) => (
              <p {...props}>
                {ctx ? replaceEvidenceRefsInNode(children, ctx) : children}
              </p>
            ),
            li: ({ children, ...props }) => (
              <li {...props}>
                {ctx ? replaceEvidenceRefsInNode(children, ctx) : children}
              </li>
            ),
            blockquote: ({ children, ...props }) => (
              <blockquote {...props}>
                {ctx ? replaceEvidenceRefsInNode(children, ctx) : children}
              </blockquote>
            ),
          }}
        >
          {reasoning}
        </Markdown>
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
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
        备选方案
        {formatConfidenceLabel(confidence) && (
          <span className="ml-2 normal-case tracking-normal text-foreground">
            置信度 {formatConfidenceLabel(confidence)}
          </span>
        )}
      </p>
      <ul className="space-y-0.5">
        {alternatives.map((alt) => (
          <li
            key={alt}
            className="flex items-start gap-1.5 text-xs text-foreground"
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
    className: 'text-success',
    Icon: ShieldCheck,
  },
  modify: {
    label: '已修改',
    className: 'text-warning',
    Icon: PencilLine,
  },
  reject: { label: '已拒绝', className: 'text-error', Icon: Ban },
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
        'space-y-2 rounded-card border border-border bg-surface-elevated px-3 py-2',
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
          <span className="text-xs text-muted">处理人 {resolvedBy}</span>
        )}
      </div>

      {feedback && (
        <p className="w-full break-words text-xs text-foreground">{feedback}</p>
      )}

      {modifiedSummary && (
        <div className="rounded-lg border border-border bg-surface px-2.5 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            修改摘要
          </p>
          <p className="mt-1 break-words text-xs text-foreground" data-testid="intervention-modified-content">
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
  executionId?: string
  nodeId?: string
  nodeName?: string
  className?: string
}

export const DecisionAnnotation = memo(function DecisionAnnotation({
  autonomyMode,
  agentDecisionEvidence,
  interventionEvidence,
  showDetails = true,
  executionId,
  nodeId,
  nodeName,
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
          <ReasoningBlock
            reasoning={decision.reasoning}
            executionId={executionId}
            nodeId={nodeId}
            nodeName={nodeName}
          />
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
